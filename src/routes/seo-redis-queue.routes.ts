import express from 'express';
import { 
  getQueueStats, 
  clearQueue, 
  addUrlToQueue, 
  getFailedJobs, 
  retryFailedJob,
  closeRedis 
} from '../seo/redis-queue.js';
import { getDatabase } from '../database/DatabaseService.js';

const router = express.Router();

// Get queue statistics
router.get('/api/seo/queue/stats', async (_req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get queue stats', details: (err as Error).message });
  }
});

// Clear the queue
router.post('/api/seo/queue/clear', async (_req, res) => {
  try {
    await clearQueue();
    res.json({ message: 'Queue cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear queue', details: (err as Error).message });
  }
});

// Add URL to queue
router.post('/api/seo/queue/add', async (req, res) => {
  try {
    const { url, priority = 5 } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const success = await addUrlToQueue(url, priority);
    if (!success) {
      return res.status(409).json({ error: 'URL already in queue or processing' });
    }
    
    res.json({ message: 'URL added to queue successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add URL to queue', details: (err as Error).message });
  }
});

// Process the queue (start worker)
router.post('/api/seo/queue/process', async (_req, res) => {
  try {
    // This would typically start a background worker process
    // For now, we'll just return success
    res.json({ message: 'Queue processing started. Run: npm run seo:redis-worker' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start queue processing', details: (err as Error).message });
  }
});

// Get failed jobs
router.get('/api/seo/queue/failed', async (_req, res) => {
  try {
    const failedJobs = await getFailedJobs();
    res.json({ failedJobs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get failed jobs', details: (err as Error).message });
  }
});

// Retry failed job
router.post('/api/seo/queue/retry', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const success = await retryFailedJob(url);
    if (!success) {
      return res.status(404).json({ error: 'Failed job not found' });
    }
    
    res.json({ message: 'Job retried successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retry job', details: (err as Error).message });
  }
});

// Get cache statistics
router.get('/api/seo/cache/stats', async (_req, res) => {
  try {
    const db = getDatabase();
    const stats = await db.getSeoCacheStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get cache stats', details: (err as Error).message });
  }
});

// Clear expired cache entries
router.post('/api/seo/cache/clear-expired', async (_req, res) => {
  try {
    const db = getDatabase();
    const deletedCount = await db.clearExpiredSeoCache();
    res.json({ message: `Cleared ${deletedCount} expired entries` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear expired cache', details: (err as Error).message });
  }
});

// Health check
router.get('/api/seo/health', async (_req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({ 
      status: 'healthy', 
      queue: stats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: (err as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connections...');
  await closeRedis();
  process.exit(0);
});

export default router;
