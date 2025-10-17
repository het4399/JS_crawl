import { Logger } from '../logging/Logger.js';
import { fetchPsi, DeviceStrategy } from './psiClient.js';
import { saveAudit } from './store.js';
import { CronParser } from '../scheduler/CronParser.js';
import { getDatabase } from '../database/DatabaseService.js';

export interface AuditSchedule {
    id: number;
    name: string;
    description: string;
    urls: string[];
    device: DeviceStrategy;
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface AuditExecution {
    id: number;
    scheduleId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    errorMessage?: string;
    urlsProcessed: number;
    urlsSuccessful: number;
    urlsFailed: number;
    duration: number;
}

export class AuditScheduler {
    private db = getDatabase();
    private logger = Logger.getInstance();
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private activeRuns: Map<number, Promise<void>> = new Map();
    private config = {
        checkIntervalMs: 60000, // Check every minute
        maxConcurrentRuns: 2, // Lower than crawl scheduler since audits are more resource intensive
        retryFailedSchedules: true,
        retryDelayMs: 300000 // 5 minutes
    };

    /**
     * Start the audit scheduler service
     */
    start(): void {
        if (this.isRunning) {
            this.logger.warn('Audit scheduler service is already running');
            return;
        }
        
        this.isRunning = true;
        this.logger.info('Starting audit scheduler service', { config: this.config });
        
        // Check for schedules immediately
        this.checkSchedules();
        
        // Set up interval to check schedules
        this.intervalId = setInterval(() => {
            this.checkSchedules();
        }, this.config.checkIntervalMs);
        
        this.logger.info('Audit scheduler service started');
    }

    /**
     * Stop the audit scheduler service
     */
    stop(): void {
        if (!this.isRunning) {
            this.logger.warn('Audit scheduler service is not running');
            return;
        }
        
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.logger.info('Audit scheduler service stopped');
    }

    /**
     * Create a new audit schedule
     */
    createSchedule(data: Omit<AuditSchedule, 'id' | 'createdAt' | 'totalRuns' | 'successfulRuns' | 'failedRuns'> & { userId?: number }): number {
        // Validate cron expression
        const validation = CronParser.validateCronExpression(data.cronExpression);
        if (!validation.isValid) {
            throw new Error(`Invalid cron expression: ${validation.error}`);
        }
        
        // Calculate next run time
        const nextRun = validation.nextRun ? validation.nextRun.toISOString() : null;
        
        const scheduleId = this.db.insertAuditSchedule({
            name: data.name,
            description: data.description,
            urls: JSON.stringify(data.urls),
            device: data.device,
            cronExpression: data.cronExpression,
            enabled: data.enabled,
            createdAt: new Date().toISOString(),
            lastRun: data.lastRun,
            nextRun: nextRun ?? undefined,
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0
        });
        
        this.logger.info('Audit schedule created', { 
            scheduleId, 
            name: data.name, 
            cronExpression: data.cronExpression,
            urlsCount: data.urls.length
        });
        
        return scheduleId;
    }

    /**
     * Update an existing audit schedule
     */
    updateSchedule(id: number, updates: Partial<AuditSchedule>): void {
        if (updates.cronExpression) {
            const validation = CronParser.validateCronExpression(updates.cronExpression);
            if (!validation.isValid) {
                throw new Error(`Invalid cron expression: ${validation.error}`);
            }
            
            // Recalculate next run time when cron expression changes
            let nextRun = null;
            if (validation.nextRun) {
                try {
                    if (!isNaN(validation.nextRun.getTime())) {
                        nextRun = validation.nextRun.toISOString();
                    }
                } catch (error) {
                    this.logger.error('Error converting next run date to ISO string', error as Error);
                }
            }
            updates.nextRun = nextRun ?? undefined;
        }

        if (updates.urls) {
            updates.urls = updates.urls; // Will be JSON stringified in database
        }
        
        this.db.updateAuditSchedule(id, updates);
        this.logger.info('Audit schedule updated', { scheduleId: id, updates });
    }

    /**
     * Delete an audit schedule
     */
    deleteSchedule(id: number): void {
        this.db.deleteAuditSchedule(id);
        this.logger.info('Audit schedule deleted', { scheduleId: id });
    }

