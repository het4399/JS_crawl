import fs from 'fs';
import path from 'path';

export type StoredAudit = {
    url: string;
    device: 'mobile' | 'desktop';
    runAt: string;
    metrics: Record<string, unknown>;
    rawRef?: string;
};

const BASE_DIR = path.resolve(process.cwd(), 'storage', 'audits');

function ensureDir(p: string) {
    fs.mkdirSync(p, { recursive: true });
}

function safeFileName(input: string): string {
    return input.replace(/[^a-z0-9-_\.]+/gi, '_').slice(0, 180);
}

export function saveAudit(url: string, device: 'mobile' | 'desktop', parsed: Record<string, unknown>, raw?: unknown): { path: string; rawPath?: string } {
    const date = new Date();
    const day = date.toISOString().slice(0, 10);
    const dir = path.join(BASE_DIR, device, day);
    ensureDir(dir);
    const fileBase = `${safeFileName(url)}_${Date.now()}`;
    const filePath = path.join(dir, `${fileBase}.json`);
    const record: StoredAudit = {
        url,
        device,
        runAt: date.toISOString(),
        metrics: parsed,
    };
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    let rawPath: string | undefined;
    if (raw) {
        rawPath = path.join(dir, `${fileBase}.raw.json`);
        fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2), 'utf-8');
    }
    return { path: filePath, rawPath };
}


