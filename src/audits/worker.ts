import fs from 'fs';
import path from 'path';
import { fetchPsi, DeviceStrategy } from './psiClient.js';
import { saveAudit } from './store.js';

type Job = { url: string; device: DeviceStrategy };

// Simple in-memory queue fed by a newline-delimited file for demo purposes
const QUEUE_FILE = process.env.AUDIT_QUEUE_FILE || path.resolve(process.cwd(), 'storage', 'audit-queue.txt');

function loadConfig() {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'config', 'audits.json'), 'utf-8'));
        return cfg;
    } catch (e) {
        throw new Error('Failed to read config/audits.json');
    }
}

function* readJobsFromFile(device: DeviceStrategy): Generator<Job> {
    if (!fs.existsSync(QUEUE_FILE)) return;
    const content = fs.readFileSync(QUEUE_FILE, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
        const url = line.trim();
        if (!url) continue;
        yield { url, device };
    }
}

async function worker(concurrency: number, device: DeviceStrategy) {
    // Load config inside worker to access timeouts/retries
    const cfg = loadConfig();
    console.log(process.env.PSI_API_KEY)
    const jobs = Array.from(readJobsFromFile(device));
    let idx = 0;
    async function next() {
        const job = jobs[idx++];
        if (!job) return;
        try {
            const result = await fetchPsi(job.url, job.device, {
                timeoutMs: Number(process.env.PSI_TIMEOUT_MS) || Number(cfg.timeouts?.requestMs) || 15000,
                retries: Number(process.env.PSI_RETRIES) || Number(cfg.retries?.maxAttempts) || 2,
                backoffBaseMs: Number(process.env.PSI_BACKOFF_BASE_MS) || Number(cfg.retries?.baseDelayMs) || 500,
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
            // eslint-disable-next-line no-console
            console.log(`[audit] ${job.device} ${job.url} -> ok`);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[audit] ${job.device} ${job.url} -> error`, (e as Error).message);
        }
        await next();
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => next()));
}

async function main() {
    const cfg = loadConfig();
    const device: DeviceStrategy = cfg.deviceStrategy?.mobile ? 'mobile' : 'desktop';
    const concurrency: number = Number(process.env.PSI_CONCURRENCY) || Number(cfg.concurrency) || 12;
    // eslint-disable-next-line no-console
    console.log(`[audit-worker] starting with concurrency=${concurrency}, device=${device}`);
    if (String(process.env.AUDITS_DEBUG || '').toLowerCase() === 'true') {
        console.log('[audit-worker] debug on. timeouts/retries:', {
            timeoutMs: Number(process.env.PSI_TIMEOUT_MS) || Number(cfg.timeouts?.requestMs) || 15000,
            retries: Number(process.env.PSI_RETRIES) || Number(cfg.retries?.maxAttempts) || 2,
            backoffBaseMs: Number(process.env.PSI_BACKOFF_BASE_MS) || Number(cfg.retries?.baseDelayMs) || 500,
        });
    }
    await worker(concurrency, device);
}

main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[audit-worker] fatal', e);
    process.exit(1);
});


