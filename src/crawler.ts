import { CheerioCrawler, log, RequestQueue } from 'crawlee';
import { canonicalizeUrl, isSameSite } from './utils/url.js';
import { Logger } from './logging/Logger.js';
import { MetricsCollector } from './monitoring/MetricsCollector.js';
import { getDatabase, DatabaseService } from './database/DatabaseService.js';
import { SitemapService } from './sitemap/SitemapService.js';
import { CrawlAuditIntegration } from './audits/CrawlAuditIntegration.js';
import { extractLinkMetadata } from './utils/linkAnalyzer.js';
import { initSeoEnqueue, maybeEnqueueSeo } from './seo/redis-queue.js';

/**
 * Check if a URL is a valid HTTP/HTTPS link that should be processed
 */
function isValidHttpLink(href: string): boolean {
    if (!href) return false;
    
    // Skip non-HTTP protocols
    const lowerHref = href.toLowerCase();
    if (lowerHref.startsWith('javascript:') ||
        lowerHref.startsWith('mailto:') ||
        lowerHref.startsWith('tel:') ||
        lowerHref.startsWith('sms:') ||
        lowerHref.startsWith('ftp:') ||
        lowerHref.startsWith('file:') ||
        lowerHref.startsWith('data:') ||
        lowerHref.startsWith('blob:') ||
        lowerHref.startsWith('chrome:') ||
        lowerHref.startsWith('about:') ||
        lowerHref.startsWith('#')) {
        return false;
    }
    
    // Must be HTTP or HTTPS
    return lowerHref.startsWith('http://') || lowerHref.startsWith('https://');
}

type CrawlOptions = {
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    perHostDelayMs: number;
    denyParamPrefixes: string[];
    mode?: 'html';
    scheduleId?: number;
    userId?: number;
    runAudits?: boolean;
    auditDevice?: 'mobile' | 'desktop';
    captureLinkDetails?: boolean;
};

type CrawlEvents = {
    onLog?: (message: string) => void;
    onPage?: (url: string) => void;
    onDone?: (count: number) => void;
    onAuditStart?: (url: string) => void;
    onAuditComplete?: (url: string, success: boolean, lcp?: number, tbt?: number, cls?: number, performanceScore?: number) => void;
    onAuditResults?: (results: any) => void;
};

// Global flag to control audit cancellation
let auditCancelled = false;

export function cancelAudits(): void {
    auditCancelled = true;
}

export function resetAuditCancellation(): void {
    auditCancelled = false;
}

