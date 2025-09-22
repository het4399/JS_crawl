import { Router } from 'express';
import { HealthChecker } from '../monitoring/HealthCheck.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { Logger } from '../logging/Logger.js';
import { RequestQueue } from 'crawlee';
import { getDatabase } from '../database/DatabaseService.js';

const router = Router();
const healthChecker = new HealthChecker();
const metricsCollector = new MetricsCollector();
const logger = Logger.getInstance();

// Health check endpoint
router.get('/health', (req, res) => {
  try {
    const healthStatus = healthChecker.getHealthStatus();
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', error as Error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
router.get('/metrics', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error as Error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Request history endpoint
router.get('/requests', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const requests = metricsCollector.getRequestHistory(limit);
    res.json(requests);
  } catch (error) {
    logger.error('Failed to get request history', error as Error);
    res.status(500).json({ error: 'Failed to get request history' });
  }
});

// Error summary endpoint
router.get('/errors', (req, res) => {
  try {
    const errorSummary = metricsCollector.getErrorSummary();
    res.json(errorSummary);
  } catch (error) {
    logger.error('Failed to get error summary', error as Error);
    res.status(500).json({ error: 'Failed to get error summary' });
  }
});

// Logs endpoint
router.get('/logs', (req, res) => {
  try {
    const level = req.query.level as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = logger.getLogs(level, limit);
    res.json(logs);
  } catch (error) {
    logger.error('Failed to get logs', error as Error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// Logs by time range
router.get('/logs/range', (req, res) => {
  try {
    const { startTime, endTime } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime query parameters are required' });
    }
    const logs = logger.getLogsByTimeRange(startTime as string, endTime as string);
    res.json(logs);
  } catch (error) {
    logger.error('Failed to get logs by time range', error as Error);
    res.status(500).json({ error: 'Failed to get logs by time range' });
  }
});

// Clear logs endpoint (admin only)
router.delete('/logs', (req, res) => {
  try {
    logger.clearLogs();
    res.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    logger.error('Failed to clear logs', error as Error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Reset metrics endpoint (admin only)
router.delete('/metrics', (req, res) => {
  try {
    metricsCollector.reset();
    res.json({ message: 'Metrics reset successfully' });
  } catch (error) {
    logger.error('Failed to reset metrics', error as Error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// Export crawl data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', limit } = req.query;
    logger.info('Export request received', { format, limit });
    
    const db = getDatabase();
    const limitNum = limit ? parseInt(limit as string) : undefined;

    const pages = db.getPages(undefined, limitNum || 10000, 0);
    const resources = db.getResources(undefined, undefined, limitNum || 10000, 0);
    const items = [...pages, ...resources];
    
    if (!items || items.length === 0) {
      logger.warn('No crawl data found for export');
      return res.status(404).json({ error: 'No crawl data found', message: 'Please run a crawl first to generate data for export' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crawl-results-${timestamp}`;

    switch (format) {
      case 'csv': {
        const csv = convertToCSV(items);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
        break;
      }
      case 'txt': {
        const txt = items.map((item: any) => item.url).join('\n');
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(txt);
        break;
      }
      case 'xml': {
        const xml = convertToXML(items);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
        res.send(xml);
        break;
      }
      case 'json':
      default: {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
          exportInfo: { timestamp: new Date().toISOString(), totalUrls: items.length, format: 'json' },
          urls: items,
        });
      }
    }

    logger.info('Data exported', { format, count: items.length });
  } catch (error) {
    logger.error('Failed to export data', error as Error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Export metrics
router.get('/export/metrics', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const metrics = metricsCollector.getMetrics();
    const requestHistory = metricsCollector.getRequestHistory();
    const errorSummary = metricsCollector.getErrorSummary();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crawl-metrics-${timestamp}`;
    
    const exportData = {
      exportInfo: { timestamp: new Date().toISOString(), format: format as string },
      metrics,
      requestHistory,
      errorSummary,
    };

    if (format === 'csv') {
      const csv = convertMetricsToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(exportData);
    }
    
    logger.info('Metrics exported', { format });
  } catch (error) {
    logger.error('Failed to export metrics', error as Error);
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

// Helper functions
function convertToCSV(items: any[]): string {
  if (items.length === 0) return '';
  const headers = Object.keys(items[0]);
  const csvHeaders = headers.join(',');
  const csvRows = items.map(item => headers.map(header => {
      const value = item[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
  }).join(','));
  return [csvHeaders, ...csvRows].join('\n');
}

function convertToXML(items: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<crawlResults>\n';
  xml += '  <exportInfo>\n';
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += `    <totalUrls>${items.length}</totalUrls>\n`;
  xml += '  </exportInfo>\n';
  xml += '  <urls>\n';
  items.forEach((item, index) => {
    xml += `    <url id="${index + 1}">\n`;
    xml += `      <value><![CDATA[${item.url}]]></value>\n`;
    xml += '    </url>\n';
  });
  xml += '  </urls>\n';
  xml += '</crawlResults>';
  return xml;
}

function convertMetricsToCSV(data: any): string {
  const lines: string[] = [];
  lines.push('Section,Field,Value');
  lines.push(`Export Info,Timestamp,${data.exportInfo.timestamp}`);
  lines.push(`Export Info,Format,${data.exportInfo.format}`);
  lines.push('Metrics,Total Pages,' + data.metrics.totalPages);
  lines.push('Metrics,Successful Requests,' + data.metrics.successfulRequests);
  lines.push('Metrics,Failed Requests,' + data.metrics.failedRequests);
  lines.push('Metrics,Average Response Time,' + data.metrics.averageResponseTime);
  lines.push('Metrics,Requests Per Minute,' + data.metrics.requestsPerMinute);
  lines.push('Metrics,Duration,' + data.metrics.duration);
  data.errorSummary.forEach((error: any) => {
    lines.push(`Error,${error.type},${error.count} (${error.percentage}%)`);
  });
  return lines.join('\n');
}

// Check data availability (DB only)
router.get('/data/check', async (req, res) => {
  try {
    const db = getDatabase();
    const totalPages = db.getPageCount();
    const totalResources = db.getResourceCount();
    const totalItems = totalPages + totalResources;
    res.json({
      hasData: totalItems > 0,
      itemCount: totalItems,
      totalItems,
      totalPages,
      totalResources,
      message: totalItems > 0
        ? `Database contains ${totalItems} items (${totalPages} pages, ${totalResources} resources)`
        : 'No data available - run a crawl first'
    });
  } catch (error) {
    logger.error('Failed to check data availability', error as Error);
    res.status(500).json({ hasData: false, error: 'Failed to check data availability' });
  }
});

// List all data (pages and resources)
router.get('/data/list', async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;

    // Tag pages so the UI can distinguish them from resources
    const pages = db.getPages(sessionId, limit, offset).map((p: any) => ({ ...p, resourceType: 'page' }));
    const resources = db.getResources(sessionId, undefined, limit, offset);
    const allData = [...pages, ...resources].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalPages = db.getPageCount(sessionId);
    const totalResources = db.getResourceCount(sessionId);
    const totalItems = totalPages + totalResources;

    res.json({
      data: allData,
      paging: {
        limit,
        offset,
        count: allData.length,
        total: totalItems,
        hasMore: offset + allData.length < totalItems,
      },
      datasetInfo: {
        name: 'database',
        itemCount: allData.length,
        totalItems,
        totalPages,
        totalResources,
        hasData: totalItems > 0,
      },
      message: totalItems > 0
        ? `Database contains ${totalItems} items (${totalPages} pages, ${totalResources} resources)`
        : 'Database is empty - run a crawl first',
    });
  } catch (error) {
    logger.error('Failed to list database data', error as Error);
    res.status(500).json({ error: 'Failed to retrieve data', details: (error as Error).message });
  }
});

// Clear all data endpoint
router.delete('/data/clear', async (req, res) => {
  try {
    const db = getDatabase();
    db.clearAllData();
    
    const requestQueue = await RequestQueue.open();
    const queueInfo = await requestQueue.getInfo();
    logger.info('Clearing request queue', { 
      queueName: queueInfo?.name, 
      pendingCount: queueInfo?.pendingRequestCount,
      handledCount: queueInfo?.handledRequestCount,
    });
    await requestQueue.drop();
    
    metricsCollector.reset();
    logger.clearLogs();
    
    res.json({ message: 'All data cleared successfully (database, queue, metrics, and logs)', timestamp: new Date().toISOString() });
    logger.info('All data cleared by user request');
  } catch (error) {
    logger.error('Failed to clear data', error as Error);
    res.status(500).json({ error: 'Failed to clear data', details: (error as Error).message, timestamp: new Date().toISOString() });
  }
});

// Status endpoint (simplified health check)
router.get('/status', (req, res) => {
  try {
    const isHealthy = healthChecker.isHealthy();
    const metrics = metricsCollector.getMetrics();
    res.json({
      healthy: isHealthy,
      activeCrawls: metrics.totalPages > 0,
      totalPages: metrics.totalPages,
      successRate: metrics.totalPages > 0 ? Math.round((metrics.successfulRequests / metrics.totalPages) * 100) : 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get status', error as Error);
    res.status(500).json({ healthy: false, error: 'Status check failed', timestamp: new Date().toISOString() });
  }
});

export { router as monitoringRoutes, healthChecker, metricsCollector };


