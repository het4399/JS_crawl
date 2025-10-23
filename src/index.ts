import 'dotenv/config';
import { runCrawl } from './crawler.js';

function getEnvBoolean(name: string, def: boolean): boolean {
    const v = process.env[name];
    if (v === undefined) return def;
    return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
}

function getEnvNumber(name: string, def: number): number {
    const v = process.env[name];
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : def;
}

async function main() {
    const startUrl = process.argv[2] || process.env.START_URL;
    if (!startUrl) {
        console.error('Usage: npm run crawl -- <https://example.com>');
        process.exit(1);
    }

    const allowSubdomains = true;
    const maxConcurrency = 150;
    const perHostDelayMs = getEnvNumber('CRAWL_PER_HOST_DELAY_MS', 150);
    const captureLinkDetails = getEnvBoolean('CAPTURE_LINK_DETAILS', true);
    const denyParams = (process.env.DENY_PARAMS || 'utm_,session,sort,filter,ref,fbclid,gclid')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    await runCrawl({
        startUrl,
        allowSubdomains,
        maxConcurrency,
        perHostDelayMs,
        denyParamPrefixes: denyParams,
        mode: 'html',
        captureLinkDetails
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});


