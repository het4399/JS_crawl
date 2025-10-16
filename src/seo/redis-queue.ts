import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

type SeoEligibility = {
  httpsOnly: boolean;
  sameOriginOnly: boolean;
  contentTypeAllow: string[];
  minWordCount: number;
  maxWordCount: number;
};

type SeoJob = {
  url: string;
  sessionId?: number;
  priority?: number;
  contentType?: string;
  wordCount?: number;
  addedAt: string;
};

type QueueStats = {
  totalQueued: number;
  queuedUrls: string[];
  processing: number;
  failed: number;
};

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'redis.json');
const SEO_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'seo.json');

let redis: Redis | null = null;
let cachedHost: string | null = null;
let allowlistContentTypes: Set<string> = new Set(['text/html']);
let httpsOnly = true;
let sameOriginOnly = true;
let minWordCount = 100;
let maxWordCount = 10000;

function loadRedisConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return config;
  } catch (error) {
    console.warn('Redis config not found, using defaults');
    return {
      host: 'localhost',
      port: 6379,
      password: null,
      db: 0,
      keyPrefix: 'seo:',
      queues: {
        seo: 'seo:queue',
        'seo-priority': 'seo:priority-queue',
        'seo-processing': 'seo:processing',
        'seo-failed': 'seo:failed'
      }
    };
  }
}

function loadSeoConfig(): SeoEligibility {
  try {
    const cfg = JSON.parse(fs.readFileSync(SEO_CONFIG_PATH, 'utf-8'));
    httpsOnly = Boolean(cfg?.urlEligibility?.httpsOnly ?? true);
    sameOriginOnly = Boolean(cfg?.urlEligibility?.sameOriginOnly ?? true);
    minWordCount = Number(cfg?.urlEligibility?.minWordCount ?? 100);
    maxWordCount = Number(cfg?.urlEligibility?.maxWordCount ?? 10000);
    const arr: string[] = Array.isArray(cfg?.urlEligibility?.contentTypeAllow) ? cfg.urlEligibility.contentTypeAllow : ['text/html'];
    allowlistContentTypes = new Set(arr.map((s) => String(s).toLowerCase()));
  } catch {
    httpsOnly = true;
    sameOriginOnly = true;
    minWordCount = 100;
    maxWordCount = 10000;
    allowlistContentTypes = new Set(['text/html']);
  }
  return { httpsOnly, sameOriginOnly, contentTypeAllow: Array.from(allowlistContentTypes), minWordCount, maxWordCount };
}

async function getRedis(): Promise<Redis> {
  if (!redis) {
    const config = loadRedisConfig();
    redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      lazyConnect: config.lazyConnect !== false,
      keyPrefix: config.keyPrefix || 'seo:'
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }
  return redis;
}

export async function initSeoEnqueue(startUrl: string): Promise<void> {
  try {
    cachedHost = new URL(startUrl).hostname;
    loadSeoConfig();
    await getRedis();
    console.log(`[redis-queue] Initialized for host: ${cachedHost}`);
  } catch (error) {
    console.error('[redis-queue] Initialization failed:', error);
    throw error;
  }
}

export async function maybeEnqueueSeo(url: string, contentType?: string, wordCount?: number): Promise<boolean> {
  try {
    if (!cachedHost) return false; // not initialized
    
    const u = new URL(url);
    if (httpsOnly && u.protocol !== 'https:') return false;
    if (sameOriginOnly && u.hostname !== cachedHost) return false;
    
    const ct = (contentType || '').toLowerCase();
    if (ct) {
      const base = ct.split(';')[0].trim();
      if (!allowlistContentTypes.has(base)) return false;
    }
    
    // Check word count eligibility
    if (wordCount !== undefined) {
      if (wordCount < minWordCount || wordCount > maxWordCount) return false;
    }
    
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Check if URL is already queued or processing
    const isQueued = await redisClient.sismember(`${config.queues.seo}:set`, url);
    const isProcessing = await redisClient.sismember(`${config.queues['seo-processing']}:set`, url);
    
    if (isQueued || isProcessing) return false;
    
    // Create job object
    const job: SeoJob = {
      url,
      contentType,
      wordCount,
      addedAt: new Date().toISOString()
    };
    
    // Add to priority queue (lower number = higher priority)
    const priority = wordCount ? Math.max(1, Math.min(10, Math.floor(wordCount / 1000))) : 5;
    
    await redisClient.zadd(config.queues['seo-priority'], priority, JSON.stringify(job));
    await redisClient.sadd(`${config.queues.seo}:set`, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Enqueue failed:', error);
    return false;
  }
}

export async function dequeueSeo(): Promise<SeoJob | null> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Get highest priority job (lowest score) - compatible with Redis 3.0
    const result = await redisClient.zrange(config.queues['seo-priority'], 0, 0, 'WITHSCORES');
    if (!result || result.length === 0) return null;
    
    const job: SeoJob = JSON.parse(result[0]);
    
    // Remove from priority queue
    await redisClient.zrem(config.queues['seo-priority'], result[0]);
    
    // Move to processing set
    await redisClient.sadd(`${config.queues['seo-processing']}:set`, job.url);
    await redisClient.srem(`${config.queues.seo}:set`, job.url);
    
    // Set processing TTL
    await redisClient.expire(`${config.queues['seo-processing']}:set`, config.ttl?.processing || 300);
    
    return job;
  } catch (error) {
    console.error('[redis-queue] Dequeue failed:', error);
    return null;
  }
}

