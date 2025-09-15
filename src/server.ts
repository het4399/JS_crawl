import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runCrawl } from './crawler.js';

type Client = {
    id: number;
    res: express.Response;
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let nextClientId = 1;
const clients: Client[] = [];

function sendEvent(data: unknown, event: string = 'message') {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
    const { url, allowSubdomains, maxConcurrency } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'url is required' });

    res.json({ ok: true });

    // Kick off crawl in background
    void (async () => {
        sendEvent({ type: 'log', message: `Starting crawl: ${url}` }, 'log');
        try {
            await runCrawl({
                startUrl: url,
                allowSubdomains: Boolean(allowSubdomains),
                maxConcurrency: Number(maxConcurrency) || 150,
                perHostDelayMs: Number(process.env.CRAWL_PER_HOST_DELAY_MS) || 150,
                denyParamPrefixes: (process.env.DENY_PARAMS || 'utm_,session,sort,filter,ref,fbclid,gclid')
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
            }, {
                onLog: (msg) => sendEvent({ type: 'log', message: msg }, 'log'),
                onPage: (urlFound) => sendEvent({ type: 'page', url: urlFound }, 'page'),
                onDone: (count) => sendEvent({ type: 'done', count }, 'done'),
            });
        } catch (e) {
            sendEvent({ type: 'log', message: `Error: ${(e as Error).message}` }, 'log');
        }
    })();
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});


