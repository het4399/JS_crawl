import { getDatabase } from '../database/DatabaseService.js';

export type StoredAudit = {
    url: string;
    device: 'mobile' | 'desktop';
    runAt: string;
    metrics: Record<string, unknown>;
};

export function saveAudit(url: string, device: 'mobile' | 'desktop', parsed: Record<string, unknown>, raw?: unknown): { dbId: number } {
    const date = new Date();
    
    // Save to database only
    const db = getDatabase();
    const dbId = db.insertAuditResult({
        url,
        device,
        run_at: date.toISOString(),
        lcp_ms: (parsed.lab as any)?.LCP_ms || (parsed.field as any)?.LCP_ms,
        tbt_ms: (parsed.lab as any)?.TBT_ms,
        cls: (parsed.lab as any)?.CLS || (parsed.field as any)?.CLS,
        fcp_ms: (parsed.lab as any)?.FCP_ms,
        ttfb_ms: (parsed.lab as any)?.TTFB_ms,
        performance_score: (parsed.lab as any)?.performanceScore,
        psi_report_url: (parsed as any).psiReportUrl,
        metrics_json: parsed,
        raw_json: raw as Record<string, unknown>
    });
    
    return { dbId };
}


