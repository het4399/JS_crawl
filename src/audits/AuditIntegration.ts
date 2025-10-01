import { Logger } from '../logging/Logger.js';
import { AuditScheduler } from './AuditScheduler.js';
import { getDatabase } from '../database/DatabaseService.js';

export class AuditIntegration {
    private auditScheduler: AuditScheduler;
    private logger: Logger;
    private db = getDatabase();

    constructor() {
        this.auditScheduler = new AuditScheduler();
        this.logger = Logger.getInstance();
    }

    /**
     * Start the audit scheduler
     */
    start(): void {
        this.auditScheduler.start();
        this.logger.info('Audit integration started');
    }

    /**
     * Stop the audit scheduler
     */
    stop(): void {
        this.auditScheduler.stop();
        this.logger.info('Audit integration stopped');
    }

    /**
     * Create audit schedules for URLs found during a crawl session
     */
    async createAuditSchedulesForSession(sessionId: number, options: {
        device?: 'mobile' | 'desktop';
        cronExpression?: string;
        scheduleName?: string;
        maxUrls?: number;
    } = {}): Promise<number[]> {
        try {
            // Get URLs from the crawl session
            const pages = this.db.getPages(sessionId);
            const urls = pages
                .filter(page => page.success && page.statusCode === 200)
                .map(page => page.url)
                .slice(0, options.maxUrls || 50); // Limit to prevent too many audits

            if (urls.length === 0) {
                this.logger.warn('No valid URLs found for audit scheduling', { sessionId });
                return [];
            }

            // Create audit schedule
            const scheduleName = options.scheduleName || `Auto-generated from crawl session ${sessionId}`;
            const scheduleId = this.auditScheduler.createSchedule({
                name: scheduleName,
                description: `Automatically generated audit schedule for ${urls.length} URLs from crawl session ${sessionId}`,
                urls,
                device: options.device || 'desktop',
                cronExpression: options.cronExpression || '0 2 * * *', // Daily at 2 AM
                enabled: true
            });

            this.logger.info('Created audit schedule for crawl session', {
                sessionId,
                scheduleId,
                urlCount: urls.length,
                device: options.device || 'desktop'
            });

            return [scheduleId];
        } catch (error) {
            this.logger.error('Failed to create audit schedules for session', error as Error, { sessionId });
            return [];
        }
    }

    /**
     * Create audit schedules for specific URLs
     */
    async createAuditScheduleForUrls(urls: string[], options: {
        name: string;
        description?: string;
        device?: 'mobile' | 'desktop';
        cronExpression?: string;
        enabled?: boolean;
    }): Promise<number> {
        const scheduleId = this.auditScheduler.createSchedule({
            name: options.name,
            description: options.description || `Audit schedule for ${urls.length} URLs`,
            urls,
            device: options.device || 'desktop',
            cronExpression: options.cronExpression || '0 2 * * *',
            enabled: options.enabled !== false
        });

        this.logger.info('Created audit schedule for URLs', {
            scheduleId,
            urlCount: urls.length,
            device: options.device || 'desktop'
        });

        return scheduleId;
    }

    /**
     * Get audit scheduler instance
     */
    getAuditScheduler(): AuditScheduler {
        return this.auditScheduler;
    }

    /**
     * Get all audit schedules
     */
    getAllSchedules() {
        return this.auditScheduler.getAllSchedules();
    }

    /**
     * Get audit schedule by ID
     */
    getSchedule(id: number) {
        return this.auditScheduler.getSchedule(id);
    }

    /**
     * Update audit schedule
     */
    updateSchedule(id: number, updates: any) {
        return this.auditScheduler.updateSchedule(id, updates);
    }

    /**
     * Delete audit schedule
     */
    deleteSchedule(id: number) {
        return this.auditScheduler.deleteSchedule(id);
    }

    /**
     * Toggle audit schedule
     */
    toggleSchedule(id: number) {
        return this.auditScheduler.toggleSchedule(id);
    }

    /**
     * Trigger audit schedule manually
     */
    async triggerSchedule(id: number) {
        return this.auditScheduler.triggerSchedule(id);
    }

    /**
     * Get audit executions
     */
    getExecutions(limit: number = 100) {
        return this.auditScheduler.getAllExecutions(limit);
    }

    /**
     * Get audit scheduler status
     */
    getStatus() {
        return this.auditScheduler.getStatus();
    }
}
