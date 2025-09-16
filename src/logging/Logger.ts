export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, any>;
  requestId?: string;
  url?: string;
  duration?: number;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {
    this.logLevel = this.getLogLevelFromEnv();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase();
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private addLog(level: string, message: string, context?: Record<string, any>, requestId?: string, url?: string, duration?: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId,
      url,
      duration
    };

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console with colors
    this.logToConsole(entry);
  }

  private logToConsole(entry: LogEntry): void {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m'  // Red
    };

    const reset = '\x1b[0m';
    const color = colors[entry.level as keyof typeof colors] || '';
    
    let logMessage = `${color}[${entry.timestamp}] ${entry.level}: ${entry.message}${reset}`;
    
    if (entry.url) {
      logMessage += ` | URL: ${entry.url}`;
    }
    
    if (entry.duration) {
      logMessage += ` | Duration: ${entry.duration}ms`;
    }
    
    if (entry.requestId) {
      logMessage += ` | RequestID: ${entry.requestId}`;
    }
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      logMessage += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    console.log(logMessage);
  }

  debug(message: string, context?: Record<string, any>, requestId?: string, url?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.addLog('DEBUG', message, context, requestId, url);
    }
  }

  info(message: string, context?: Record<string, any>, requestId?: string, url?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.addLog('INFO', message, context, requestId, url);
    }
  }

  warn(message: string, context?: Record<string, any>, requestId?: string, url?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.addLog('WARN', message, context, requestId, url);
    }
  }

  error(message: string, error?: Error, context?: Record<string, any>, requestId?: string, url?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext = {
        ...context,
        ...(error && {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack
        })
      };
      this.addLog('ERROR', message, errorContext, requestId, url);
    }
  }

  request(message: string, url: string, duration: number, statusCode?: number, requestId?: string): void {
    const context = {
      statusCode,
      responseTime: duration
    };
    this.info(message, context, requestId, url, duration);
  }

  getLogs(level?: string, limit: number = 100): LogEntry[] {
    let filteredLogs = this.logs;
    
    if (level) {
      filteredLogs = this.logs.filter(log => log.level === level.toUpperCase());
    }
    
    return filteredLogs.slice(-limit);
  }

  getLogsByTimeRange(startTime: string, endTime: string): LogEntry[] {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    });
  }

  clearLogs(): void {
    this.logs = [];
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}
