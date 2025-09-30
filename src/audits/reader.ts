import fs from 'fs';
import path from 'path';

export type AuditSummary = {
    id: string;
    url: string;
    device: 'mobile' | 'desktop';
    runAt: string;
    LCP_ms?: number;
    TBT_ms?: number;
    CLS?: number;
    FCP_ms?: number;
    TTFB_ms?: number;
    psiReportUrl?: string;
};

const BASE_DIR = path.resolve(process.cwd(), 'storage', 'audits');

export function listRecent(device: 'mobile' | 'desktop' | 'all' = 'all', limit = 100): AuditSummary[] {
    if (!fs.existsSync(BASE_DIR)) return [];
    const deviceDirs = device === 'all' ? fs.readdirSync(BASE_DIR) : [device];
    const records: AuditSummary[] = [];
    for (const dev of deviceDirs) {
        const devDir = path.join(BASE_DIR, dev);
        if (!fs.existsSync(devDir) || !fs.statSync(devDir).isDirectory()) continue;
        const days = fs.readdirSync(devDir).sort().reverse();
        for (const day of days) {
            const dayDir = path.join(devDir, day);
            const files = fs.readdirSync(dayDir).filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'));
            for (const f of files) {
                try {
                    const full = path.join(dayDir, f);
                    const json = JSON.parse(fs.readFileSync(full, 'utf-8')) as any;
                    const id = path.relative(BASE_DIR, full).replace(/\\/g, '/');
                    records.push({
                        id,
                        url: json.url,
                        device: json.device,
                        runAt: json.runAt,
                        LCP_ms: json.metrics?.lab?.LCP_ms ?? json.metrics?.field?.LCP_ms,
                        TBT_ms: json.metrics?.lab?.TBT_ms,
                        CLS: json.metrics?.lab?.CLS ?? json.metrics?.field?.CLS,
                        FCP_ms: json.metrics?.lab?.FCP_ms,
                        TTFB_ms: json.metrics?.lab?.TTFB_ms,
                        psiReportUrl: json.metrics?.psiReportUrl,
                    });
                } catch {
                    // ignore bad files
                }
            }
        }
    }
    return records
        .sort((a, b) => b.runAt.localeCompare(a.runAt))
        .slice(0, limit);
}

export function getById(id: string): any | null {
    const full = path.join(BASE_DIR, id);
    if (!fs.existsSync(full)) return null;
    try {
        return JSON.parse(fs.readFileSync(full, 'utf-8'));
    } catch {
        return null;
    }
}


