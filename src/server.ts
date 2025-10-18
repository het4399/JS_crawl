import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCrawl, cancelAudits, resetAuditCancellation } from './crawler.js';
import { monitoringRoutes, healthChecker, metricsCollector } from './routes/monitoring.routes.js';
import { auditsRoutes } from './routes/audits.routes.js';
import seoRoutes from './routes/seo.routes.js';
import seoRedisQueueRoutes from './routes/seo-redis-queue.routes.js';
import linksRoutes from './routes/links.routes.js';
import aeoRoutes from './routes/aeo.routes.js';
import authRoutes from './routes/auth.routes.js';
import { authenticateUser, checkUsageLimit, optionalAuth } from './auth/authMiddleware.js';
import { Logger } from './logging/Logger.js';
import { SchedulerService } from './scheduler/SchedulerService.js';
import { getDatabase } from './database/DatabaseService.js';
import { AuditIntegration } from './audits/AuditIntegration.js';

type Client = {
    id: number;
    res: express.Response;
    userId: number;
};

const app = express();
const logger = Logger.getInstance();

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true // Allow cookies to be sent
}));
app.use(cookieParser());
// Increase JSON body limit; configurable via BODY_LIMIT (default 5mb)
const bodyLimit = process.env.BODY_LIMIT || '5mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// Serve built frontend (Vite output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distFrontendPath = path.resolve(__dirname, '../dist-frontend');
app.use(express.static(distFrontendPath));

// Add monitoring routes
app.use('/api', monitoringRoutes);
app.use('/api', auditsRoutes);
app.use('/api/auth', authRoutes); // Authentication routes
app.use(seoRoutes);
app.use(seoRedisQueueRoutes);
app.use(linksRoutes);
app.use('/aeo', aeoRoutes);

// Cancel audits endpoint - moved before static file serving
// app.post('/cancel-audits', (req, res) => {
//     try {
//         console.log('Cancel audits endpoint called');
//         cancelAudits();
//         logger.info('Audit cancellation requested by user');
        
//         const response = { 
//             message: 'Audit cancellation requested', 
//             timestamp: new Date().toISOString(),
//             success: true
//         };
        
//         console.log('Sending response:', response);
//         res.status(200).json(response);
//     } catch (error) {
//         console.error('Error in cancel audits:', error);
//         logger.error('Failed to cancel audits', error as Error);
//         res.status(500).json({ 
//             error: 'Failed to cancel audits', 
//             details: (error as Error).message,
//             success: false
//         });
//     }
// });

// Also add it to API routes for consistency
app.post('/api/cancel-audits', (req, res) => {
    try {
        console.log('Cancel audits API endpoint called');
        cancelAudits();
        logger.info('Audit cancellation requested by user');
        
        const response = { 
            message: 'Audit cancellation requested', 
            timestamp: new Date().toISOString(),
            success: true
        };
        
        console.log('Sending response:', response);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error in cancel audits:', error);
        logger.error('Failed to cancel audits', error as Error);
        res.status(500).json({ 
            error: 'Failed to cancel audits', 
            details: (error as Error).message,
            success: false
        });
    }
});

// Schedule management routes (protected)
app.get('/api/schedules', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const allSchedules = scheduleManager.getAllSchedules();
        
        // Filter schedules by user (admins can see all)
        const schedules = req.user!.role === 'admin' 
            ? allSchedules 
            : allSchedules.filter((s: any) => s.userId === userId);
        
        res.json({ schedules });
    } catch (error) {
        logger.error('Failed to get schedules', error as Error);
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

app.post('/api/schedules', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        
        // Add userId to schedule data
        const scheduleData = { ...req.body, userId };
        const scheduleId = scheduleManager.createSchedule(scheduleData);
        
        logger.info('Schedule created', { userId, scheduleId });
        res.json({ id: scheduleId, message: 'Schedule created successfully' });
    } catch (error) {
        logger.error('Failed to create schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.get('/api/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can access all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json({ schedule });
    } catch (error) {
        logger.error('Failed to get schedule', error as Error);
        res.status(500).json({ error: 'Failed to get schedule' });
    }
});

