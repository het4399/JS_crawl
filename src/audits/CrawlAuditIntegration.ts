import { Logger } from '../logging/Logger.js';
import { fetchPsi, DeviceStrategy } from './psiClient.js';
import { saveAudit } from './store.js';

export interface CrawlAuditResult {
    url: string;
    device: DeviceStrategy;
    success: boolean;
    lcp?: number;
    tbt?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    performanceScore?: number;
    error?: string;
    duration: number;
}

export class CrawlAuditIntegration {
    private logger: Logger;
    private auditResults: Map<string, CrawlAuditResult> = new Map();

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Run audit for a single URL immediately after crawling
     */
    async runAuditForUrl(url: string, device: DeviceStrategy = 'desktop'): Promise<CrawlAuditResult> {
        const startTime = Date.now();
        
        try {
            this.logger.debug(`Running audit for ${url} (${device})`);
            
            const result = await fetchPsi(url, device, {
                timeoutMs: 45000, // 45 second timeout (reduced from 60)
                retries: 1,
                backoffBaseMs: 1000
            });

            const auditResult: CrawlAuditResult = {
                url,
                device,
                success: true,
                lcp: result.lab?.LCP_ms,
                tbt: result.lab?.TBT_ms,
                cls: result.lab?.CLS,
                fcp: result.lab?.FCP_ms,
                ttfb: result.lab?.TTFB_ms,
                performanceScore: result.lab?.performanceScore,
                duration: Date.now() - startTime
            };

            // Store the result
            this.auditResults.set(url, auditResult);

            // Save to audit storage
            const parsed = {
                url: result.url,
                device: result.device,
                runAt: result.runAt,
                field: result.field,
                lab: result.lab,
                psiReportUrl: result.psiReportUrl,
            };
            
            saveAudit(result.url, result.device, parsed, result.raw);

            this.logger.info(`Audit completed for ${url}`, {
                lcp: auditResult.lcp,
                tbt: auditResult.tbt,
                cls: auditResult.cls,
                duration: auditResult.duration
            });

            return auditResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const auditResult: CrawlAuditResult = {
                url,
                device,
                success: false,
                error: (error as Error).message,
                duration
            };

            this.auditResults.set(url, auditResult);
            
            this.logger.error(`Audit failed for ${url}`, error as Error);
            return auditResult;
        }
    }

    /**
     * Run audits for multiple URLs
     */
    async runAuditsForUrls(urls: string[], device: DeviceStrategy = 'desktop'): Promise<CrawlAuditResult[]> {
        const results: CrawlAuditResult[] = [];
        
        this.logger.info(`Starting audits for ${urls.length} URLs (${device})`);
        
        for (const url of urls) {
            try {
                const result = await this.runAuditForUrl(url, device);
                results.push(result);
                
                // Small delay between audits to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                this.logger.error(`Failed to audit ${url}`, error as Error);
                results.push({
                    url,
                    device,
                    success: false,
                    error: (error as Error).message,
                    duration: 0
                });
            }
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        this.logger.info(`Audit batch completed: ${successful} successful, ${failed} failed`);
        
        return results;
    }

    /**
     * Get audit result for a specific URL
     */
    getAuditResult(url: string): CrawlAuditResult | undefined {
        return this.auditResults.get(url);
    }

    /**
     * Get all audit results
     */
    getAllAuditResults(): CrawlAuditResult[] {
        return Array.from(this.auditResults.values());
    }

    /**
     * Get audit statistics
     */
    getAuditStats(): {
        total: number;
        successful: number;
        failed: number;
        successRate: number;
        averageDuration: number;
        averageLcp: number;
        averageTbt: number;
        averageCls: number;
    } {
        const results = this.getAllAuditResults();
        const successful = results.filter(r => r.success);
        
        const averageDuration = results.length > 0 
            ? results.reduce((sum, r) => sum + r.duration, 0) / results.length 
            : 0;
            
        const averageLcp = successful.length > 0 && successful.some(r => r.lcp)
            ? successful.reduce((sum, r) => sum + (r.lcp || 0), 0) / successful.filter(r => r.lcp).length
            : 0;
            
        const averageTbt = successful.length > 0 && successful.some(r => r.tbt)
            ? successful.reduce((sum, r) => sum + (r.tbt || 0), 0) / successful.filter(r => r.tbt).length
            : 0;
            
        const averageCls = successful.length > 0 && successful.some(r => r.cls)
            ? successful.reduce((sum, r) => sum + (r.cls || 0), 0) / successful.filter(r => r.cls).length
            : 0;

        return {
            total: results.length,
            successful: successful.length,
            failed: results.length - successful.length,
            successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
            averageDuration,
            averageLcp,
            averageTbt,
            averageCls
        };
    }

    /**
     * Clear all audit results
     */
    clearResults(): void {
        this.auditResults.clear();
    }

    /**
     * Get audit results as formatted string for logging
     */
    getFormattedResults(): string {
        const results = this.getAllAuditResults();
        if (results.length === 0) {
            return 'No audit results available';
        }

        const stats = this.getAuditStats();
        let output = `\n=== AUDIT RESULTS ===\n`;
        output += `Total URLs: ${stats.total}\n`;
        output += `Successful: ${stats.successful}\n`;
        output += `Failed: ${stats.failed}\n`;
        output += `Success Rate: ${stats.successRate.toFixed(1)}%\n`;
        output += `Average Duration: ${Math.round(stats.averageDuration)}ms\n`;
        
        if (stats.averageLcp > 0) {
            output += `Average LCP: ${Math.round(stats.averageLcp)}ms\n`;
        }
        if (stats.averageTbt > 0) {
            output += `Average TBT: ${Math.round(stats.averageTbt)}ms\n`;
        }
        if (stats.averageCls > 0) {
            output += `Average CLS: ${stats.averageCls.toFixed(3)}\n`;
        }
        
        output += `\nDetailed Results:\n`;
        results.forEach(result => {
            if (result.success) {
                output += `✓ ${result.url}\n`;
                output += `  LCP: ${result.lcp ? Math.round(result.lcp) + 'ms' : 'N/A'}\n`;
                output += `  TBT: ${result.tbt ? Math.round(result.tbt) + 'ms' : 'N/A'}\n`;
                output += `  CLS: ${result.cls ? result.cls.toFixed(3) : 'N/A'}\n`;
                output += `  Duration: ${Math.round(result.duration)}ms\n`;
            } else {
                output += `✗ ${result.url} - ${result.error}\n`;
            }
        });
        
        return output;
    }
}