export async function runCrawl(options: CrawlOptions, events: CrawlEvents = {}, metricsCollector?: MetricsCollector): Promise<void> {
    const { startUrl, allowSubdomains, maxConcurrency, perHostDelayMs, denyParamPrefixes, scheduleId, userId, runAudits = false, auditDevice = 'desktop', captureLinkDetails = false } = options;
    const { onLog, onPage, onDone, onAuditStart, onAuditComplete, onAuditResults } = events;
    const logger = Logger.getInstance();
    const db = getDatabase();

    let start: URL;
    let allowedHost: string;

    try {
        start = new URL(startUrl);
        allowedHost = start.hostname;

    const startMsg = `Starting crawl for ${startUrl} (host=${allowedHost}, allowSubdomains=${allowSubdomains})`;
    log.info(startMsg);
    onLog?.(startMsg);
        
        // Initialize SEO enqueue with the crawl's origin
        try { await initSeoEnqueue(start.href); } catch {}
    } catch (error) {
        const errorMsg = `Invalid start URL: ${startUrl}`;
        logger.error(errorMsg, error as Error);
        onLog?.(errorMsg);
        throw error;
    }

    // Create crawl session
    let sessionId: number;
    try {
        sessionId = db.createCrawlSession({
            startUrl,
            allowSubdomains,
            maxConcurrency,
            mode: 'html',
            scheduleId,
            userId,
            startedAt: new Date().toISOString(),
            totalPages: 0,
            totalResources: 0,
            duration: 0,
            status: 'running'
        });
        logger.info(`Created crawl session: ${sessionId}`);
    } catch (error) {
        const errorMsg = `Failed to create crawl session: ${(error as Error).message}`;
        logger.error(errorMsg, error as Error);
        onLog?.(errorMsg);
        throw error;
    }

    // Helper function to log and save to database
    const logAndSave = (message: string, level: string = 'info') => {
        onLog?.(message);
        try {
            db.saveCrawlLog(sessionId, message, level);
        } catch (error) {
            logger.error('Failed to save log to database', error as Error);
        }
    };

    // Discover sitemaps and add URLs to queue
    const sitemapMsg = 'Discovering sitemaps...';
    log.info(sitemapMsg);
    logAndSave(sitemapMsg);

    try {
        const sitemapResult = await SitemapService.discoverSitemaps(startUrl);
        
        // Store sitemap discovery results
        for (const sitemapUrl of sitemapResult.sitemapUrls) {
            db.insertSitemapDiscovery({
                sessionId,
                sitemapUrl,
                discoveredUrls: 0,
                lastModified: new Date().toISOString(),
                success: true,
                errorMessage: null
            });
        }

        // Store discovered URLs from sitemaps
        for (const urlData of sitemapResult.discoveredUrls) {
            db.insertSitemapUrl({
                sessionId,
                url: urlData.url,
                lastModified: urlData.lastModified || null,
                changeFrequency: urlData.changeFrequency || null,
                priority: urlData.priority || null,
                discoveredAt: new Date().toISOString(),
                crawled: false
            });
        }

        const discoveryMsg = `Discovered ${sitemapResult.discoveredUrls.length} URLs from ${sitemapResult.sitemapUrls.length} sitemaps`;
        log.info(discoveryMsg);
        logAndSave(discoveryMsg);

        if (sitemapResult.errors.length > 0) {
            const errorMsg = `Sitemap discovery errors: ${sitemapResult.errors.join(', ')}`;
            logAndSave(errorMsg, 'warning');
        }
    } catch (error) {
        const errorMsg = `Sitemap discovery failed: ${error}`;
        log.error(errorMsg);
        logAndSave(errorMsg, 'error');
    }

    // Use a unique queue per session run to avoid reusing handled requests
    const queue = await RequestQueue.open(`crawl-session-${sessionId}-${Date.now()}`);

    // Add discovered sitemap URLs to the queue
    try {
        const sitemapUrls = db.getUncrawledSitemapUrls(sessionId);
        // Add requests directly to the same RequestQueue Cheerio will use
        await queue.addRequest({ url: start.href });
        for (const u of sitemapUrls) {
            await queue.addRequest({ url: u.url });
        }

        // Debug: report queue stats
        try {
            const info = await queue.getInfo();
            const qmsg = `Queue prepared: pending=${info?.pendingRequestCount ?? 'n/a'}, handled=${info?.handledRequestCount ?? 'n/a'}`;
            log.info(qmsg);
            onLog?.(qmsg);
        } catch {}
        
        if (sitemapUrls.length > 0) {
            const queueMsg = `Added ${sitemapUrls.length} sitemap URLs to crawl queue`;
            log.info(queueMsg);
            onLog?.(queueMsg);
        }
    } catch (error) {
        const errorMsg = `Failed to add sitemap URLs to queue: ${error}`;
        log.error(errorMsg);
        onLog?.(errorMsg);
    }

    // Track request start times for response time calculation
    const requestStartTimes = new Map<string, number>();

    // Track globally emitted resources to avoid duplicate rows across pages
    const emittedCss = new Set<string>();
    const emittedJs = new Set<string>();
    const emittedImg = new Set<string>();
    const emittedExternal = new Set<string>();

    const cheerioCrawler = new CheerioCrawler({
        requestQueue: queue,
        maxConcurrency,
        requestHandlerTimeoutSecs: 45,
        maxRequestRetries: 1,
        preNavigationHooks: [
            async ({ request }) => {
                requestStartTimes.set(request.url, Date.now());
            }
        ],
        requestHandler: async ({ request, $, enqueueLinks, log: reqLog, response }) => {
            const { url } = request;
            
            if (response?.statusCode && response.statusCode >= 400) {
                const errorMsg = `Skipping ${url} due to status ${response.statusCode}`;
                reqLog.debug(errorMsg);
                onLog?.(errorMsg);
                
                // Store failed request data
                db.insertPage({
                    sessionId,
                    url,
                    title: 'Request Failed',
                    description: `HTTP ${response.statusCode} Error`,
                    contentType: response?.headers?.['content-type'] || response?.responseHeaders?.['content-type'] || 'Unknown',
                    lastModified: response?.headers?.['last-modified'] || response?.responseHeaders?.['last-modified'] || null,
                    statusCode: response.statusCode,
                    responseTime: 0,
                    wordCount: 0,
                    timestamp: new Date().toISOString(),
                    success: false,
                    errorMessage: `HTTP ${response.statusCode} Error`
                });
                
                onPage?.(url);
                return;
            }

            // Calculate response time
            const startTime = requestStartTimes.get(url) || Date.now();
            const responseTime = Date.now() - startTime;

            // Determine content type with fallbacks
            const headerContentType = response?.headers?.['content-type'] || response?.responseHeaders?.['content-type'];
            const metaContentType = $('meta[http-equiv="Content-Type"]').attr('content');
            const resolvedContentType = headerContentType || metaContentType || 'text/html';

            // Compute word count from a cloned DOM to avoid affecting link extraction
            const cheerio = await import('cheerio');
            const $clone = cheerio.load($.html());
            $clone('script, style, noscript, meta, link').remove();
            const textContent = $clone('body').text().trim();
            const wordCount = textContent ? textContent.split(/\s+/).length : 0;

            // Record the page data
            const pageId = db.insertPage({
                sessionId,
                url,
                title: $('title').text().trim() || 'No title',
                description: $('meta[name="description"]').attr('content') || 'No description',
                contentType: resolvedContentType,
                lastModified: response?.headers?.['last-modified'] || response?.responseHeaders?.['last-modified'] || null,
                statusCode: response?.statusCode || 200,
                responseTime: responseTime,
                wordCount,
                timestamp: new Date().toISOString(),
                success: true,
                errorMessage: null
            });
            
            // Mark sitemap URL as crawled if it was discovered from sitemap
            db.markSitemapUrlAsCrawled(sessionId, url);
            
            onPage?.(url);
            
            // Enqueue for SEO extraction if eligible (non-blocking)
            try { await maybeEnqueueSeo(url, resolvedContentType, wordCount); } catch {}
            
            // Record successful request in metrics
            if (metricsCollector) {
                metricsCollector.recordRequest({
                    url,
                    statusCode: response?.statusCode || 200,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                    success: true
                });
            }
            
            logger.debug('Page processed', { url, responseTime });

            // Enqueue same-site links discovered on the page
            const toEnqueue: string[] = [];
            $('a[href]')
                .map((_i, el) => $(el).attr('href'))
                .get()
                .forEach((href) => {
                    if (!href) return;
                    let absolute: string;
                    try {
                        absolute = new URL(href, url).toString();
                    } catch {
                        return;
                    }
                    if (!isValidHttpLink(absolute)) return;
                    const canon = canonicalizeUrl(absolute, {
                        allowedHost,
                        allowSubdomains,
                        denyParamPrefixes,
                    });
                    if (canon) toEnqueue.push(canon);
                });

            if (toEnqueue.length > 0) {
                await enqueueLinks({
                    urls: toEnqueue,
                    transformRequestFunction: (req) => {
                        // Stay within same site only
                        if (!isSameSite(req.url, allowedHost, allowSubdomains)) return null;
                        return req;
                    },
                });
            }

            // Collect CSS files (fast: no HEAD requests)
            $('link[rel="stylesheet"][href]').each((_i, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                let absolute: string;
                try { absolute = new URL(href, url).toString(); } catch { return; }
                if (emittedCss.has(absolute)) return;
                    emittedCss.add(absolute);
                db.upsertResource({
                    sessionId,
                    pageId: pageId,
                        url: absolute,
                        resourceType: 'css',
                        title: '',
                        description: 'CSS file',
                        contentType: 'text/css',
                    statusCode: null,
                    responseTime: null,
                    timestamp: new Date().toISOString()
                });
            });

            // Collect JS files
            // Collect JS files (fast)
            $('script[src]').each((_i, el) => {
                const src = $(el).attr('src');
                if (!src) return;
                let absolute: string;
                try { absolute = new URL(src, url).toString(); } catch { return; }
                if (emittedJs.has(absolute)) return;
                    emittedJs.add(absolute);
                db.upsertResource({
                    sessionId,
                    pageId: pageId,
                        url: absolute,
                        resourceType: 'js',
                        title: '',
                        description: 'JavaScript file',
                        contentType: 'application/javascript',
                    statusCode: null,
                    responseTime: null,
                    timestamp: new Date().toISOString()
                });
            });

            // Collect images
            // Collect images (fast)
            $('img[src]').each((_i, el) => {
                const src = $(el).attr('src');
                if (!src) return;
                const alt = $(el).attr('alt') || '';
                let absolute: string;
                try { absolute = new URL(src, url).toString(); } catch { return; }
                if (emittedImg.has(absolute)) return;
                    emittedImg.add(absolute);
                db.upsertResource({
                    sessionId,
                    pageId: pageId,
                        url: absolute,
                        resourceType: 'image',
                    title: alt,
                        description: 'Image',
                        contentType: 'image/*',
                    statusCode: null,
                    responseTime: null,
                    timestamp: new Date().toISOString()
                });
            });

            // Collect external links
            // Collect external links (fast)
            $('a[href]').each((_i, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                let absolute: string;
                try { absolute = new URL(href, url).toString(); } catch { return; }
                // Only track real HTTP/HTTPS links
                if (!isValidHttpLink(absolute)) return;
                if (!isSameSite(absolute, allowedHost, allowSubdomains)) {
                    if (emittedExternal.has(absolute)) return;
                        emittedExternal.add(absolute);
                    db.upsertResource({
                        sessionId,
                        pageId: pageId,
                            url: absolute,
                            resourceType: 'external',
                            title: '',
                            description: 'External link',
                            contentType: 'text/html',
                        statusCode: null,
                        responseTime: null,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Link analysis (if enabled)
            if (captureLinkDetails) {
                const linkAnalysisStart = Date.now();
                const linksToInsert: Array<{
                    sessionId: number;
                    sourcePageId: number;
                    sourceUrl: string;
                    targetUrl: string;
                    targetPageId?: number;
                    isInternal: boolean;
                    anchorText?: string;
                    xpath?: string;
                    position?: string;
                    rel?: string;
                    nofollow?: boolean;
                }> = [];
                
                const processedLinks = new Set<string>(); // For deduplication
                
                $('a[href]').each((_i, el) => {
                    try {
                        const href = $(el).attr('href');
                        if (!href) return;
                        
                        let absolute: string;
                        try { 
                            absolute = new URL(href, url).toString(); 
                        } catch { 
                            return; 
                        }
                        
                        // Only process HTTP/HTTPS links
                        if (!isValidHttpLink(absolute)) return;
                        
                        // Deduplicate by target URL and XPath
                        const metadata = extractLinkMetadata(el, url, $);
                        const dedupeKey = `${metadata.targetUrl}|${metadata.xpath}`;
                        if (processedLinks.has(dedupeKey)) return;
                        processedLinks.add(dedupeKey);
                        
                        const isInternal = isSameSite(absolute, allowedHost, allowSubdomains);
                        
                        linksToInsert.push({
                            sessionId,
                            sourcePageId: pageId,
                            sourceUrl: url,
                            targetUrl: metadata.targetUrl,
                            isInternal,
                            anchorText: metadata.anchorText,
                            xpath: metadata.xpath,
                            position: metadata.position,
                            rel: metadata.rel,
                            nofollow: metadata.nofollow
                        });
                    } catch (error) {
                        // Skip problematic links
                        reqLog.debug(`Skipping link analysis for ${$(el).attr('href')}: ${(error as Error).message}`);
                    }
                });
                
                // Batch insert links
                if (linksToInsert.length > 0) {
                    db.insertLinks(linksToInsert);
                }
                
                // Record metrics
                const linkAnalysisTime = Date.now() - linkAnalysisStart;
                if (metricsCollector) {
                    metricsCollector.recordLinkAnalysis(
                        processedLinks.size,
                        linksToInsert.length,
                        linkAnalysisTime
                    );
                }
                
                reqLog.debug(`Link analysis: found ${processedLinks.size} links, inserted ${linksToInsert.length} in ${linkAnalysisTime}ms`);
            }
        },
        errorHandler: async ({ request, error }) => {
            const warn = `Request failed ${request.url}: ${(error as Error).message}`;
            log.warning(warn);
            onLog?.(warn);
            
            // Calculate response time for failed request
            const startTime = requestStartTimes.get(request.url) || Date.now();
            const responseTime = Date.now() - startTime;
            
            // Store failed request data
            db.insertPage({
                sessionId,
                url: request.url,
                title: 'Request Failed',
                description: `Error: ${(error as Error).message}`,
                contentType: 'Unknown',
                lastModified: null,
                statusCode: 0,
                responseTime: responseTime,
                wordCount: 0,
                timestamp: new Date().toISOString(),
                success: false,
                errorMessage: (error as Error).message
            });
            
            // Record failed request in metrics
            if (metricsCollector) {
                metricsCollector.recordRequest({
                    url: request.url,
                    statusCode: 0,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                    success: false,
                    error: (error as Error).message
                });
            }
            onPage?.(request.url);
        },
    });

    // Consume the provided RequestQueue populated above
    await cheerioCrawler.run();

    // Update crawl session with final stats
    const totalPages = db.getPageCount(sessionId);
    const totalResources = db.getResourceCount(sessionId);
    const endTime = Date.now();
    const sessionInfo = db.getCrawlSession(sessionId) as any;
    const startedAtIso: string | null = sessionInfo?.startedAt ?? sessionInfo?.started_at ?? null;
    const startTime = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));
    
    // Set status based on whether audits are still running
    const finalStatus = runAudits ? 'auditing' : 'completed';
    
    db.updateCrawlSession(sessionId, {
        completedAt: new Date().toISOString(),
        totalPages,
        totalResources,
        duration,
        status: finalStatus
    });
    
    // Send real-time status update via SSE if status is 'auditing'
    if (finalStatus === 'auditing') {
        // Note: We can't send SSE from here since we don't have access to sendEvent
        // The status will be updated when audits complete
    }
    
    const totalItems = totalPages + totalResources;
    const doneMsg = `🎉 Crawl complete! Found ${totalItems} items (${totalPages} pages, ${totalResources} resources)`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(totalItems);

    // Post-processing: Resolve target_page_id relationships for link analysis
    if (captureLinkDetails) {
        const postProcessStart = Date.now();
        onLog?.('🔗 Resolving link relationships...');
        
        try {
            const resolvedCount = db.resolveTargetPageIds(sessionId);
            const postProcessTime = Date.now() - postProcessStart;
            
            onLog?.(`✓ Resolved ${resolvedCount} internal link relationships in ${postProcessTime}ms`);
            
            // Get link statistics
            const linkStats = db.getLinkStats(sessionId);
            onLog?.(`📊 Link Analysis: ${linkStats.totalLinks} total links (${linkStats.internalLinks} internal, ${linkStats.externalLinks} external)`);
            
            if (Object.keys(linkStats.linksByPosition).length > 0) {
                const positionStats = Object.entries(linkStats.linksByPosition)
                    .map(([pos, count]) => `${pos}: ${count}`)
                    .join(', ');
                onLog?.(`📍 Links by position: ${positionStats}`);
            }
            
        } catch (error) {
            onLog?.(`⚠️ Link post-processing failed: ${(error as Error).message}`);
            logger.error('Link post-processing failed', error as Error);
        }
    }

    // Clean up the request queue after crawl completion
    try {
        await queue.drop();
        log.info('Request queue cleaned up after crawl completion');
    } catch (error) {
        log.warning('Failed to clean up request queue', error as Error);
    }

    // Run audits if enabled
    if (runAudits) {
        try {
            const auditIntegration = new CrawlAuditIntegration(sessionId);

            // Get crawled URLs for auditing
            const crawledPages = db.getPages(sessionId);
            const urlsToAudit = crawledPages
                .filter(page => page.success)
                .map(page => page.url);

            const auditMsg = `🔍 Starting performance audits for all ${urlsToAudit.length} crawled URLs (${auditDevice})...`;
            log.info(auditMsg);
            onLog?.(auditMsg);

            if (urlsToAudit.length === 0) {
                const noAuditMsg = 'No valid URLs found for auditing';
                log.info(noAuditMsg);
                onLog?.(noAuditMsg);
            } else {
                onLog?.(`Running audits for ${urlsToAudit.length} URLs...`);
                
                // Process audits in parallel batches to speed up execution
                // Dynamic batch size based on total URLs for optimal performance
                const totalUrls = urlsToAudit.length;
                let batchSize = 8; // Default for small sites (increased from 3)
                
                if (totalUrls > 50) {
                    batchSize = 12; // Larger batches for big sites (increased from 5)
                } else if (totalUrls > 20) {
                    batchSize = 10; // Medium batches for medium sites (increased from 4)
                }
                
                const batches = [];
                
                for (let i = 0; i < urlsToAudit.length; i += batchSize) {
                    const batch = urlsToAudit.slice(i, i + batchSize);
                    batches.push(batch);
                }
                
                const setupMsg = `🚀 Processing ${totalUrls} audits in ${batches.length} batches of ${batchSize} (parallel execution)`;
                log.info(setupMsg);
                onLog?.(setupMsg);
                
                const startTime = Date.now();
                let completedAudits = 0;

                for (const batch of batches) {
                    // Check if audits have been cancelled
                    if (auditCancelled) {
                        const cancelMsg = '🛑 Audit process cancelled by user';
                        log.info(cancelMsg);
                        onLog?.(cancelMsg);
                        break;
                    }
                    
                    // Process batch in parallel
                    const batchPromises = batch.map(async (url) => {
                        try {
                            onAuditStart?.(url);
                            const auditResult = await auditIntegration.runAuditForUrl(url, auditDevice);
                            
                            onAuditComplete?.(
                                url, 
                                auditResult.success, 
                                auditResult.lcp, 
                                auditResult.tbt, 
                                auditResult.cls,
                                auditResult.performanceScore
                            );
                            
                            if (auditResult.success) {
                                onLog?.(`✓ Audit completed for ${url} - LCP: ${auditResult.lcp ? Math.round(auditResult.lcp) + 'ms' : 'N/A'}, TBT: ${auditResult.tbt ? Math.round(auditResult.tbt) + 'ms' : 'N/A'}, CLS: ${auditResult.cls ? auditResult.cls.toFixed(3) : 'N/A'}`);
                            } else {
                                onLog?.(`✗ Audit failed for ${url}: ${auditResult.error}`);
                            }
                            
                            return { url, success: auditResult.success };
                        } catch (error) {
                            onLog?.(`✗ Audit error for ${url}: ${(error as Error).message}`);
                            onAuditComplete?.(url, false);
                            return { url, success: false };
                        }
                    });

                    // Wait for batch to complete
                    await Promise.all(batchPromises);
                    
                    // Check for cancellation after batch completion
                    if (auditCancelled) {
                        const cancelMsg = '🛑 Audit process cancelled by user';
                        log.info(cancelMsg);
                        onLog?.(cancelMsg);
                        break;
                    }
                    
                    // Update progress tracking
                    completedAudits += batch.length;
                    const batchIndex = batches.indexOf(batch);
                    const progress = Math.round((completedAudits / totalUrls) * 100);
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    const estimatedTotal = Math.round((elapsed / completedAudits) * totalUrls);
                    const remaining = Math.max(0, estimatedTotal - elapsed);
                    
                    const progressMsg = `📊 Progress: ${completedAudits}/${totalUrls} (${progress}%) | Elapsed: ${elapsed}s | ETA: ${remaining}s`;
                    log.info(progressMsg);
                    onLog?.(progressMsg);
                    
                    // Smart delay between batches - shorter delays for better performance
                    if (batchIndex < batches.length - 1) {
                        // Reduce delay based on batch size and progress
                        const baseDelay = batchSize > 10 ? 100 : 200; // Minimal delays (increased from 500/750)
                        const progressDelay = Math.max(50, baseDelay - (batchIndex * 10)); // Minimal decreasing delays (increased from 200)
                        await new Promise(resolve => setTimeout(resolve, progressDelay));
                    }
                }

                // Get and report final audit results
                const totalTime = Math.round((Date.now() - startTime) / 1000);
                const auditsPerMinute = Math.round((totalUrls / totalTime) * 60);
                
                const auditStats = auditIntegration.getAuditStats();
                const auditResultsMsg = `📊 Audit Results: ${auditStats.successful}/${auditStats.total} successful (${auditStats.successRate.toFixed(1)}% success rate)`;
                log.info(auditResultsMsg);
                onLog?.(auditResultsMsg);
                
                // Performance summary
                const performanceMsg = `⚡ Performance: ${totalTime}s total | ${auditsPerMinute} audits/min | ${batchSize} parallel`;
                log.info(performanceMsg);
                onLog?.(performanceMsg);
                
                // Debug: Log batch completion
                log.info(`Batch processing completed: ${batches.length} batches processed`);
                
                if (auditStats.averageLcp > 0) {
                    onLog?.(`📈 Average LCP: ${Math.round(auditStats.averageLcp)}ms`);
                }
                if (auditStats.averageTbt > 0) {
                    onLog?.(`📈 Average TBT: ${Math.round(auditStats.averageTbt)}ms`);
                }
                if (auditStats.averageCls > 0) {
                    onLog?.(`📈 Average CLS: ${auditStats.averageCls.toFixed(3)}`);
                }

                // Send detailed results to callback
                onAuditResults?.(auditIntegration.getAllAuditResults());
            }
        } catch (error) {
            const auditErrorMsg = `❌ Audit execution failed: ${(error as Error).message}`;
            log.error(auditErrorMsg);
            onLog?.(auditErrorMsg);
        }
    }
}
