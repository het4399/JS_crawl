import { CheerioCrawler, Dataset, log, RequestQueue, PlaywrightCrawler } from 'crawlee';
import { canonicalizeUrl, isSameSite } from './utils/url.js';
import { Logger } from './logging/Logger.js';
import { MetricsCollector } from './monitoring/MetricsCollector.js';

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

    const start = new URL(startUrl);
    const allowedHost = start.hostname;

    const startMsg = `Starting crawl for ${startUrl} (host=${allowedHost}, allowSubdomains=${allowSubdomains})`;
    log.info(startMsg);
    onLog?.(startMsg);

    const queue = await RequestQueue.open();

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
                const failedPageData = {
                    url,
                    title: 'Request Failed',
                    description: `HTTP ${response.statusCode} Error`,
                    contentType: response?.headers?.['content-type'] || response?.responseHeaders?.['content-type'] || 'Unknown',
                    lastModified: response?.headers?.['last-modified'] || response?.responseHeaders?.['last-modified'] || null,
                    statusCode: response.statusCode,
                    responseTime: 0,
                    timestamp: new Date().toISOString(),
                    success: false
                };
                
                await Dataset.pushData(failedPageData);
                onPage?.(url);
                return;
            }

            // Calculate response time
            const startTime = requestStartTimes.get(url) || Date.now();
            const responseTime = Date.now() - startTime;

            // Record the page data
            const pageData = {
                url,
                title: $('title').text().trim() || 'No title',
                description: $('meta[name="description"]').attr('content') || 'No description',
                contentType: response?.headers?.['content-type'] || response?.responseHeaders?.['content-type'] || 'text/html',
                lastModified: response?.headers?.['last-modified'] || response?.responseHeaders?.['last-modified'] || null,
                statusCode: response?.statusCode || 200,
                responseTime: responseTime,
                timestamp: new Date().toISOString(),
                success: true
            };
            
            await Dataset.pushData(pageData);
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

            // Collect CSS files
            $('link[rel="stylesheet"][href]').each((_i, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                
                let absolute: string;
                try {
                    absolute = new URL(href, url).toString();
                } catch {
                    return;
                }
                
                if (!emittedCss.has(absolute)) {
                    emittedCss.add(absolute);
                    Dataset.pushData({
                        url: absolute,
                        resourceType: 'css',
                        title: '',
                        description: 'CSS file',
                        contentType: 'text/css',
                        lastModified: null,
                        statusCode: 200,
                        responseTime: 0,
                        timestamp: new Date().toISOString(),
                        success: true,
                    });
                }
            });

            // Collect JS files
            $('script[src]').each((_i, el) => {
                const src = $(el).attr('src');
                if (!src) return;
                
                let absolute: string;
                try {
                    absolute = new URL(src, url).toString();
                } catch {
                    return;
                }
                
                if (!emittedJs.has(absolute)) {
                    emittedJs.add(absolute);
                    Dataset.pushData({
                        url: absolute,
                        resourceType: 'js',
                        title: '',
                        description: 'JavaScript file',
                        contentType: 'application/javascript',
                        lastModified: null,
                        statusCode: 200,
                        responseTime: 0,
                        timestamp: new Date().toISOString(),
                        success: true,
                    });
                }
            });

            // Collect images
            $('img[src]').each((_i, el) => {
                const src = $(el).attr('src');
                if (!src) return;
                
                let absolute: string;
                try {
                    absolute = new URL(src, url).toString();
                } catch {
                    return;
                }
                
                if (!emittedImg.has(absolute)) {
                    emittedImg.add(absolute);
                    Dataset.pushData({
                        url: absolute,
                        resourceType: 'image',
                        title: $(el).attr('alt') || '',
                        description: 'Image',
                        contentType: 'image/*',
                        lastModified: null,
                        statusCode: 200,
                        responseTime: 0,
                        timestamp: new Date().toISOString(),
                        success: true,
                    });
                }
            });

            // Collect external links
            $('a[href]').each((_i, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                
                let absolute: string;
                try {
                    absolute = new URL(href, url).toString();
                } catch {
                    return;
                }
                
                // Check if it's external
                if (!isSameSite(absolute, allowedHost, allowSubdomains)) {
                    if (!emittedExternal.has(absolute)) {
                        emittedExternal.add(absolute);
                        Dataset.pushData({
                            url: absolute,
                            resourceType: 'external',
                            title: '',
                            description: 'External link',
                            contentType: 'text/html',
                            lastModified: null,
                            statusCode: 0,
                            responseTime: 0,
                            timestamp: new Date().toISOString(),
                            success: true,
                        });
                    }
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
            const failedPageData = {
                url: request.url,
                title: 'Request Failed',
                description: `Error: ${(error as Error).message}`,
                contentType: 'Unknown',
                lastModified: null,
                statusCode: 0,
                responseTime: responseTime,
                timestamp: new Date().toISOString(),
                success: false
            };
            
            await Dataset.pushData(failedPageData);
            
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

    // Optional Playwright crawler for JS-rendered pages
    const jsFallbackUrls: Set<string> = new Set();
    const playwrightCrawler = new PlaywrightCrawler({
        maxConcurrency: Math.max(1, Math.floor(maxConcurrency / 5)),
        requestHandlerTimeoutSecs: 90,
        preNavigationHooks: [
            async ({ request }) => {
                requestStartTimes.set(request.url, Date.now());
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
            
            const pageData = {
                url,
                title,
                description,
                contentType: 'text/html',
                lastModified: null,
                statusCode: 200,
                responseTime: responseTime,
                timestamp: new Date().toISOString(),
                success: true
            };
            
            onLog?.(`JS-rendered: ${url}`);
            await Dataset.pushData(pageData);
            onPage?.(url);
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
            const failedPageData = {
                url: request.url,
                title: 'JS Request Failed',
                description: `Playwright Error: ${(error as Error).message}`,
                contentType: 'Unknown',
                lastModified: null,
                statusCode: 0,
                responseTime: responseTime,
                timestamp: new Date().toISOString(),
                success: false
            };
            
            await Dataset.pushData(failedPageData);
            
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
        await cheerioCrawler.run([{ url: start.href }]);
        if (mode === 'auto' && jsFallbackUrls.size > 0) {
            onLog?.(`Auto mode: retrying ${jsFallbackUrls.size} page(s) with JS renderer`);
            await playwrightCrawler.run(Array.from(jsFallbackUrls).map((u) => ({ url: u })));
        }
    }

    const dataset = await Dataset.open();
    const { itemCount } = await dataset.getInfo() ?? { itemCount: 0 };
    
    const doneMsg = `🎉 Crawl complete! Found ${itemCount} items`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(itemCount);
}