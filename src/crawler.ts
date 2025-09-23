import { CheerioCrawler, log, RequestQueue, PlaywrightCrawler } from 'crawlee';
import { canonicalizeUrl, isSameSite } from './utils/url.js';
import { Logger } from './logging/Logger.js';
import { MetricsCollector } from './monitoring/MetricsCollector.js';
import { getDatabase, DatabaseService } from './database/DatabaseService.js';
import { SitemapService } from './sitemap/SitemapService.js';

type CrawlOptions = {
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    perHostDelayMs: number;
    denyParamPrefixes: string[];
    mode?: 'html' | 'js' | 'auto';
};

type CrawlEvents = {
    onLog?: (message: string) => void;
    onPage?: (url: string) => void;
    onDone?: (count: number) => void;
};

export async function runCrawl(options: CrawlOptions, events: CrawlEvents = {}, metricsCollector?: MetricsCollector): Promise<void> {
    const { startUrl, allowSubdomains, maxConcurrency, perHostDelayMs, denyParamPrefixes, mode = 'html' } = options;
    const { onLog, onPage, onDone } = events;
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
            mode,
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

    // Discover sitemaps and add URLs to queue
    const sitemapMsg = 'Discovering sitemaps...';
    log.info(sitemapMsg);
    onLog?.(sitemapMsg);

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
        onLog?.(discoveryMsg);

        if (sitemapResult.errors.length > 0) {
            const errorMsg = `Sitemap discovery errors: ${sitemapResult.errors.join(', ')}`;
            onLog?.(errorMsg);
        }
    } catch (error) {
        const errorMsg = `Sitemap discovery failed: ${error}`;
        log.error(errorMsg);
        onLog?.(errorMsg);
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
                timestamp: new Date().toISOString(),
                success: true,
                errorMessage: null
            });
            
            // Mark sitemap URL as crawled if it was discovered from sitemap
            db.markSitemapUrlAsCrawled(sessionId, url);
            
            onPage?.(url);
            
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

    // Track main document response info for Playwright
    const mainDocInfo = new Map<string, { status: number; contentType?: string }>();
    // Track subresource timings and headers
    const resourceStarts = new Map<string, number>();
    const resourceInfo = new Map<string, { status?: number; contentType?: string; start?: number; end?: number }>();

    // Optional Playwright crawler for JS-rendered pages
    const jsFallbackUrls: Set<string> = new Set();
    const playwrightCrawler = new PlaywrightCrawler({
        maxConcurrency: Math.max(1, Math.floor(maxConcurrency / 5)),
        requestHandlerTimeoutSecs: 90,
        preNavigationHooks: [
            async ({ request, page }) => {
                requestStartTimes.set(request.url, Date.now());
                const targetUrl = request.url;

                const onReq = (req: any) => {
                    try { resourceStarts.set(req.url(), Date.now()); } catch {}
                };
                const onResp = async (resp: any) => {
                    try {
                        const rurl = resp.url();
                        const status = resp.status();
                        const headers = await resp.headers().catch(() => ({} as any));
                        const contentType = headers?.['content-type'];
                        const end = Date.now();
                        const start = resourceStarts.get(rurl);
                        resourceInfo.set(rurl, { status, contentType, start, end });

                        if (rurl === targetUrl) {
                            mainDocInfo.set(targetUrl, { status, contentType });
                        }
                    } catch {}
                };

                page.on('request', onReq);
                page.on('response', onResp);
                setTimeout(() => {
                    try { page.off('request', onReq); } catch {}
                    try { page.off('response', onResp); } catch {}
                }, 20000);
            }
        ],
        requestHandler: async ({ request, page, enqueueLinks, log: reqLog }) => {
            const { url } = request;
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);
            
            // Calculate response time
            const startTime = requestStartTimes.get(url) || Date.now();
            const responseTime = Date.now() - startTime;
            
            // Extract page data
            const title = await page.title() || 'No title';
            const description = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => 'No description') || 'No description';
            // Use captured main document response info if available
            let mainStatus: number | undefined = mainDocInfo.get(url)?.status;
            let mainContentType: string | undefined = mainDocInfo.get(url)?.contentType;
            // Additional fallbacks for content type
            const docContentType = await page.evaluate(() => document.contentType).catch(() => undefined);
            const metaHttpEquiv = await page.$eval('meta[http-equiv="Content-Type"]', el => el.getAttribute('content')).catch(() => undefined);
            const resolvedJsContentType = mainContentType || docContentType || metaHttpEquiv || 'text/html';
            const resolvedJsStatus = typeof mainStatus === 'number' && mainStatus > 0 ? mainStatus : 200;

            const pageId = db.insertPage({
                sessionId,
                url,
                title,
                description,
                contentType: resolvedJsContentType,
                lastModified: null,
                statusCode: resolvedJsStatus,
                responseTime: responseTime,
                timestamp: new Date().toISOString(),
                success: true,
                errorMessage: null
            });
            
            onLog?.(`JS-rendered: ${url}`);
            onPage?.(url);

            // Extract CSS files
            const cssLinks = await page.$$eval('link[rel="stylesheet"][href]', (links) => 
                links.map(link => link.getAttribute('href')).filter(Boolean)
            );
            
            for (const href of cssLinks) {
                if (!href) continue;
                let absolute: string;
                try {
                    absolute = new URL(href, url).toString();
                } catch {
                    continue;
                }
                
                if (!emittedCss.has(absolute)) {
                    emittedCss.add(absolute);
                    const info = resourceInfo.get(absolute);
                    const rt = info?.start && info?.end ? (info.end - info.start) : null;
                    db.upsertResource({
                        sessionId,
                        pageId: pageId,
                        url: absolute,
                        resourceType: 'css',
                        title: '',
                        description: 'CSS file',
                        contentType: info?.contentType || 'text/css',
                        statusCode: info?.status ?? null,
                        responseTime: rt,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Extract JS files
            const jsScripts = await page.$$eval('script[src]', (scripts) => 
                scripts.map(script => script.getAttribute('src')).filter(Boolean)
            );
            
            for (const src of jsScripts) {
                if (!src) continue;
                let absolute: string;
                try {
                    absolute = new URL(src, url).toString();
                } catch {
                    continue;
                }
                
                if (!emittedJs.has(absolute)) {
                    emittedJs.add(absolute);
                    const info = resourceInfo.get(absolute);
                    const rt = info?.start && info?.end ? (info.end - info.start) : null;
                    db.upsertResource({
                        sessionId,
                        pageId: pageId,
                        url: absolute,
                        resourceType: 'js',
                        title: '',
                        description: 'JavaScript file',
                        contentType: info?.contentType || 'application/javascript',
                        statusCode: info?.status ?? null,
                        responseTime: rt,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Extract images
            const images = await page.$$eval('img[src]', (imgs) => 
                imgs.map(img => ({
                    src: img.getAttribute('src'),
                    alt: img.getAttribute('alt') || ''
                })).filter(img => img.src)
            );
            
            for (const img of images) {
                if (!img.src) continue;
                let absolute: string;
                try {
                    absolute = new URL(img.src, url).toString();
                } catch {
                    continue;
                }
                
                if (!emittedImg.has(absolute)) {
                    emittedImg.add(absolute);
                    const info = resourceInfo.get(absolute);
                    const rt = info?.start && info?.end ? (info.end - info.start) : null;
                    db.upsertResource({
                        sessionId,
                        pageId: pageId,
                        url: absolute,
                        resourceType: 'image',
                        title: img.alt,
                        description: 'Image',
                        contentType: info?.contentType || 'image/*',
                        statusCode: info?.status ?? null,
                        responseTime: rt,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Extract external links
            const links = await page.$$eval('a[href]', (anchors) => 
                anchors.map(anchor => anchor.getAttribute('href')).filter(Boolean)
            );
            
            for (const href of links) {
                if (!href) continue;
                let absolute: string;
                try {
                    absolute = new URL(href, url).toString();
                } catch {
                    continue;
                }
                
                // Check if it's external
                if (!isSameSite(absolute, allowedHost, allowSubdomains)) {
                    if (!emittedExternal.has(absolute)) {
                        emittedExternal.add(absolute);
                        const info = resourceInfo.get(absolute);
                        const rt = info?.start && info?.end ? (info.end - info.start) : null;
                        db.upsertResource({
                            sessionId,
                            pageId: pageId,
                            url: absolute,
                            resourceType: 'external',
                            title: '',
                            description: 'External link',
                            contentType: info?.contentType || 'text/html',
                            statusCode: info?.status ?? null,
                            responseTime: rt,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
            
            await enqueueLinks({
                strategy: 'same-domain',
                transformRequestFunction: (req) => {
                    if (!isSameSite(req.url, allowedHost, allowSubdomains)) return null;
                    const canon = canonicalizeUrl(req.url, { allowedHost, allowSubdomains, denyParamPrefixes });
                    if (!canon) return null;
                    req.url = canon;
                    return req;
                },
            });
        },
        errorHandler: async ({ request, error }) => {
            const warn = `Playwright failed ${request.url}: ${(error as Error).message}`;
            log.warning(warn);
            onLog?.(warn);
            
            // Calculate response time for failed request
            const startTime = requestStartTimes.get(request.url) || Date.now();
            const responseTime = Date.now() - startTime;
            
            // Store failed request data
            db.insertPage({
                sessionId,
                url: request.url,
                title: 'JS Request Failed',
                description: `Playwright Error: ${(error as Error).message}`,
                contentType: 'Unknown',
                lastModified: null,
                statusCode: 0,
                responseTime: responseTime,
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
        headless: true,
        launchContext: { 
            launchOptions: {
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            }
        },
    });

    if (mode === 'js') {
        await playwrightCrawler.run([{ url: start.href }]);
    } else {
        // Consume the provided RequestQueue populated above
        await cheerioCrawler.run();
        if (mode === 'auto' && jsFallbackUrls.size > 0) {
            onLog?.(`Auto mode: retrying ${jsFallbackUrls.size} page(s) with JS renderer`);
            await playwrightCrawler.run(Array.from(jsFallbackUrls).map((u) => ({ url: u })));
        }
    }

    // Update crawl session with final stats
    const totalPages = db.getPageCount(sessionId);
    const totalResources = db.getResourceCount(sessionId);
    const endTime = Date.now();
    const sessionInfo = db.getCrawlSession(sessionId) as any;
    const startedAtIso: string | null = sessionInfo?.startedAt ?? sessionInfo?.started_at ?? null;
    const startTime = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));
    
    db.updateCrawlSession(sessionId, {
        completedAt: new Date().toISOString(),
        totalPages,
        totalResources,
        duration,
        status: 'completed'
    });
    
    const totalItems = totalPages + totalResources;
    const doneMsg = `🎉 Crawl complete! Found ${totalItems} items (${totalPages} pages, ${totalResources} resources)`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(totalItems);
}