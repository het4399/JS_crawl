import { getDatabase } from '../database/DatabaseService.js';

export type StoredAudit = {
    url: string;
    device: 'mobile' | 'desktop';
    runAt: string;
    metrics: Record<string, unknown>;
};

export function saveAudit(url: string, device: 'mobile' | 'desktop', parsed: Record<string, unknown>, raw?: unknown, sessionId?: number): { dbId: number } {
    const date = new Date();
    
    // Save to database only
    const db = getDatabase();
    
    // Check if audit already exists for this URL and device
    const existing = db.getAuditResult(url, device);
    if (existing) {
        console.log(`[audit-store] 🔄 Updating existing audit: ${device} ${url}`);
        // Update existing record with actual metrics
        db.updateAuditResult(existing.id, {
            lcp_ms: (parsed.lab as any)?.LCP_ms,
            tbt_ms: (parsed.lab as any)?.TBT_ms,
            cls: (parsed.lab as any)?.CLS,
            fcp_ms: (parsed.lab as any)?.FCP_ms,
            ttfb_ms: (parsed.lab as any)?.TTFB_ms,
            performance_score: (parsed.lab as any)?.performanceScore,
            psi_report_url: (parsed as any).psiReportUrl,
            metrics_json: parsed,
            raw_json: raw as Record<string, unknown>,
            status: 'completed',
            progress: 100
        });
        return { dbId: existing.id };
    }
    
    const dbId = db.insertAuditResult({
        url,
        device,
        run_at: date.toISOString(),
        lcp_ms: (parsed.lab as any)?.LCP_ms,
        tbt_ms: (parsed.lab as any)?.TBT_ms,
        cls: (parsed.lab as any)?.CLS,
        fcp_ms: (parsed.lab as any)?.FCP_ms,
        ttfb_ms: (parsed.lab as any)?.TTFB_ms,
        performance_score: (parsed.lab as any)?.performanceScore,
        psi_report_url: (parsed as any).psiReportUrl,
        metrics_json: parsed,
        raw_json: raw as Record<string, unknown>,
        session_id: sessionId,
        status: 'completed',
        progress: 100
    });
    
    console.log(`[audit-store] ✅ Saved audit: ${device} ${url} (ID: ${dbId})`);
    return { dbId };
}


