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

    const cheerioCrawler = new CheerioCrawler({
        requestQueue: queue,
        maxConcurrency,
        // Limit per-host rate a bit for politeness
        minConcurrency: Math.min(5, Math.max(1, Math.floor(maxConcurrency / 10))),
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 60,
        requestHandler: async ({ request, $, enqueueLinks, log: reqLog, response }) => {
            const { url } = request;
            const requestStartTime = Date.now();
            
            if (response?.statusCode && response.statusCode >= 400) {
                const duration = Date.now() - requestStartTime;
                const errorMsg = `Skipping ${url} due to status ${response.statusCode}`;
                reqLog.debug(errorMsg);
                onLog?.(errorMsg);
                
                // Record failed request in metrics
                if (metricsCollector) {
                    metricsCollector.recordRequest({
                        url,
                        statusCode: response.statusCode,
                        responseTime: duration,
                        timestamp: new Date().toISOString(),
                        success: false,
                        error: `HTTP ${response.statusCode}`
                    });
                }
                
                logger.warn('Request failed', { url, statusCode: response.statusCode, duration });
                return;
            }

            // Record the page URL
            await Dataset.pushData({ url });
            onPage?.(url);
            
            // Record successful request in metrics
            const duration = Date.now() - requestStartTime;
            if (metricsCollector) {
                metricsCollector.recordRequest({
                    url,
                    statusCode: response?.statusCode || 200,
                    responseTime: duration,
                    timestamp: new Date().toISOString(),
                    success: true
                });
            }
            
            logger.debug('Page processed', { url, duration });

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
        errorHandler: ({ request, error }) => {
            const warn = `Request failed ${request.url}: ${(error as Error).message}`;
            log.warning(warn);
            onLog?.(warn);
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
        requestHandler: async ({ request, page, enqueueLinks, log: reqLog }) => {
            const { url } = request;
            await page.waitForLoadState('domcontentloaded');
            // Give some time for JS to render links
            await page.waitForTimeout(500);
            onLog?.(`JS-rendered: ${url}`);
            await Dataset.pushData({ url });
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
        errorHandler: ({ request, error }) => {
            const warn = `Playwright failed ${request.url}: ${(error as Error).message}`;
            log.warning(warn);
            onLog?.(warn);
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


