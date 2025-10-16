import { 
  getQueueStats, 
  clearQueue, 
  addUrlToQueue, 
  getFailedJobs, 
  retryFailedJob,
  closeRedis 
} from './redis-queue.js';

async function main() {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'stats':
        const stats = await getQueueStats();
        console.log('📊 Redis SEO Queue Statistics:');
        console.log(`  Total queued: ${stats.totalQueued}`);
        console.log(`  Processing: ${stats.processing}`);
        console.log(`  Failed: ${stats.failed}`);
        console.log(`  Sample URLs: ${stats.queuedUrls.slice(0, 5).join(', ')}`);
        break;
        
      case 'clear':
        await clearQueue();
        console.log('✅ Queue cleared successfully');
        break;
        
      case 'add':
        const url = process.argv[3];
        const priority = parseInt(process.argv[4]) || 5;
        if (!url) {
          console.error('❌ URL is required');
          process.exit(1);
        }
        const success = await addUrlToQueue(url, priority);
        if (success) {
          console.log(`✅ URL added to queue: ${url}`);
        } else {
          console.log(`⚠️ URL already in queue: ${url}`);
        }
        break;
        
      case 'failed':
        const failedJobs = await getFailedJobs();
        console.log('❌ Failed Jobs:');
        failedJobs.forEach((url, index) => {
          console.log(`  ${index + 1}. ${url}`);
        });
        break;
        
      case 'retry':
        const retryUrl = process.argv[3];
        if (!retryUrl) {
          console.error('❌ URL is required for retry');
          process.exit(1);
        }
        const retrySuccess = await retryFailedJob(retryUrl);
        if (retrySuccess) {
          console.log(`✅ Job retried: ${retryUrl}`);
        } else {
          console.log(`❌ Failed to retry job: ${retryUrl}`);
        }
        break;
        
      case 'monitor':
        console.log('🔍 Monitoring queue (press Ctrl+C to stop)...');
        const monitorInterval = setInterval(async () => {
          const stats = await getQueueStats();
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] Queued: ${stats.totalQueued}, Processing: ${stats.processing}, Failed: ${stats.failed}`);
        }, 5000);
        
        process.on('SIGINT', () => {
          clearInterval(monitorInterval);
          console.log('\n👋 Monitoring stopped');
          process.exit(0);
        });
        break;
        
      default:
        console.log('🔧 Redis SEO Queue CLI');
        console.log('');
        console.log('Usage: npm run seo:redis-cli <command> [args]');
        console.log('');
        console.log('Commands:');
        console.log('  stats                    Show queue statistics');
        console.log('  clear                    Clear the entire queue');
        console.log('  add <url> [priority]      Add URL to queue (priority 1-10)');
        console.log('  failed                   List failed jobs');
        console.log('  retry <url>              Retry a failed job');
        console.log('  monitor                  Monitor queue in real-time');
        console.log('');
        console.log('Examples:');
        console.log('  npm run seo:redis-cli stats');
        console.log('  npm run seo:redis-cli add https://example.com 1');
        console.log('  npm run seo:redis-cli retry https://example.com');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  } finally {
    await closeRedis();
  }
}

main();
