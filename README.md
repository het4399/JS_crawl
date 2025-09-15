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


