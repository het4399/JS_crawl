import { getDatabase } from '../database/DatabaseService.js';
import { CronParser, CronValidation } from './CronParser.js';
import { Logger } from '../logging/Logger.js';

export interface CrawlSchedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: 'html' | 'js' | 'auto';
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface ScheduleExecution {
    id: number;
    scheduleId: number;
    sessionId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    errorMessage?: string;
    pagesCrawled: number;
    resourcesFound: number;
    duration: number;
}

export class ScheduleManager {
    private db = getDatabase();
    private logger = Logger.getInstance();
    
    /**
     * Create a new crawl schedule
     */
    createSchedule(data: Omit<CrawlSchedule, 'id' | 'createdAt' | 'totalRuns' | 'successfulRuns' | 'failedRuns'>): number {
        // Validate cron expression
        const validation = CronParser.validateCronExpression(data.cronExpression);
        if (!validation.isValid) {
            throw new Error(`Invalid cron expression: ${validation.error}`);
        }
        
        // Calculate next run time
        const nextRun = validation.nextRun ? validation.nextRun.toISOString() : null;
        
        const scheduleId = this.db.insertCrawlSchedule({
            name: data.name,
            description: data.description,
            startUrl: data.startUrl,
            allowSubdomains: data.allowSubdomains,
            maxConcurrency: data.maxConcurrency,
            mode: data.mode,
            cronExpression: data.cronExpression,
            enabled: data.enabled,
            createdAt: new Date().toISOString(),
            lastRun: data.lastRun,
            nextRun: nextRun ?? undefined,
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0
        });
        
        this.logger.info('Crawl schedule created', { 
            scheduleId, 
            name: data.name, 
            cronExpression: data.cronExpression 
        });
        
        return scheduleId;
    }
    
    /**
     * Update an existing schedule
     */
    updateSchedule(id: number, updates: Partial<CrawlSchedule>): void {
        if (updates.cronExpression) {
            const validation = CronParser.validateCronExpression(updates.cronExpression);
            if (!validation.isValid) {
                throw new Error(`Invalid cron expression: ${validation.error}`);
            }
            
            // Recalculate next run time when cron expression changes
            let nextRun = null;
            if (validation.nextRun) {
                try {
                    // Check if the date is valid
                    if (!isNaN(validation.nextRun.getTime())) {
                        nextRun = validation.nextRun.toISOString();
                    } else {
                        this.logger.warn('Invalid next run date calculated', { 
                            scheduleId: id, 
                            cronExpression: updates.cronExpression,
                            nextRun: validation.nextRun 
                        });
                    }
                } catch (error) {
                    this.logger.error(
                        'Error converting next run date to ISO string',
                        error as Error,
                        {
                            scheduleId: id,
                            cronExpression: updates.cronExpression
                        }
                    );
                }
            }
            updates.nextRun = nextRun ?? undefined;
        }
        
        this.db.updateCrawlSchedule(id, updates);
        this.logger.info('Crawl schedule updated', { scheduleId: id, updates });
    }
    
    /**
     * Delete a schedule
     */
    deleteSchedule(id: number): void {
        this.db.deleteCrawlSchedule(id);
        this.logger.info('Crawl schedule deleted', { scheduleId: id });
    }
    
    /**
     * Get all schedules
     */
    getAllSchedules(): CrawlSchedule[] {
        return this.db.getAllCrawlSchedules();
    }
    
    /**
     * Get a specific schedule
     */
    getSchedule(id: number): CrawlSchedule | null {
        return this.db.getCrawlSchedule(id);
    }
    
    /**
     * Get enabled schedules that should run now
     */
    getSchedulesToRun(): CrawlSchedule[] {
        const now = new Date();
        const schedules = this.db.getEnabledCrawlSchedules();
        
        return schedules.filter(schedule => {
            if (!schedule.enabled) return false;
            
            // Check if it's time to run
            return CronParser.shouldRun(schedule.cronExpression, now);
        });
    }
    
    /**
     * Record a schedule execution
     */
    recordExecution(scheduleId: number, sessionId: number): number {
        const executionId = this.db.insertScheduleExecution({
            scheduleId,
            sessionId,
            startedAt: new Date().toISOString(),
            status: 'running',
            pagesCrawled: 0,
            resourcesFound: 0,
            duration: 0
        });
        
        this.logger.info('Schedule execution recorded', { 
            scheduleId, 
            sessionId, 
            executionId 
        });
        
        return executionId;
    }
    
    /**
     * Update execution status
     */
    updateExecution(executionId: number, updates: Partial<ScheduleExecution>): void {
        this.db.updateScheduleExecution(executionId, updates);
    }
    
    /**
     * Get execution history for a schedule
     */
    getExecutionHistory(scheduleId: number, limit: number = 50): ScheduleExecution[] {
        return this.db.getScheduleExecutions(scheduleId, limit);
    }
    
    /**
     * Get all executions
     */
    getAllExecutions(limit: number = 100): ScheduleExecution[] {
        return this.db.getAllScheduleExecutions(limit);
    }
    
    /**
     * Toggle schedule enabled/disabled
     */
    toggleSchedule(id: number): void {
        const schedule = this.getSchedule(id);
        if (!schedule) {
            throw new Error('Schedule not found');
        }
        
        this.updateSchedule(id, { enabled: !schedule.enabled });
        this.logger.info('Schedule toggled', { 
            scheduleId: id, 
            enabled: !schedule.enabled 
        });
    }
    
    /**
     * Get schedule statistics
     */
    getScheduleStats(scheduleId: number): {
        totalRuns: number;
        successfulRuns: number;
        failedRuns: number;
        successRate: number;
        averageDuration: number;
        lastRun?: string;
        nextRun?: string;
    } {
        const schedule = this.getSchedule(scheduleId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }
        
        const executions = this.getExecutionHistory(scheduleId, 100);
        const completedExecutions = executions.filter(e => e.status === 'completed' || e.status === 'failed');
        
        const averageDuration = completedExecutions.length > 0
            ? completedExecutions.reduce((sum, e) => sum + e.duration, 0) / completedExecutions.length
            : 0;
        
        return {
            totalRuns: schedule.totalRuns,
            successfulRuns: schedule.successfulRuns,
            failedRuns: schedule.failedRuns,
            successRate: schedule.totalRuns > 0 ? (schedule.successfulRuns / schedule.totalRuns) * 100 : 0,
            averageDuration,
            lastRun: schedule.lastRun,
            nextRun: schedule.nextRun
        };
    }
    
    /**
     * Validate cron expression
     */
    validateCronExpression(cronExpression: string): CronValidation {
        return CronParser.validateCronExpression(cronExpression);
    }
    
    /**
     * Get human-readable description of cron expression
     */
    getCronDescription(cronExpression: string): string {
        return CronParser.getDescription(cronExpression);
    }
    
    /**
     * Get database instance
     */
    getDatabase() {
        return this.db;
    }
}
