import fs from 'fs';
import path from 'path';

type Eligibility = {
  httpsOnly: boolean;
  sameOriginOnly: boolean;
  contentTypeAllow: string[];
};

const QUEUE_FILE = path.resolve(process.cwd(), 'storage', 'audit-queue.txt');
const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'audits.json');

let cachedHost: string | null = null;
let allowlistContentTypes: Set<string> = new Set(['text/html']);
let httpsOnly = true;
let sameOriginOnly = true;
const queued = new Set<string>();

function loadConfig(): Eligibility {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    httpsOnly = Boolean(cfg?.urlEligibility?.httpsOnly ?? true);
    sameOriginOnly = Boolean(cfg?.urlEligibility?.sameOriginOnly ?? true);
    const arr: string[] = Array.isArray(cfg?.urlEligibility?.contentTypeAllow) ? cfg.urlEligibility.contentTypeAllow : ['text/html'];
    allowlistContentTypes = new Set(arr.map((s) => String(s).toLowerCase()));
  } catch {
    httpsOnly = true;
    sameOriginOnly = true;
    allowlistContentTypes = new Set(['text/html']);
  }
  return { httpsOnly, sameOriginOnly, contentTypeAllow: Array.from(allowlistContentTypes) };
}

function ensureQueueFile() {
  const dir = path.dirname(QUEUE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(QUEUE_FILE)) {
    const content = fs.readFileSync(QUEUE_FILE, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const url = line.trim();
      if (url) queued.add(url);
    }
  }
}

export function initAuditEnqueue(startUrl: string) {
  cachedHost = new URL(startUrl).hostname;
  loadConfig();
  ensureQueueFile();
}

export function maybeEnqueueAudit(url: string, contentType?: string) {
  try {
    if (!cachedHost) return; // not initialized
    const u = new URL(url);
    if (httpsOnly && u.protocol !== 'https:') return;
    if (sameOriginOnly && u.hostname !== cachedHost) return;
    const ct = (contentType || '').toLowerCase();
    if (ct) {
      const base = ct.split(';')[0].trim();
      if (!allowlistContentTypes.has(base)) return;
    }
    if (queued.has(url)) return;
    fs.appendFileSync(QUEUE_FILE, url + '\n', 'utf-8');
    queued.add(url);
  } catch {
    // ignore enqueue errors to avoid impacting crawl
  }
}


