import { dequeueSeo, markJobComplete, getQueueStats, closeRedis } from './redis-queue.js';
import { getDatabase } from '../database/DatabaseService.js';
import fs from 'fs';
import path from 'path';

type SeoJob = {
  url: string;
  sessionId?: number;
  priority?: number;
  contentType?: string;
  wordCount?: number;
  addedAt: string;
};

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'seo.json');

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return cfg;
  } catch (e) {
    return {
      concurrency: 3,
      timeoutMs: 30000,
      retries: 2,
      backoffBaseMs: 1000,
      pythonApiBase: 'http://localhost:8000'
    };
  }
}

async function extractSeoKeywords(url: string, config: any): Promise<any> {
  const pythonApiBase = config.pythonApiBase || 'http://localhost:8000';
  
  try {
    // Fetch HTML content
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEO-Extractor/1.0)' },
      signal: AbortSignal.timeout(config.timeoutMs || 30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    if (!html || html.trim().length === 0) {
      throw new Error('No HTML content retrieved');
    }
    
    // Call Python API for keyword extraction
    const payload = {
      url: url,
      final_url: response.url,
      status_code: response.status,
      html: html,
      fetched_at: new Date().toISOString()
    };
    
    const seoResponse = await fetch(`${pythonApiBase}/extract_html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs || 30000)
    });
    
    if (!seoResponse.ok) {
      const errorText = await seoResponse.text();
      throw new Error(`SEO API error: ${seoResponse.status} - ${errorText}`);
    }
    
    return await seoResponse.json();
  } catch (error) {
    throw new Error(`SEO extraction failed for ${url}: ${(error as Error).message}`);
  }
}

async function saveSeoResult(url: string, result: any, sessionId?: number): Promise<void> {
  try {
    const db = getDatabase();
    
    // Cache the SEO data
    await db.cacheSeoData(url, {
      parentText: result.parent?.text,
      keywords: result.keywords,
      language: result.language
    });
    
    console.log(`[redis-worker] ${url} -> cached successfully`);
  } catch (error) {
    console.error(`[redis-worker] ${url} -> cache error:`, (error as Error).message);
    throw error;
  }
}

async function processJob(job: SeoJob, config: any): Promise<boolean> {
  const maxRetries = config.retries || 2;
  const backoffBase = config.backoffBaseMs || 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[redis-worker] Processing ${job.url} (attempt ${attempt}/${maxRetries})`);
      
      const result = await extractSeoKeywords(job.url, config);
      await saveSeoResult(job.url, result, job.sessionId);
      
      console.log(`[redis-worker] ✓ ${job.url} completed successfully`);
      return true;
      
    } catch (error) {
      console.error(`[redis-worker] ✗ ${job.url} attempt ${attempt} failed:`, (error as Error).message);
      
      if (attempt < maxRetries) {
        const backoffDelay = backoffBase * Math.pow(2, attempt - 1);
        console.log(`[redis-worker] Retrying ${job.url} in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  console.error(`[redis-worker] ✗ ${job.url} failed after ${maxRetries} attempts`);
  return false;
}

async function worker(concurrency: number) {
  const config = loadConfig();
  let processed = 0;
  let errors = 0;
  let running = true;
  
  console.log(`[redis-worker] Starting with concurrency=${concurrency}`);
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('[redis-worker] Received SIGINT, shutting down gracefully...');
    running = false;
  });
  
  process.on('SIGTERM', () => {
    console.log('[redis-worker] Received SIGTERM, shutting down gracefully...');
    running = false;
  });
  
  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    console.log(`[redis-worker] Worker ${workerId + 1} started`);
    
    while (running) {
      try {
        const job = await dequeueSeo();
        
        if (!job) {
          // No jobs available, wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        console.log(`[redis-worker] Worker ${workerId + 1} processing: ${job.url}`);
        
        const success = await processJob(job, config);
        
        await markJobComplete(job.url, success);
        
        if (success) {
          processed++;
        } else {
          errors++;
        }
        
        // Progress reporting
        if ((processed + errors) % 10 === 0) {
          const stats = await getQueueStats();
          console.log(`[redis-worker] Progress: ${processed} successful, ${errors} errors, ${stats.totalQueued} queued, ${stats.processing} processing`);
        }
        
      } catch (error) {
        console.error(`[redis-worker] Worker ${workerId + 1} error:`, (error as Error).message);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
      }
    }
    
    console.log(`[redis-worker] Worker ${workerId + 1} stopped`);
  });
  
  // Wait for all workers to complete
  await Promise.all(workers);
  
  console.log(`[redis-worker] Final stats: ${processed} successful, ${errors} errors`);
}

async function main() {
  const config = loadConfig();
  const concurrency: number = Number(process.env.SEO_CONCURRENCY) || Number(config.concurrency) || 3;
  
  console.log(`[redis-worker] Starting Redis-based SEO worker with concurrency=${concurrency}`);
  
  if (String(process.env.SEO_DEBUG || '').toLowerCase() === 'true') {
    console.log('[redis-worker] Debug on. Config:', {
      timeoutMs: config.timeoutMs || 30000,
      retries: config.retries || 2,
      backoffBaseMs: config.backoffBaseMs || 1000,
      pythonApiBase: config.pythonApiBase || 'http://localhost:8000'
    });
  }
  
  try {
    await worker(concurrency);
  } finally {
    await closeRedis();
    console.log('[redis-worker] Redis connection closed');
  }
}

main().catch((e) => {
  console.error('[redis-worker] Fatal error:', e);
  process.exit(1);
});
