import 'dotenv/config';

export type DeviceStrategy = 'mobile' | 'desktop';

export type PsiLabMetrics = {
    LCP_ms?: number;
    TBT_ms?: number;
    CLS?: number;
    FCP_ms?: number;
    TTFB_ms?: number;
    performanceScore?: number;
};

export type PsiFieldMetrics = {
    LCP_ms?: number;
    CLS?: number;
    coverage: 'url' | 'origin' | 'none';
};

export type PsiResult = {
    url: string;
    device: DeviceStrategy;
    runAt: string;
    field?: PsiFieldMetrics | null;
    lab?: PsiLabMetrics | null;
    psiReportUrl?: string;
    raw?: unknown;
};

// Global request queue for rate limiting optimization
class RateLimiter {
    private queue: Array<() => Promise<any>> = [];
    private activeRequests = 0;
    private maxConcurrent: number;
    private requestsPerSecond: number;
    private lastRequestTime = 0;

    constructor(maxConcurrent = 30, requestsPerSecond = 100) {
        this.maxConcurrent = maxConcurrent;
        this.requestsPerSecond = requestsPerSecond;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        this.activeRequests++;
        const task = this.queue.shift();
        
        if (task) {
            // Rate limiting: ensure minimum gap between requests
            const now = Date.now();
            const minGap = 1000 / this.requestsPerSecond;
            const timeSinceLastRequest = now - this.lastRequestTime;
            
            if (timeSinceLastRequest < minGap) {
                await new Promise(resolve => setTimeout(resolve, minGap - timeSinceLastRequest));
            }

            this.lastRequestTime = Date.now();
            
            try {
                await task();
            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        }
    }
}

const globalRateLimiter = new RateLimiter(30, 100);

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Optimized PSI fetch with better concurrency and rate limiting
 */
export async function fetchPsi(
    url: string,
    device: DeviceStrategy,
    {
        timeoutMs = 30000,
        retries = 1,
        backoffBaseMs = 200,
        apiKey = process.env.PSI_API_KEY,
        useRateLimiter = true,
    }: { timeoutMs?: number; retries?: number; backoffBaseMs?: number; apiKey?: string; useRateLimiter?: boolean } = {}
): Promise<PsiResult> {
    const debug = String(process.env.AUDITS_DEBUG || '').toLowerCase() === 'true';
    
    const doRequest = async (): Promise<PsiResult> => {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            const params = new URLSearchParams({ 
                url, 
                strategy: device,
                // Optimize for faster responses - only get critical metrics
                category: 'performance',
            });
            if (apiKey) params.set('key', apiKey);

            const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
            
            let attempt = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                try {
                    const start = Date.now();
                    const res = await fetch(endpoint, { 
                        signal: controller.signal,
                        headers: {
                            'Accept-Encoding': 'gzip',
                        }
                    });
                    const ms = Date.now() - start;
                    
                    if (debug) {
                        // eslint-disable-next-line no-console
                        console.log(`[psi] attempt=${attempt + 1} status=${res.status} ms=${ms} device=${device} url=${url}`);
                    }
                    
                    // Handle rate limiting (429) and server errors (5xx) with retry
                    if (res.status === 429) {
                        // Extract retry-after header if available
                        const retryAfter = res.headers.get('retry-after');
                        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : backoffBaseMs * Math.pow(2, attempt);
                        
                        if (attempt >= retries) {
                            throw new Error(`PSI rate limited (429) after ${attempt + 1} attempts`);
                        }
                        
                        if (debug) console.log(`[psi] rate limited, waiting ${waitMs}ms before retry`);
                        await sleep(waitMs);
                        attempt++;
                        continue;
                    }
                    
                    if (res.status >= 500) {
                        if (attempt >= retries) {
                            throw new Error(`PSI server error ${res.status}`);
                        }
                        const waitMs = backoffBaseMs * Math.pow(2, attempt);
                        if (debug) console.log(`[psi] server error ${res.status}, waiting ${waitMs}ms`);
                        await sleep(waitMs);
                        attempt++;
                        continue;
                    }

                    if (res.status !== 200) {
                        throw new Error(`PSI HTTP ${res.status}`);
                    }

                    const json = await res.json();
                    return parseApiResponse(url, device, json);
                    
                } catch (err) {
                    if (debug) {
                        // eslint-disable-next-line no-console
                        console.error(`[psi] error attempt=${attempt + 1} device=${device} url=${url} ->`, (err as Error).message);
                    }
                    
                    // Distinguish timeout/abort
                    if ((err as any)?.name === 'AbortError') {
                        const timeoutError = new Error(`PSI request timed out after ${timeoutMs}ms`);
                        if (attempt >= retries) throw timeoutError;
                    } else if (attempt >= retries) {
                        throw err;
                    }
                    
                    const waitMs = backoffBaseMs * Math.pow(2, attempt);
                    await sleep(waitMs);
                    attempt++;
                }
            }
        } finally {
            clearTimeout(to);
        }
    };

    // Use global rate limiter if enabled (for high concurrency scenarios)
    if (useRateLimiter) {
        return globalRateLimiter.execute(() => doRequest());
    } else {
        return doRequest();
    }
}

/**
 * Parse PSI API response and extract metrics
 */
function parseApiResponse(url: string, device: DeviceStrategy, json: any): PsiResult {
    const fieldBlock = json.loadingExperience?.metrics || json.originLoadingExperience?.metrics;
    const audits = json.lighthouseResult?.audits;

    return {
        url,
        device,
        runAt: new Date().toISOString(),
        field: fieldBlock
            ? {
                  LCP_ms: fieldBlock.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
                  CLS: fieldBlock.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
                  coverage: json.loadingExperience?.metrics ? 'url' : json.originLoadingExperience?.metrics ? 'origin' : 'none',
              }
            : { coverage: 'none' },
        lab: audits
            ? {
                  LCP_ms: audits['largest-contentful-paint']?.numericValue,
                  TBT_ms: audits['total-blocking-time']?.numericValue,
                  CLS: audits['cumulative-layout-shift']?.numericValue,
                  FCP_ms: audits['first-contentful-paint']?.numericValue,
                  TTFB_ms: audits['server-response-time']?.numericValue ?? audits['time-to-first-byte']?.numericValue,
                  performanceScore: json.lighthouseResult?.categories?.performance?.score ? Math.round(json.lighthouseResult.categories.performance.score * 100) : undefined,
              }
            : undefined,
        psiReportUrl: json.lighthouseResult?.finalDisplayedUrl,
        raw: json,
    };
}


