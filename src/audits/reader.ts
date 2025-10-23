import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/DatabaseService.js';

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
    performanceScore?: number;
    psiReportUrl?: string;
};

const BASE_DIR = path.resolve(process.cwd(), 'storage', 'audits');

export function listRecent(device: 'mobile' | 'desktop' | 'all' = 'all', limit = 100): AuditSummary[] {
    const db = getDatabase();
    
    // Query from database
    let results: any[];
    if (device === 'all') {
        results = db.getAuditResults(undefined, limit);
    } else {
        results = db.getAuditResults(device, limit);
    }

    // Convert to AuditSummary format
    return results.map((row) => ({
        id: `${row.id}`,
        url: row.url,
        device: row.device,
        runAt: row.run_at,
        LCP_ms: row.lcp_ms,
        TBT_ms: row.tbt_ms,
        CLS: row.cls,
        FCP_ms: row.fcp_ms,
        TTFB_ms: row.ttfb_ms,
        performanceScore: row.performance_score,
        psiReportUrl: row.psi_report_url
    }));
}

export function getById(id: string): any | null {
    const db = getDatabase();
    const numId = parseInt(id, 10);
    
    if (!isNaN(numId)) {
        const result = db.getAuditResultById(numId);
        if (result) {
            return {
                url: result.url,
                device: result.device,
                runAt: result.run_at,
                metrics: result.metrics_json ? JSON.parse(result.metrics_json) : {},
                raw: result.raw_json ? JSON.parse(result.raw_json) : null
            };
        }
    }
    
    // Fallback: check legacy file storage for old audits
    const full = path.join(BASE_DIR, id);
    if (fs.existsSync(full)) {
        try {
            return JSON.parse(fs.readFileSync(full, 'utf-8'));
        } catch {
            return null;
        }
    }
    
    return null;
}


