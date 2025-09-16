export interface CrawlMetrics {
  totalPages: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerMinute: number;
  errorsByType: Record<string, number>;
  startTime: string;
  lastUpdateTime: string;
  duration: number;
}

export interface RequestMetrics {
  url: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

export class MetricsCollector {
  private metrics: CrawlMetrics;
  private requestHistory: RequestMetrics[] = [];
  private maxHistorySize: number = 1000;

  constructor() {
    this.metrics = {
      totalPages: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerMinute: 0,
      errorsByType: {},
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      duration: 0
    };
  }

  recordRequest(metrics: RequestMetrics): void {
    this.requestHistory.push(metrics);
    
    // Keep only recent history
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(-this.maxHistorySize);
    }

    // Update metrics
    this.metrics.totalPages++;
    this.metrics.lastUpdateTime = new Date().toISOString();
    this.metrics.duration = Date.now() - new Date(this.metrics.startTime).getTime();

    if (metrics.success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      
      // Track error types
      const errorType = metrics.error || 'unknown';
      this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
    }

    // Calculate average response time
    const successfulRequests = this.requestHistory.filter(r => r.success);
    if (successfulRequests.length > 0) {
      const totalResponseTime = successfulRequests.reduce((sum, r) => sum + r.responseTime, 0);
      this.metrics.averageResponseTime = Math.round(totalResponseTime / successfulRequests.length);
    }

    // Calculate requests per minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requestHistory.filter(r => 
      new Date(r.timestamp).getTime() > oneMinuteAgo
    );
    this.metrics.requestsPerMinute = recentRequests.length;
  }

  getMetrics(): CrawlMetrics {
    return { ...this.metrics };
  }

  getRequestHistory(limit: number = 100): RequestMetrics[] {
    return this.requestHistory.slice(-limit);
  }

  getErrorSummary(): { type: string; count: number; percentage: number }[] {
    const totalErrors = this.metrics.failedRequests;
    if (totalErrors === 0) return [];

    return Object.entries(this.metrics.errorsByType)
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / totalErrors) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  }

  reset(): void {
    this.metrics = {
      totalPages: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerMinute: 0,
      errorsByType: {},
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      duration: 0
    };
    this.requestHistory = [];
  }
}
