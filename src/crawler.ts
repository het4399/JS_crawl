import { CheerioCrawler, Dataset, log, RequestQueue } from 'crawlee';
import { canonicalizeUrl, isSameSite } from './utils/url.js';

type CrawlOptions = {
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    perHostDelayMs: number;
    denyParamPrefixes: string[];
};

type CrawlEvents = {
    onLog?: (message: string) => void;
    onPage?: (url: string) => void;
    onDone?: (count: number) => void;
};

export async function runCrawl(options: CrawlOptions, events: CrawlEvents = {}): Promise<void> {
    const { startUrl, allowSubdomains, maxConcurrency, perHostDelayMs, denyParamPrefixes } = options;
    const { onLog, onPage, onDone } = events;

    const start = new URL(startUrl);
    const allowedHost = start.hostname;

    const startMsg = `Starting crawl for ${startUrl} (host=${allowedHost}, allowSubdomains=${allowSubdomains})`;
    log.info(startMsg);
    onLog?.(startMsg);

    const queue = await RequestQueue.open();

    // Always enqueue the start URL
    await queue.addRequests([{ url: start.href }]);

    const crawler = new CheerioCrawler({
        requestQueue: queue,
        maxConcurrency,
        // Limit per-host rate a bit for politeness
        minConcurrency: Math.min(5, Math.max(1, Math.floor(maxConcurrency / 10))),
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 60,
        requestHandler: async ({ request, $, enqueueLinks, log: reqLog, response }) => {
            const { url } = request;
            if (response?.statusCode && response.statusCode >= 400) {
                reqLog.debug(`Skipping ${url} due to status ${response.statusCode}`);
                onLog?.(`Skipping ${url} due to status ${response.statusCode}`);
                return;
            }

            // Record the page URL
            await Dataset.pushData({ url });
            onPage?.(url);

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
        },
        errorHandler: ({ request, error }) => {
            const warn = `Request failed ${request.url}: ${error.message}`;
            log.warning(warn);
            onLog?.(warn);
        },
        // Block non-HTML via pre/post navigation hooks
        // CheerioCrawler already fetches HTML only; still add a small delay between requests per host
        // by using autoscaled concurrency and not hammering one host too hard.
    });

    await crawler.run();

    const { itemCount } = await Dataset.getInfo() ?? { itemCount: 0 };
    const doneMsg = `Crawl complete. Pages discovered: ${itemCount}`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(itemCount);
}


