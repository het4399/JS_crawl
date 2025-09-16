import { performance } from 'perf_hooks';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  activeCrawls: number;
  queueSize: number;
  lastCrawlTime?: string;
  errors: {
    count: number;
    lastError?: string;
    lastErrorTime?: string;
  };
}

export class HealthChecker {
  private startTime: number;
  private errorCount: number = 0;
  private lastError: string | null = null;
  private lastErrorTime: string | null = null;
  private activeCrawls: number = 0;
  private queueSize: number = 0;
  private lastCrawlTime: string | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  recordError(error: string): void {
    this.errorCount++;
    this.lastError = error;
    this.lastErrorTime = new Date().toISOString();
  }

  setActiveCrawls(count: number): void {
    this.activeCrawls = count;
  }

  setQueueSize(size: number): void {
    this.queueSize = size;
  }

  recordCrawlStart(): void {
    this.lastCrawlTime = new Date().toISOString();
  }

  getHealthStatus(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
    const usedMemory = memoryUsage.heapUsed + memoryUsage.external;
    const memoryPercentage = (usedMemory / totalMemory) * 100;

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    // Determine health status based on various factors
    if (this.errorCount > 10 || memoryPercentage > 90) {
      status = 'unhealthy';
    } else if (this.errorCount > 5 || memoryPercentage > 75 || this.queueSize > 1000) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round(memoryPercentage * 100) / 100
      },
      activeCrawls: this.activeCrawls,
      queueSize: this.queueSize,
      lastCrawlTime: this.lastCrawlTime || undefined,
      errors: {
        count: this.errorCount,
        lastError: this.lastError || undefined,
        lastErrorTime: this.lastErrorTime || undefined
      }
    };
  }

  isHealthy(): boolean {
    const status = this.getHealthStatus();
    return status.status === 'healthy';
  }
}
