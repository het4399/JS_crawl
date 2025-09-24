import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCrawl } from './crawler.js';
import { monitoringRoutes, healthChecker, metricsCollector } from './routes/monitoring.routes.js';
import { Logger } from './logging/Logger.js';
import { SchedulerService } from './scheduler/SchedulerService.js';

type Client = {
    id: number;
    res: express.Response;
};

const app = express();
const logger = Logger.getInstance();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve built frontend (Vite output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distFrontendPath = path.resolve(__dirname, '../dist-frontend');
app.use(express.static(distFrontendPath));

// Add monitoring routes
app.use('/api', monitoringRoutes);

// Schedule management routes
app.get('/api/schedules', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        const schedules = scheduleManager.getAllSchedules();
        res.json({ schedules });
    } catch (error) {
        logger.error('Failed to get schedules', error as Error);
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

app.post('/api/schedules', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        const scheduleId = scheduleManager.createSchedule(req.body);
        res.json({ id: scheduleId, message: 'Schedule created successfully' });
    } catch (error) {
        logger.error('Failed to create schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.get('/api/schedules/:id', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id));
        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        res.json({ schedule });
    } catch (error) {
        logger.error('Failed to get schedule', error as Error);
        res.status(500).json({ error: 'Failed to get schedule' });
    }
});

app.put('/api/schedules/:id', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        scheduleManager.updateSchedule(parseInt(req.params.id), req.body);
        res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
        logger.error('Failed to update schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.delete('/api/schedules/:id', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        scheduleManager.deleteSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete schedule', error as Error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

app.post('/api/schedules/:id/toggle', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        scheduleManager.toggleSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule toggled successfully' });
    } catch (error) {
        logger.error('Failed to toggle schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

app.post('/api/schedules/:id/trigger', async (req, res) => {
    try {
        await schedulerService.triggerSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule triggered successfully' });
    } catch (error) {
        logger.error('Failed to trigger schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.get('/api/schedules/:id/executions', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = scheduleManager.getExecutionHistory(parseInt(req.params.id), limit);
        res.json({ executions });
    } catch (error) {
        logger.error('Failed to get schedule executions', error as Error);
        res.status(500).json({ error: 'Failed to get schedule executions' });
    }
});

app.get('/api/schedules/:id/stats', (req, res) => {
    try {
        const scheduleManager = schedulerService.getScheduleManager();
        const stats = scheduleManager.getScheduleStats(parseInt(req.params.id));
        res.json({ stats });
    } catch (error) {
        logger.error('Failed to get schedule stats', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

app.get('/api/scheduler/status', (req, res) => {
    try {
        const status = schedulerService.getStatus();
        res.json({ status });
    } catch (error) {
        logger.error('Failed to get scheduler status', error as Error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

app.post('/api/scheduler/validate-cron', (req, res) => {
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

function sendEvent(data: unknown, event: string = 'message') {
    const jsonString = JSON.stringify(data);
    const payload = `event: ${event}\ndata: ${jsonString}\n\n`;
    console.log('sendEvent data:', data);
    console.log('sendEvent jsonString:', jsonString);
    console.log('sendEvent payload:', payload);
    for (const c of clients) {
        c.res.write(payload);
    }
}

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('\n');

    const id = nextClientId++;
    clients.push({ id, res });

    req.on('close', () => {
        const idx = clients.findIndex((c) => c.id === id);
        if (idx !== -1) clients.splice(idx, 1);
    });
});

app.post('/crawl', async (req, res) => {
    const { url, allowSubdomains, maxConcurrency, mode } = req.body ?? {};
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

    const requestId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info('Crawl request received', { url: safeUrl, allowSubdomains, maxConcurrency, mode }, requestId);
    
    res.json({ ok: true, requestId, url: safeUrl });

    // Update health checker
    healthChecker.recordCrawlStart();
    healthChecker.setActiveCrawls(1);

    // Kick off crawl in background
    void (async () => {
        const startTime = Date.now();
        sendEvent({ type: 'log', message: `Starting crawl: ${url}` }, 'log');
        
        try {
            await runCrawl({
                startUrl: safeUrl,
                allowSubdomains: Boolean(allowSubdomains),
                maxConcurrency: Number(maxConcurrency) || 150,
                perHostDelayMs: Number(process.env.CRAWL_PER_HOST_DELAY_MS) || 150,
                denyParamPrefixes: (process.env.DENY_PARAMS || 'utm_,session,sort,filter,ref,fbclid,gclid')
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                mode: mode === 'js' || mode === 'auto' ? mode : 'html',
            }, {
                onLog: (msg) => {
                    sendEvent({ type: 'log', message: msg }, 'log');
                    logger.info(msg, {}, requestId);
                },
                onPage: (urlFound) => {
                    sendEvent({ type: 'page', url: urlFound }, 'page');
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
                    sendEvent(eventData, 'done');
                    
                    logger.info('Crawl completed', { 
                        totalPages: count, 
                        duration: `${duration}ms`,
                        pagesPerSecond: pagesPerSecond
                    }, requestId);
                    
                    // Update health checker
                    healthChecker.setActiveCrawls(0);
                },
            }, metricsCollector);
        } catch (e) {
            const error = e as Error;
            const duration = Date.now() - startTime;
            sendEvent({ type: 'log', message: `Error: ${error.message}` }, 'log');
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


