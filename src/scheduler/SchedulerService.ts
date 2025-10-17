import { ScheduleManager, CrawlSchedule } from './ScheduleManager.js';
import { Logger } from '../logging/Logger.js';
import { runCrawl } from '../crawler.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { CronParser } from './CronParser.js';
import { Mailer } from '../utils/Mailer.js';

export interface SchedulerConfig {
    checkIntervalMs: number;
    maxConcurrentRuns: number;
    retryFailedSchedules: boolean;
    retryDelayMs: number;
}

export class SchedulerService {
    private scheduleManager: ScheduleManager;
    private logger: Logger;
    private metricsCollector: MetricsCollector;
    private mailer: Mailer;
    private config: SchedulerConfig;
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private activeRuns: Map<number, Promise<void>> = new Map();
    
    constructor(config: SchedulerConfig = {
        checkIntervalMs: 60000, // Check every minute
        maxConcurrentRuns: 3,
        retryFailedSchedules: true,
        retryDelayMs: 300000 // 5 minutes
    }) {
        this.scheduleManager = new ScheduleManager();
        this.logger = Logger.getInstance();
        this.metricsCollector = new MetricsCollector();
        this.config = config;
        this.mailer = Mailer.getInstance();
    }
    
    /**
     * Start the scheduler service
     */
    start(): void {
        if (this.isRunning) {
            this.logger.warn('Scheduler service is already running');
            return;
        }
        
        this.isRunning = true;
		this.logger.info('Starting scheduler service', { config: this.config });

		// Log time context for cron vs stored timestamps
		try {
			const localTime = new Date().toString();
			const utcTime = new Date().toISOString();
			// Intl timezone may not be available in all environments, so wrap in try
			let timeZone: string | undefined;
			try {
				timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			} catch {}
			this.logger.info('Cron uses server local time; stored timestamps are UTC (ISO)', {
				timeZone: timeZone || 'unknown',
				serverTimeLocal: localTime,
				serverTimeUTC: utcTime,
			});
		} catch {}
        
        // Check for schedules immediately
        this.checkSchedules();
        
        // Set up interval to check schedules
        this.intervalId = setInterval(() => {
            this.checkSchedules();
        }, this.config.checkIntervalMs);
        
        this.logger.info('Scheduler service started');
    }
    
    /**
     * Stop the scheduler service
     */
    stop(): void {
        if (!this.isRunning) {
            this.logger.warn('Scheduler service is not running');
            return;
        }
        
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.logger.info('Scheduler service stopped');
    }
    
