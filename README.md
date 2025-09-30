## Fast website crawler (TypeScript + Crawlee)

Discovers all pages on a site quickly using Crawlee's CheerioCrawler. No depth limit; constrained to the same site by default. Starts with sitemap seeding when available.

### Prerequisites
- Node.js 18+

### Install
```bash
npm install
```

### Run (dev)
```bash
npm run crawl -- https://example.com
```

### Environment vars (optional)
Create `.env` with:
```bash
CRAWL_MAX_CONCURRENCY=150
CRAWL_PER_HOST_DELAY_MS=150
ALLOW_SUBDOMAINS=false
DENY_PARAMS=utm_,session,sort,filter,ref,fbclid,gclid
```

### Output
- URLs are saved into the default Crawlee dataset (`storage/datasets/default`).
- Export as JSON Lines file at `storage/datasets/default/*.jsonl` after run.

### Notes
- This crawler is HTML-only (no Playwright). Enable a browser only if needed for JS-rendered links.
- It respects robots.txt and uses sitemaps if present.

### Audits (PSI integration – Phase -1/0)

We will integrate Google PageSpeed Insights (PSI) to collect Core Web Vitals without slowing the crawl.

Setup

1. Obtain a PSI API key from Google Cloud.
2. Set the environment variable `PSI_API_KEY` in your shell/CI (do not commit secrets).
3. Review `config/audits.json` for defaults (mobile-first, concurrency=12, TTL=24h, URL eligibility).

Behavior

- Audits are processed by separate workers and do not run inline during crawling.
- Robots.txt and `noindex` are honored; URLs are canonicalized and deduplicated.
- Parsed metrics are stored per URL; raw PSI responses may be retained for 7 days.


