import { Router } from 'express';
import { HealthChecker } from '../monitoring/HealthCheck.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { Logger } from '../logging/Logger.js';
import { Dataset } from 'crawlee';

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
      return res.status(400).json({ 
        error: 'startTime and endTime query parameters are required' 
      });
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
    
    const dataset = await Dataset.open();
    const data = await dataset.getData({ limit: limit ? parseInt(limit as string) : undefined });
    
    logger.info('Dataset data retrieved', { 
      hasData: !!data, 
      itemCount: data?.items?.length || 0,
      totalItems: data?.total || 0
    });
    
    if (!data || !data.items || data.items.length === 0) {
      logger.warn('No crawl data found for export');
      return res.status(404).json({ 
        error: 'No crawl data found',
        message: 'Please run a crawl first to generate data for export'
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crawl-results-${timestamp}`;

    switch (format) {
      case 'csv':
        const csv = convertToCSV(data.items);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
        break;
        
      case 'txt':
        const txt = data.items.map((item: any) => item.url).join('\n');
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(txt);
        break;
        
      case 'xml':
        const xml = convertToXML(data.items);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
        res.send(xml);
        break;
        
      case 'json':
      default:
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
          exportInfo: {
            timestamp: new Date().toISOString(),
            totalUrls: data.items.length,
            format: 'json'
          },
          urls: data.items
        });
        break;
    }
    
    logger.info(`Data exported`, { format, count: data.items.length });
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
      exportInfo: {
        timestamp: new Date().toISOString(),
        format: format as string
      },
      metrics,
      requestHistory,
      errorSummary
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
    
    logger.info(`Metrics exported`, { format });
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
  
  const csvRows = items.map(item => 
    headers.map(header => {
      const value = item[header];
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
}

function convertToXML(items: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<crawlResults>\n';
  xml += `  <exportInfo>\n`;
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += `    <totalUrls>${items.length}</totalUrls>\n`;
  xml += `  </exportInfo>\n`;
  xml += `  <urls>\n`;
  
  items.forEach((item, index) => {
    xml += `    <url id="${index + 1}">\n`;
    xml += `      <value><![CDATA[${item.url}]]></value>\n`;
    xml += `    </url>\n`;
  });
  
  xml += `  </urls>\n`;
  xml += `</crawlResults>`;
  
  return xml;
}

function convertMetricsToCSV(data: any): string {
  const lines = [];
  
  // Export info
  lines.push('Section,Field,Value');
  lines.push(`Export Info,Timestamp,${data.exportInfo.timestamp}`);
  lines.push(`Export Info,Format,${data.exportInfo.format}`);
  
  // Metrics
  lines.push('Metrics,Total Pages,' + data.metrics.totalPages);
  lines.push('Metrics,Successful Requests,' + data.metrics.successfulRequests);
  lines.push('Metrics,Failed Requests,' + data.metrics.failedRequests);
  lines.push('Metrics,Average Response Time,' + data.metrics.averageResponseTime);
  lines.push('Metrics,Requests Per Minute,' + data.metrics.requestsPerMinute);
  lines.push('Metrics,Duration,' + data.metrics.duration);
  
  // Error summary
  data.errorSummary.forEach((error: any) => {
    lines.push(`Error,${error.type},${error.count} (${error.percentage}%)`);
  });
  
  return lines.join('\n');
}

// Check data availability
router.get('/data/check', async (req, res) => {
  try {
    const dataset = await Dataset.open();
    const data = await dataset.getData({ limit: 1 });
    
    res.json({
      hasData: !!(data && data.items && data.items.length > 0),
      itemCount: data?.items?.length || 0,
      totalItems: data?.total || 0,
      message: data && data.items && data.items.length > 0 
        ? 'Data available for export' 
        : 'No data available - run a crawl first'
    });
  } catch (error) {
    logger.error('Failed to check data availability', error as Error);
    res.status(500).json({ 
      hasData: false,
      error: 'Failed to check data availability'
    });
  }
});

// List all datasets (for debugging)
router.get('/data/list', async (req, res) => {
  try {
    const dataset = await Dataset.open();
    const data = await dataset.getData({ limit: 10 });
    
    res.json({
      datasetInfo: {
        name: 'default',
        itemCount: data?.items?.length || 0,
        totalItems: data?.total || 0,
        hasData: !!(data && data.items && data.items.length > 0)
      },
      sampleItems: data?.items?.slice(0, 5) || [],
      message: data && data.items && data.items.length > 0 
        ? 'Dataset contains data' 
        : 'Dataset is empty - run a crawl first'
    });
  } catch (error) {
    logger.error('Failed to list dataset data', error as Error);
    res.status(500).json({ 
      error: 'Failed to list dataset data',
      details: error.message
    });
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
      successRate: metrics.totalPages > 0 ? 
        Math.round((metrics.successfulRequests / metrics.totalPages) * 100) : 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get status', error as Error);
    res.status(500).json({ 
      healthy: false, 
      error: 'Status check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as monitoringRoutes, healthChecker, metricsCollector };
