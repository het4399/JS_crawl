import { Logger } from '../logging/Logger.js';
import { fetchPsi, DeviceStrategy } from './psiClient.js';
import { saveAudit } from './store.js';
import { CronParser } from '../scheduler/CronParser.js';
import { getDatabase } from '../database/DatabaseService.js';
import fs from 'fs';
import path from 'path';

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
    status: 'running' | 'completed' | 'failed' | 'auditing';
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
        checkIntervalMs: 30000, // Check every 30 seconds (was 60)
        maxConcurrentRuns: 4, // Increased from 2 to run more audits in parallel
        retryFailedSchedules: true,
        retryDelayMs: 300000, // 5 minutes
        urlBatchSize: 25 // Larger batches for better throughput
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

        // Convert database-compatible updates
        const dbUpdates = { ...updates } as Partial<import('../database/DatabaseService.js').AuditSchedule>;
        if (updates.urls) {
            dbUpdates.urls = JSON.stringify(updates.urls);
        }
        
        this.db.updateAuditSchedule(id, dbUpdates);
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
            // Load devices from config (ignore schedule.device, use config instead)
            let devices: DeviceStrategy[] = [];
            try {
                const configPath = path.resolve(process.cwd(), 'config', 'audits.json');
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (cfg.deviceStrategy?.mobile) devices.push('mobile');
                if (cfg.deviceStrategy?.desktopSamplePercent > 0) devices.push('desktop');
            } catch (e) {
                // Fallback to schedule device if config not found
                devices = [schedule.device];
            }
            
            if (devices.length === 0) {
                devices = [schedule.device]; // Final fallback
            }
            
            this.logger.info('Starting scheduled audit', { 
                scheduleId: schedule.id, 
                name: schedule.name,
                urlsCount: schedule.urls.length,
                devices: devices,
                configDevices: devices.join(',')
            });

            // Record execution start
            executionId = this.recordExecution(schedule.id);
            
            let urlsProcessed = 0;
            let urlsSuccessful = 0;
            let urlsFailed = 0;
            
            // Generate all audit tasks for both/all enabled devices
            const auditTasks: Array<{ url: string; device: DeviceStrategy }> = [];
            
            for (const device of devices) {
                for (const url of schedule.urls) {
                    auditTasks.push({ url, device });
                }
            }
            
            this.logger.info(`Processing ${auditTasks.length} total audits (${schedule.urls.length} URLs × ${devices.length} device(s))`, { 
                scheduleId: schedule.id,
                devices: devices.join(',')
            });
            
            // Process ALL audits in parallel batches
            const batchSize = this.config.urlBatchSize;
            for (let i = 0; i < auditTasks.length; i += batchSize) {
                const batch = auditTasks.slice(i, i + batchSize);
                
                // Process entire batch in parallel (all devices mixed)
                const batchResults = await Promise.allSettled(
                    batch.map(task => this.auditUrlWithCache(task.url, task.device))
                );
                
                for (const result of batchResults) {
                    urlsProcessed++;
                    if (result.status === 'fulfilled' && result.value.success) {
                        urlsSuccessful++;
                    } else {
                        urlsFailed++;
                        if (result.status === 'rejected') {
                            this.logger.error(`Audit failed`, result.reason);
                        }
                    }
                }
                
                this.logger.info(`Batch progress: ${i + batchSize}/${auditTasks.length}`, { 
                    scheduleId: schedule.id,
                    successful: urlsSuccessful,
                    failed: urlsFailed
                });
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
     * Audit a single URL with cache checking
     */
    private async auditUrlWithCache(url: string, device: 'mobile' | 'desktop'): Promise<{ success: boolean }> {
        try {
            // Check for cached result within TTL
            const existingResult = this.db.getAuditResultsByUrl(url, device, 1)[0];
            if (existingResult) {
                const resultAge = Date.now() - new Date(existingResult.run_at).getTime();
                const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
                
                if (resultAge < ttlMs) {
                    this.logger.debug(`Using cached audit for ${url}`, { 
                        ageHours: (resultAge / (60 * 60 * 1000)).toFixed(1)
                    });
                    return { success: true };
                }
            }

            this.logger.debug(`Fetching PSI audit for ${url}`);
            const result = await fetchPsi(url, device, {
                timeoutMs: 35000,
                retries: 2,
                backoffBaseMs: 150,
                useRateLimiter: true
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
            
            this.logger.debug(`Audit successful for ${url}`, {
                lcp: result.lab?.LCP_ms,
                tbt: result.lab?.TBT_ms,
                cls: result.lab?.CLS,
                score: result.lab?.performanceScore
            });
            
            return { success: true };
        } catch (error) {
            this.logger.error(`Audit failed for ${url}`, error as Error);
            return { success: false };
        }
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