    /**
     * Get all audit schedules
     */
    getAllSchedules(): AuditSchedule[] {
        const schedules = this.db.getAllAuditSchedules();
        return schedules.map(schedule => ({
            ...schedule,
            urls: JSON.parse(schedule.urls)
        }));
    }

    /**
     * Get a specific audit schedule
     */
    getSchedule(id: number): AuditSchedule | null {
        const schedule = this.db.getAuditSchedule(id);
        if (!schedule) return null;
        
        return {
            ...schedule,
            urls: JSON.parse(schedule.urls)
        };
    }

    /**
     * Get enabled schedules that should run now
     */
    getSchedulesToRun(): AuditSchedule[] {
        const now = new Date();
        const schedules = this.db.getEnabledAuditSchedules();
        
        return schedules.filter(schedule => {
            if (!schedule.enabled) return false;
            
            // Check if it's time to run
            return CronParser.shouldRun(schedule.cronExpression, now);
        }).map(schedule => ({
            ...schedule,
            urls: JSON.parse(schedule.urls)
        }));
    }

    /**
     * Check for schedules that should run
     */
    private async checkSchedules(): Promise<void> {
        try {
            const schedulesToRun = this.getSchedulesToRun();
            
            if (schedulesToRun.length === 0) {
                return;
            }
            
            this.logger.info('Found audit schedules to run', { count: schedulesToRun.length });
            
            for (const schedule of schedulesToRun) {
                // Check if we're already running this schedule
                if (this.activeRuns.has(schedule.id)) {
                    this.logger.debug('Audit schedule already running', { scheduleId: schedule.id });
                    continue;
                }
                
                // Check concurrent run limit
                if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
                    this.logger.warn('Max concurrent audit runs reached, skipping schedule', { 
                        scheduleId: schedule.id,
                        activeRuns: this.activeRuns.size
                    });
                    continue;
                }
                
                // Start the schedule
                this.runSchedule(schedule);
            }
        } catch (error) {
            this.logger.error('Error checking audit schedules', error as Error);
        }
    }

    /**
     * Run a specific audit schedule
     */
    private async runSchedule(schedule: AuditSchedule): Promise<void> {
        const runPromise = this.executeSchedule(schedule);
        this.activeRuns.set(schedule.id, runPromise);
        
        try {
            await runPromise;
        } finally {
            this.activeRuns.delete(schedule.id);
        }
    }