app.put('/api/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can update all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        scheduleManager.updateSchedule(parseInt(req.params.id), req.body);
        res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
        logger.error('Failed to update schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.delete('/api/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can delete all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        scheduleManager.deleteSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete schedule', error as Error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

app.post('/api/schedules/:id/toggle', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can toggle all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        scheduleManager.toggleSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule toggled successfully' });
    } catch (error) {
        logger.error('Failed to toggle schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

app.post('/api/schedules/:id/trigger', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can trigger all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await schedulerService.triggerSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule triggered successfully' });
    } catch (error) {
        logger.error('Failed to trigger schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

// Crawl history endpoint
app.get('/api/crawl-history', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
        
        const db = getDatabase();
        const history = db.getUserCrawlSessionsWithResults(userId, limit, offset);
        
        res.json({
            success: true,
            history,
            pagination: {
                limit,
                offset,
                hasMore: history.length === limit
            }
        });
    } catch (error) {
        logger.error('Failed to get crawl history', error as Error);
        res.status(500).json({ error: 'Failed to get crawl history' });
    }
});

app.get('/api/schedules/:id/executions', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = scheduleManager.getExecutionHistory(parseInt(req.params.id), limit);
        res.json({ executions });
    } catch (error) {
        logger.error('Failed to get schedule executions', error as Error);
        res.status(500).json({ error: 'Failed to get schedule executions' });
    }
});

app.get('/api/schedules/:id/stats', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        
        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const stats = scheduleManager.getScheduleStats(parseInt(req.params.id));
        res.json({ stats });
    } catch (error) {
        logger.error('Failed to get schedule stats', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});


app.get('/api/scheduler/status', authenticateUser, (req, res) => {
    try {
        const status = schedulerService.getStatus();
        res.json({ status });
    } catch (error) {
        logger.error('Failed to get scheduler status', error as Error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

app.post('/api/scheduler/validate-cron', authenticateUser, (req, res) => {
    try {
        const { cronExpression } = req.body;
        if (!cronExpression) {
            return res.status(400).json({ error: 'cronExpression is required' });
        }
        
        const scheduleManager = schedulerService.getScheduleManager();
        const validation = scheduleManager.validateCronExpression(cronExpression);
        const description = scheduleManager.getCronDescription(cronExpression);
        
        res.json({ validation, description });
    } catch (error) {
        logger.error('Failed to validate cron expression', error as Error);
        res.status(500).json({ error: 'Failed to validate cron expression' });
    }
});

let nextClientId = 1;
const clients: Client[] = [];

// Updated to support user-specific events
function sendEvent(data: unknown, event: string = 'message', userId?: number) {
    const jsonString = JSON.stringify(data);
    const payload = `event: ${event}\ndata: ${jsonString}\n\n`;
    console.log('sendEvent data:', data);
    console.log('sendEvent userId:', userId);
    
    // If userId is specified, only send to that user's clients
    const targetClients = userId 
        ? clients.filter(c => c.userId === userId)
        : clients; // Fallback to broadcast if no userId (for backwards compatibility)
    
    for (const c of targetClients) {
        try {
            c.res.write(payload);
        } catch (error) {
            console.error('Failed to write to client:', error);
        }
    }
    
    if (userId) {
        console.log(`Event sent to ${targetClients.length} client(s) for user ${userId}`);
    }
}

// Protected SSE endpoint - requires authentication
app.get('/events', authenticateUser, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders?.();
    res.write('\n');

    const id = nextClientId++;
    const userId = req.user!.userId; // Get authenticated user ID
    
    clients.push({ id, res, userId });
    logger.info(`SSE client connected: ${id} for user ${userId}`);

    // Send initial connection confirmation
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id, userId })}\n\n`);

    req.on('close', () => {
        const idx = clients.findIndex((c) => c.id === id);
        if (idx !== -1) {
            clients.splice(idx, 1);
            logger.info(`SSE client disconnected: ${id} for user ${userId}`);
        }
    });
});

app.post('/crawl', 
    authenticateUser,              // Require authentication
    checkUsageLimit('crawl'),      // Check daily usage limit
    async (req, res) => {
    const { url, allowSubdomains, maxConcurrency, mode, runAudits, auditDevice, captureLinkDetails } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Normalize and validate URL input
    const normalizeUrlInput = (input: string): string => {
        const trimmed = String(input).trim();
        if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
        return trimmed;
    };

    const safeUrl = normalizeUrlInput(url);
    try {
        // Validate
        // eslint-disable-next-line no-new
        new URL(safeUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid URL. Please include a valid domain (e.g. https://example.com)' });
    }

    // Block manual crawl if the same URL is already running
    try {
        const db = getDatabase();
        const running = db.getRunningSessionByUrl(safeUrl);
        if (running) {
            return res.status(409).json({
                error: 'A crawl for this URL is already running',
                runningSession: { id: running.id, startedAt: (running as any).started_at ?? running.startedAt },
            });
        }
    } catch (e) {
        logger.warn('Failed to check running session before manual crawl', e as Error);
    }

    const requestId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userId = req.user!.userId; // Get authenticated user ID
    
    logger.info('Crawl request received', { url: safeUrl, userId, allowSubdomains, maxConcurrency, mode }, requestId);
    
    res.json({ ok: true, requestId, url: safeUrl });

    // Update health checker
    healthChecker.recordCrawlStart();
    healthChecker.setActiveCrawls(1);

    // Kick off crawl in background
    void (async () => {
        const startTime = Date.now();
        const db = getDatabase();
        
        sendEvent({ type: 'log', message: `Starting crawl: ${url}` }, 'log', userId);
        
        try {
            await runCrawl({
                startUrl: safeUrl,
                allowSubdomains: true,
                maxConcurrency: 150,
                perHostDelayMs: Number(process.env.CRAWL_PER_HOST_DELAY_MS) || 150,
                denyParamPrefixes: (process.env.DENY_PARAMS || 'utm_,session,sort,filter,ref,fbclid,gclid')
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                mode: 'html',
                userId: userId,
                runAudits: Boolean(runAudits),
                auditDevice: auditDevice === 'mobile' ? 'mobile' : 'desktop',
                captureLinkDetails: Boolean(captureLinkDetails),
            }, {
                onLog: (msg) => {
                    sendEvent({ type: 'log', message: msg }, 'log', userId);
                    logger.info(msg, {}, requestId);
                },
                onPage: (urlFound) => {
                    sendEvent({ type: 'page', url: urlFound }, 'page', userId);
                    logger.debug('Page discovered', { url: urlFound }, requestId);
                },
                onDone: async (count) => {
                    const duration = Date.now() - startTime;
                    const durationSeconds = Math.max(1, Math.floor(duration / 1000));
                    const pagesPerSecond = parseFloat((count / (duration / 1000)).toFixed(2));
                    
                    const eventData = { 
                        type: 'done', 
                        count: count, 
                        duration: durationSeconds, 
                        pagesPerSecond: pagesPerSecond
                    };
                    
                    console.log('Sending done event:', eventData);
                    console.log('Duration calculation:', { startTime, currentTime: Date.now(), duration, durationSeconds, pagesPerSecond });
                    sendEvent(eventData, 'done', userId);
                    
                    logger.info('Crawl completed', { 
                        userId,
                        totalPages: count, 
                        duration: `${duration}ms`,
                        pagesPerSecond: pagesPerSecond
                    }, requestId);
                    
                    // Track user usage
                    try {
                        db.recordUserUsage(userId, 'crawl', 1);
                        logger.info('User usage tracked', { userId, action: 'crawl' });
                    } catch (error) {
                        logger.error('Failed to track user usage', error as Error);
                    }
                    
                    // Update health checker
                    healthChecker.setActiveCrawls(0);
                },
                onAuditStart: (url) => {
                    sendEvent({ type: 'audit-start', url }, 'audit', userId);
                    logger.info(`Starting audit for ${url}`, {}, requestId);
                },
                onAuditComplete: (url, success, lcp, tbt, cls, performanceScore) => {
                    sendEvent({ 
                        type: 'audit-complete', 
                        url, 
                        success, 
                        lcp, 
                        tbt, 
                        cls, 
                        performanceScore 
                    }, 'audit', userId);
                    logger.info(`Audit completed for ${url}`, { success, lcp, tbt, cls, performanceScore }, requestId);
                },
                onAuditResults: (results) => {
                    sendEvent({ type: 'audit-results', results }, 'audit', userId);
                    logger.info('Audit results received', { resultCount: results.length }, requestId);
                },
            }, metricsCollector);
        } catch (e) {
            const error = e as Error;
            const duration = Date.now() - startTime;
            sendEvent({ type: 'log', message: `Error: ${error.message}` }, 'log', userId);
            logger.error('Crawl failed', error, { duration: `${duration}ms` }, requestId);
            healthChecker.recordError(error.message);
            healthChecker.setActiveCrawls(0);
        }
    })();
});

// Initialize scheduler service
const schedulerService = new SchedulerService({
    checkIntervalMs: 60000, // Check every minute
    maxConcurrentRuns: 3,
    retryFailedSchedules: true,
    retryDelayMs: 300000 // 5 minutes
});

const port = Number(process.env.PORT) || 3004;
const server = app.listen(port, () => {
    logger.info(`Server started`, { port, environment: process.env.NODE_ENV || 'development' });
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Metrics: http://localhost:${port}/api/metrics`);
    console.log(`Logs: http://localhost:${port}/api/logs`);
    
    // Start scheduler service
    schedulerService.start();
    console.log('Scheduler service started');
    
    // Start audit integration
    const auditIntegration = new AuditIntegration();
    auditIntegration.start();
    console.log('Audit integration started');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    schedulerService.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    schedulerService.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});


