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

    // Always enqueue the start URL
    await queue.addRequests([{ url: start.href }]);
    
    // Log queue info for debugging
    const queueInfo = await queue.getInfo();
    logger.info('Request queue info', { 
      queueName: queueInfo?.name, 
      pendingCount: queueInfo?.pendingRequestCount,
      handledCount: queueInfo?.handledRequestCount 
    });

    // Track request start times for response time calculation
    const requestStartTimes = new Map<string, number>();

    const cheerioCrawler = new CheerioCrawler({
        requestQueue: queue,
        maxConcurrency,
        // Limit per-host rate a bit for politeness
        minConcurrency: Math.min(5, Math.max(1, Math.floor(maxConcurrency / 10))),
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 60,
        // Track request start time
        preNavigationHooks: [
            async ({ request }) => {
                requestStartTimes.set(request.url, Date.now());
            }
        ],
        requestHandler: async ({ request, $, enqueueLinks, log: reqLog, response }) => {
            const { url } = request;
            
            // Debug response object structure
            logger.debug('Response object debug', { 
                url, 
                hasResponse: !!response,
                responseType: typeof response,
                responseKeys: response ? Object.keys(response) : [],
                statusCode: response?.statusCode,
                headers: response?.headers,
                responseHeaders: response?.responseHeaders,
                contentType: response?.headers?.['content-type'] || response?.responseHeaders?.['content-type']
            });
            
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
                    responseTime: 0, // We can't measure response time for failed requests accurately
                    timestamp: new Date().toISOString(),
                    success: false
                };
                
                await Dataset.pushData(failedPageData);
                onPage?.(url);
                
                // Record failed request in metrics
                if (metricsCollector) {
                    metricsCollector.recordRequest({
                        url,
                        statusCode: response.statusCode,
                        responseTime: 0,
                        timestamp: new Date().toISOString(),
                        success: false,
                        error: `HTTP ${response.statusCode}`
                    });
                }
                
                logger.warn('Request failed', { url, statusCode: response.statusCode });
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

            // In auto mode, if the page has very few links, try JS-rendered version via Playwright
            if (mode === 'auto' && toEnqueue.length < 3) {
                jsFallbackUrls.add(url);
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
            onPage?.(request.url);
        },
        // Block non-HTML via pre/post navigation hooks
        // CheerioCrawler already fetches HTML only; still add a small delay between requests per host
        // by using autoscaled concurrency and not hammering one host too hard.
    });

    // Optional Playwright crawler for JS-rendered pages
    const jsFallbackUrls: Set<string> = new Set();
    const playwrightCrawler = new PlaywrightCrawler({
        maxConcurrency: Math.max(1, Math.floor(maxConcurrency / 5)),
        requestHandlerTimeoutSecs: 90,
        // Track request start time
        preNavigationHooks: [
            async ({ request }) => {
                requestStartTimes.set(request.url, Date.now());
            }
        ],
        requestHandler: async ({ request, page, enqueueLinks, log: reqLog }) => {
            const { url } = request;
            await page.waitForLoadState('domcontentloaded');
            // Give some time for JS to render links
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
                contentType: 'text/html', // Playwright typically handles HTML content
                lastModified: null, // Playwright doesn't easily expose response headers
                statusCode: 200, // Playwright doesn't easily expose status code
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
    const doneMsg = `Crawl complete. Pages discovered: ${itemCount}`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(itemCount);
}