    /**
     * Check for schedules that should run
     */
    private async checkSchedules(): Promise<void> {
        try {
            const schedulesToRun = this.scheduleManager.getSchedulesToRun();
            
            if (schedulesToRun.length === 0) {
                return;
            }
            
            this.logger.info('Found schedules to run', { count: schedulesToRun.length });
            
            for (const schedule of schedulesToRun) {
                // Check if we're already running this schedule
                if (this.activeRuns.has(schedule.id)) {
                    this.logger.debug('Schedule already running', { scheduleId: schedule.id });
                    continue;
                }
                
                // Check concurrent run limit
                if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
                    this.logger.warn('Max concurrent runs reached, skipping schedule', { 
                        scheduleId: schedule.id,
                        activeRuns: this.activeRuns.size
                    });
                    continue;
                }
                
                // Start the schedule
                this.runSchedule(schedule);
            }
        } catch (error) {
            this.logger.error('Error checking schedules', error as Error);
        }
    }
    
    /**
     * Run a specific schedule
     */
    private async runSchedule(schedule: CrawlSchedule): Promise<void> {
        const runPromise = this.executeSchedule(schedule);
        this.activeRuns.set(schedule.id, runPromise);
        
        try {
            await runPromise;
        } finally {
            this.activeRuns.delete(schedule.id);
        }
    }
    
    /**
     * Execute a schedule
     */
    private async executeSchedule(schedule: CrawlSchedule): Promise<void> {
        const startTime = Date.now();
        let executionId: number | null = null;
        
        try {
            this.logger.info('Starting scheduled crawl', { 
                scheduleId: schedule.id, 
                name: schedule.name,
                startUrl: schedule.startUrl 
            });

            // Notify start
            void this.mailer.send(
                `Crawler started: ${schedule.name}`,
                `Schedule: ${schedule.name} (ID: ${schedule.id})\nURL: ${schedule.startUrl}\nStarted: ${new Date().toString()}\nMode: ${schedule.mode}\nConcurrency: ${schedule.maxConcurrency}`
            );
            
            // Run the crawl first
            await runCrawl({
                startUrl: schedule.startUrl,
                allowSubdomains: schedule.allowSubdomains,
                maxConcurrency: schedule.maxConcurrency,
                perHostDelayMs: 1000,
                denyParamPrefixes: ['utm_', 'fbclid', 'gclid'],
                mode: schedule.mode,
                scheduleId: schedule.id,
                userId: schedule.userId
            }, {
                onLog: (message) => {
                    this.logger.info(`[Schedule ${schedule.name}] ${message}`);
                },
                onPage: (url) => {
                    this.logger.debug(`[Schedule ${schedule.name}] Page processed: ${url}`);
                },
                onDone: (count) => {
                    this.logger.info(`[Schedule ${schedule.name}] Crawl completed: ${count} pages`);
                }
            }, this.metricsCollector);
            
            // Record execution after crawl completes
            const duration = Date.now() - startTime;
            const db = this.scheduleManager.getDatabase();
            const latestSession = db.getLatestCrawlSession();
            const sessionId = latestSession ? latestSession.id : 0;
            
            executionId = this.scheduleManager.recordExecution(schedule.id, sessionId);
            
            // Update execution as completed
            if (executionId) {
                // Compute pages/resources for this session
                const pagesCrawled = sessionId ? db.getPageCount(sessionId) : 0;
                const resourcesFound = sessionId ? db.getResourceCount(sessionId) : 0;
                this.scheduleManager.updateExecution(executionId, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    duration,
                    pagesCrawled,
                    resourcesFound
                });

                // Notify success
                void this.mailer.send(
                    `Crawler completed: ${schedule.name}`,
                    `Schedule: ${schedule.name} (ID: ${schedule.id})\nURL: ${schedule.startUrl}\nStatus: completed\nDuration: ${Math.round(duration/1000)}s\nPages: ${pagesCrawled}\nResources: ${resourcesFound}\nFinished: ${new Date().toString()}`
                );
            }
            
            // Calculate next run time
            const nextRun = CronParser.validateCronExpression(schedule.cronExpression).nextRun;
            const nextRunString = nextRun ? nextRun.toISOString() : null;
            
            // Update schedule statistics
            this.scheduleManager.updateSchedule(schedule.id, {
                lastRun: new Date().toISOString(),
                nextRun: nextRunString ?? undefined,
                totalRuns: schedule.totalRuns + 1,
                successfulRuns: schedule.successfulRuns + 1
            });
            
            this.logger.info('Scheduled crawl completed successfully', { 
                scheduleId: schedule.id,
                duration: duration,
                executionId
            });
            
        } catch (error) {
            this.logger.error(
                'Scheduled crawl failed',
                error as Error,
                {
                    scheduleId: schedule.id
                }
            );
            
            // Record execution as failed
            const duration = Date.now() - startTime;
            const db = this.scheduleManager.getDatabase();
            const latestSession = db.getLatestCrawlSession();
            const sessionId = latestSession ? latestSession.id : 0;
            
            executionId = this.scheduleManager.recordExecution(schedule.id, sessionId);
            
            if (executionId) {
                // Compute whatever was crawled before failure
                const pagesCrawled = sessionId ? db.getPageCount(sessionId) : 0;
                const resourcesFound = sessionId ? db.getResourceCount(sessionId) : 0;
                this.scheduleManager.updateExecution(executionId, {
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    errorMessage: (error as Error).message,
                    duration,
                    pagesCrawled,
                    resourcesFound
                });

                // Notify failure
                void this.mailer.send(
                    `Crawler failed: ${schedule.name}`,
                    `Schedule: ${schedule.name} (ID: ${schedule.id})\nURL: ${schedule.startUrl}\nStatus: failed\nError: ${(error as Error).message}\nDuration: ${Math.round(duration/1000)}s\nPages: ${pagesCrawled}\nResources: ${resourcesFound}\nFinished: ${new Date().toString()}`
                );
            }
            
            // Calculate next run time
            const nextRun = CronParser.validateCronExpression(schedule.cronExpression).nextRun;
            const nextRunString = nextRun ? nextRun.toISOString() : null;
            
            // Update schedule statistics
            this.scheduleManager.updateSchedule(schedule.id, {
                lastRun: new Date().toISOString(),
                nextRun: nextRunString ?? undefined,
                totalRuns: schedule.totalRuns + 1,
                failedRuns: schedule.failedRuns + 1
            });
            
            // Retry logic if enabled
            if (this.config.retryFailedSchedules) {
                this.logger.info('Scheduling retry for failed crawl', { 
                    scheduleId: schedule.id,
                    retryDelay: this.config.retryDelayMs
                });
                
                setTimeout(() => {
                    this.logger.info('Retrying failed schedule', { scheduleId: schedule.id });
                    this.runSchedule(schedule);
                }, this.config.retryDelayMs);
            }
        }
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
    
    /**
     * Get schedule manager instance
     */
    getScheduleManager(): ScheduleManager {
        return this.scheduleManager;
    }
    
    /**
     * Manually trigger a schedule
     */
    async triggerSchedule(scheduleId: number): Promise<void> {
        const schedule = this.scheduleManager.getSchedule(scheduleId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }
        
        if (!schedule.enabled) {
            throw new Error('Schedule is disabled');
        }
        
        this.logger.info('Manually triggering schedule', { scheduleId, name: schedule.name });
        await this.runSchedule(schedule);
    }
    
    /**
     * Update scheduler configuration
     */
    updateConfig(newConfig: Partial<SchedulerConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Scheduler configuration updated', { config: this.config });
        
        // Restart scheduler if running
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }
}
