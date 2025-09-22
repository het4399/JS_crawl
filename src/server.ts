import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runCrawl } from './crawler.js';
import { monitoringRoutes, healthChecker, metricsCollector } from './routes/monitoring.routes.js';
import { Logger } from './logging/Logger.js';

type Client = {
    id: number;
    res: express.Response;
};

const app = express();
const logger = Logger.getInstance();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Add monitoring routes
app.use('/api', monitoringRoutes);

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

const port = Number(process.env.PORT) || 3004;
const server = app.listen(port, () => {
    logger.info(`Server started`, { port, environment: process.env.NODE_ENV || 'development' });
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Metrics: http://localhost:${port}/api/metrics`);
    console.log(`Logs: http://localhost:${port}/api/logs`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});


