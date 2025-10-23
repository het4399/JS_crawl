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

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function fetchPsi(
    url: string,
    device: DeviceStrategy,
    {
        timeoutMs = 10000,
        retries = 1,
        backoffBaseMs = 500,
        apiKey = process.env.PSI_API_KEY,
    }: { timeoutMs?: number; retries?: number; backoffBaseMs?: number; apiKey?: string } = {}
): Promise<PsiResult> {
    const debug = String(process.env.AUDITS_DEBUG || '').toLowerCase() === 'true';
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const params = new URLSearchParams({ url, strategy: device });
        if (apiKey) params.set('key', apiKey);

        const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
        const doFetch = async (): Promise<{ res: Response; ms: number }> => {
            const start = Date.now();
            const res = await fetch(endpoint, { signal: controller.signal });
            const ms = Date.now() - start;
            return { res, ms };
        };

        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                const { res, ms } = await doFetch();
                if (debug) {
                    // eslint-disable-next-line no-console
                    console.log(`[psi] attempt=${attempt + 1} status=${res.status} ms=${ms} device=${device} url=${url}`);
                }
                if (res.status === 429 || res.status >= 500) {
                    throw new Error(`PSI transient error ${res.status}`);
                }
                const json = await res.json();
                const fieldBlock = json.loadingExperience?.metrics || json.originLoadingExperience?.metrics;
                const audits = json.lighthouseResult?.audits;
                const result: PsiResult = {
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
                return result;
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
                await sleep(backoffBaseMs * Math.pow(2, attempt));
                attempt++;
            }
        }
    } finally {
        clearTimeout(to);
    }
}