export async function markJobComplete(url: string, success: boolean): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Remove from processing
    await redisClient.srem(`${config.queues['seo-processing']}:set`, url);
    
    if (!success) {
      // Move to failed queue
      await redisClient.sadd(`${config.queues['seo-failed']}:set`, url);
      await redisClient.expire(`${config.queues['seo-failed']}:set`, config.ttl?.failed || 86400);
    }
  } catch (error) {
    console.error('[redis-queue] Mark complete failed:', error);
  }
}

export async function getQueueStats(): Promise<QueueStats> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    const [totalQueued, processing, failed] = await Promise.all([
      redisClient.zcard(config.queues['seo-priority']),
      redisClient.scard(`${config.queues['seo-processing']}:set`),
      redisClient.scard(`${config.queues['seo-failed']}:set`)
    ]);
    
    // Get sample of queued URLs - compatible with Redis 3.0
    const queuedJobs = await redisClient.zrange(config.queues['seo-priority'], 0, 9);
    const queuedUrls = queuedJobs.map(job => {
      try {
        return JSON.parse(job).url;
      } catch {
        return job; // fallback if parsing fails
      }
    });
    
    return {
      totalQueued,
      queuedUrls,
      processing,
      failed
    };
  } catch (error) {
    console.error('[redis-queue] Get stats failed:', error);
    return {
      totalQueued: 0,
      queuedUrls: [],
      processing: 0,
      failed: 0
    };
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    await Promise.all([
      redisClient.del(config.queues['seo-priority']),
      redisClient.del(`${config.queues.seo}:set`),
      redisClient.del(`${config.queues['seo-processing']}:set`),
      redisClient.del(`${config.queues['seo-failed']}:set`)
    ]);
    
    console.log('[redis-queue] Queue cleared successfully');
  } catch (error) {
    console.error('[redis-queue] Clear queue failed:', error);
    throw error;
  }
}

export async function addUrlToQueue(url: string, priority = 5): Promise<boolean> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Check if already queued
    const isQueued = await redisClient.sismember(`${config.queues.seo}:set`, url);
    if (isQueued) return false;
    
    const job: SeoJob = {
      url,
      addedAt: new Date().toISOString()
    };
    
    await redisClient.zadd(config.queues['seo-priority'], priority, JSON.stringify(job));
    await redisClient.sadd(`${config.queues.seo}:set`, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Add URL failed:', error);
    return false;
  }
}

export async function getFailedJobs(): Promise<string[]> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    return await redisClient.smembers(`${config.queues['seo-failed']}:set`);
  } catch (error) {
    console.error('[redis-queue] Get failed jobs failed:', error);
    return [];
  }
}

export async function retryFailedJob(url: string): Promise<boolean> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Remove from failed
    await redisClient.srem(`${config.queues['seo-failed']}:set`, url);
    
    // Add back to queue
    const job: SeoJob = {
      url,
      addedAt: new Date().toISOString()
    };
    
    await redisClient.zadd(config.queues['seo-priority'], 1, JSON.stringify(job)); // High priority for retry
    await redisClient.sadd(`${config.queues.seo}:set`, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Retry failed job failed:', error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