    /**
     * Execute an audit schedule
     */
    private async executeSchedule(schedule: AuditSchedule): Promise<void> {
        const startTime = Date.now();
        let executionId: number | null = null;
        
        try {
            this.logger.info('Starting scheduled audit', { 
                scheduleId: schedule.id, 
                name: schedule.name,
                urlsCount: schedule.urls.length,
                device: schedule.device
            });

            // Record execution start
            executionId = this.recordExecution(schedule.id);
            
            let urlsProcessed = 0;
            let urlsSuccessful = 0;
            let urlsFailed = 0;
            
            // Process each URL
            for (const url of schedule.urls) {
                try {
                    this.logger.debug(`Processing URL: ${url}`);
                    
                    const result = await fetchPsi(url, schedule.device, {
                        timeoutMs: 60000, // 1 minute timeout for audits
                        retries: 2,
                        backoffBaseMs: 1000
                    });
                    
                    const parsed = {
                        url: result.url,
                        device: result.device,
                        runAt: result.runAt,
                        field: result.field,
                        lab: result.lab,
                        psiReportUrl: result.psiReportUrl,
                    };
                    
                    saveAudit(result.url, result.device, parsed, result.raw);
                    urlsSuccessful++;
                    
                    this.logger.debug(`Audit completed for ${url}`, {
                        lcp: result.lab?.LCP_ms,
                        tbt: result.lab?.TBT_ms,
                        cls: result.lab?.CLS
                    });
                    
                } catch (error) {
                    this.logger.error(`Audit failed for ${url}`, error as Error);
                    urlsFailed++;
                }
                
                urlsProcessed++;
                
                // Small delay between audits to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Update execution as completed
            const duration = Date.now() - startTime;
            if (executionId) {
                this.updateExecution(executionId, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    duration,
                    urlsProcessed,
                    urlsSuccessful,
                    urlsFailed
                });
            }
            
            // Calculate next run time
            const nextRun = CronParser.validateCronExpression(schedule.cronExpression).nextRun;
            const nextRunString = nextRun ? nextRun.toISOString() : null;
            
            // Update schedule statistics
            this.updateSchedule(schedule.id, {
                lastRun: new Date().toISOString(),
                nextRun: nextRunString ?? undefined,
                totalRuns: schedule.totalRuns + 1,
                successfulRuns: schedule.successfulRuns + 1
            });
            
            this.logger.info('Scheduled audit completed successfully', { 
                scheduleId: schedule.id,
                duration: duration,
                urlsProcessed,
                urlsSuccessful,
                urlsFailed,
                executionId
            });
            
        } catch (error) {
            this.logger.error(
                'Scheduled audit failed',
                error as Error,
                {
                    scheduleId: schedule.id
                }
            );
            
            // Record execution as failed
            const duration = Date.now() - startTime;
            if (executionId) {
                this.updateExecution(executionId, {
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    errorMessage: (error as Error).message,
                    duration,
                    urlsProcessed: 0,
                    urlsSuccessful: 0,
                    urlsFailed: 0
                });
            }
            
            // Calculate next run time
            const nextRun = CronParser.validateCronExpression(schedule.cronExpression).nextRun;
            const nextRunString = nextRun ? nextRun.toISOString() : null;
            
            // Update schedule statistics
            this.updateSchedule(schedule.id, {
                lastRun: new Date().toISOString(),
                nextRun: nextRunString ?? undefined,
                totalRuns: schedule.totalRuns + 1,
                failedRuns: schedule.failedRuns + 1
            });
            
            // Retry logic if enabled
            if (this.config.retryFailedSchedules) {
                this.logger.info('Scheduling retry for failed audit', { 
                    scheduleId: schedule.id,
                    retryDelay: this.config.retryDelayMs
                });
                
                setTimeout(() => {
                    this.logger.info('Retrying failed audit schedule', { scheduleId: schedule.id });
                    this.runSchedule(schedule);
                }, this.config.retryDelayMs);
            }
        }
    }

    /**
     * Record a schedule execution
     */
    private recordExecution(scheduleId: number): number {
        const executionId = this.db.insertAuditExecution({
            scheduleId,
            startedAt: new Date().toISOString(),
            status: 'running',
            urlsProcessed: 0,
            urlsSuccessful: 0,
            urlsFailed: 0,
            duration: 0
        });
        
        this.logger.info('Audit execution recorded', { 
            scheduleId, 
            executionId 
        });
        
        return executionId;
    }

    /**
     * Update execution status
     */
    private updateExecution(executionId: number, updates: Partial<AuditExecution>): void {
        this.db.updateAuditExecution(executionId, updates);
    }

    /**
     * Get execution history for a schedule
     */
    getExecutionHistory(scheduleId: number, limit: number = 50): AuditExecution[] {
        return this.db.getAuditExecutions(scheduleId, limit);
    }

    /**
     * Get all executions
     */
    getAllExecutions(limit: number = 100): AuditExecution[] {
        return this.db.getAllAuditExecutions(limit);
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
        this.logger.info('Audit schedule toggled', { 
            scheduleId: id, 
            enabled: !schedule.enabled 
        });
    }

    /**
     * Manually trigger a schedule
     */
    async triggerSchedule(scheduleId: number): Promise<void> {
        const schedule = this.getSchedule(scheduleId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }
        
        if (!schedule.enabled) {
            throw new Error('Schedule is disabled');
        }
        
        this.logger.info('Manually triggering audit schedule', { scheduleId, name: schedule.name });
        await this.runSchedule(schedule);
    }

    /**
     * Get scheduler status
     */
    getStatus(): {
        isRunning: boolean;
        activeRuns: number;
        maxConcurrentRuns: number;
        checkIntervalMs: number;
    } {
        return {
            isRunning: this.isRunning,
            activeRuns: this.activeRuns.size,
            maxConcurrentRuns: this.config.maxConcurrentRuns,
            checkIntervalMs: this.config.checkIntervalMs
        };
    }
}
