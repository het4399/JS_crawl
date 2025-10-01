import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import DataViewer from './DataViewer';
import AuditsPage from './AuditsPage';
import ScheduleList from './ScheduleList';
import CronHistory from './CronHistory';
import AuditScheduleManager from './AuditScheduleManager';

interface CrawlData {
  url: string;
  title: string;
  description: string;
  contentType: string;
  lastModified: string | null;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  success: boolean;
  resourceType?: string;
}


function App() {
  const [url, setUrl] = useState('');
  const [allowSubdomains, setAllowSubdomains] = useState(false);
  const [maxConcurrency, setMaxConcurrency] = useState(50);
  const [mode, setMode] = useState('auto');
  const [runAudits, setRunAudits] = useState(false);
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [isCrawling, setIsCrawling] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [initialViewerSessionId, setInitialViewerSessionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'crawl' | 'schedules' | 'history' | 'audits' | 'audit-schedules'>('crawl');
  const [crawlStats, setCrawlStats] = useState<{
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null>(null);
  const [auditResults, setAuditResults] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    averageLcp: number;
    averageTbt: number;
    averageCls: number;
    averagePerformanceScore: number;
  } | null>(null);

  // Timeout reference for audit fallback
  const auditTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showReusePrompt, setShowReusePrompt] = useState(false);
  const [recentStatus, setRecentStatus] = useState<null | {
    running: { id: number; startedAt: string } | null;
    latest: { id: number; status: string; startedAt: string; completedAt: string | null; totalPages: number; totalResources: number; duration: number | null } | null;
    averageDurationSec: number | null;
  }>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to Server-Sent Events
    const eventSource = new EventSource('/events');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev.slice(-99), data.message]);
    });

    eventSource.addEventListener('page', (e) => {
      const data = JSON.parse(e.data);
      setPages(prev => [...prev.slice(-199), data.url]);
      setPageCount(prev => prev + 1);
    });

    eventSource.addEventListener('done', (e) => {
      console.log('Raw event data:', e.data);
      const data = JSON.parse(e.data);
      console.log('Parsed event data:', data);
      console.log('Data keys:', Object.keys(data));
      console.log('Data values:', Object.values(data));

      const duration = data.duration || 0;
      const pagesPerSecond = data.pagesPerSecond || 0;

      console.log('Final values:', { count: data.count, duration, pagesPerSecond });

      setCrawlStats({
        count: data.count,
        duration: duration,
        pagesPerSecond: pagesPerSecond
      });
      setLogs(prev => [...prev, `✅ Crawl completed! Total URLs: ${data.count} | Duration: ${duration}s | Speed: ${pagesPerSecond} pages/sec`]);
      
      // If audits are not enabled, we're done immediately
      if (!runAudits) {
        console.log('Crawl done without audits - setting states to false');
        setIsCrawling(false);
        setIsAuditing(false);
        if (auditTimeoutRef.current) {
          clearTimeout(auditTimeoutRef.current);
        }
      }
      // If audits are enabled, let audit events handle the state transition
    });

    eventSource.addEventListener('audit-start', (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev.slice(-99), `🔍 Starting audit for ${data.url}`]);
      setIsAuditing(true);
      // Keep crawling state true during audits
      setIsCrawling(true);
    });

    eventSource.addEventListener('audit-complete', (e) => {
      const data = JSON.parse(e.data);
      if (data.success) {
        setLogs(prev => [...prev.slice(-99), `✓ Audit completed for ${data.url} - LCP: ${data.lcp ? Math.round(data.lcp) + 'ms' : 'N/A'}, TBT: ${data.tbt ? Math.round(data.tbt) + 'ms' : 'N/A'}, CLS: ${data.cls ? data.cls.toFixed(3) : 'N/A'}`]);
      } else {
        setLogs(prev => [...prev.slice(-99), `✗ Audit failed for ${data.url}`]);
      }
    });

    eventSource.addEventListener('audit-results', (e) => {
      console.log('Received audit-results event:', e.data);
      const data = JSON.parse(e.data);
      setAuditResults(data.results);
      
      // Calculate audit stats
      const results = data.results;
      const successful = results.filter((r: any) => r.success);
      const successRate = results.length > 0 ? (successful.length / results.length) * 100 : 0;
      
      const averageLcp = successful.length > 0 && successful.some((r: any) => r.lcp)
        ? successful.reduce((sum: number, r: any) => sum + (r.lcp || 0), 0) / successful.filter((r: any) => r.lcp).length
        : 0;
        
      const averageTbt = successful.length > 0 && successful.some((r: any) => r.tbt)
        ? successful.reduce((sum: number, r: any) => sum + (r.tbt || 0), 0) / successful.filter((r: any) => r.tbt).length
        : 0;
        
      const averageCls = successful.length > 0 && successful.some((r: any) => r.cls)
        ? successful.reduce((sum: number, r: any) => sum + (r.cls || 0), 0) / successful.filter((r: any) => r.cls).length
        : 0;
        
      const averagePerformanceScore = successful.length > 0 && successful.some((r: any) => r.performanceScore)
        ? Math.round(successful.reduce((sum: number, r: any) => sum + (r.performanceScore || 0), 0) / successful.filter((r: any) => r.performanceScore).length)
        : 0;

      setAuditStats({
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length,
        successRate,
        averageLcp,
        averageTbt,
        averageCls,
        averagePerformanceScore
      });
      
      // Audits are complete, so both crawling and auditing are done
      console.log('Setting states to false - audits complete');
      setIsCrawling(false);
      setIsAuditing(false);
      if (auditTimeoutRef.current) {
        clearTimeout(auditTimeoutRef.current);
      }
    });

    // Handle case where audits are enabled but no URLs found for auditing
    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      if (data.message && data.message.includes('No valid URLs found for auditing')) {
        // No URLs to audit, so we're done
        setIsCrawling(false);
        setIsAuditing(false);
        if (auditTimeoutRef.current) {
          clearTimeout(auditTimeoutRef.current);
        }
      }
      // Check if audits are starting
      if (data.message && data.message.includes('Starting performance audits for all')) {
        setIsAuditing(true);
        setIsCrawling(true);
      }
      // Check if audits are complete based on final summary messages
      if (data.message && (data.message.includes('📊 Audit Results:') || data.message.includes('📈 Average LCP:') || data.message.includes('📈 Average TBT:') || data.message.includes('📈 Average CLS:'))) {
        console.log('Detected audit completion from log message:', data.message);
        // Add a small delay to ensure all audit events are processed
        setTimeout(() => {
          console.log('Setting states to false - audits complete (from log detection)');
          setIsCrawling(false);
          setIsAuditing(false);
          if (auditTimeoutRef.current) {
            clearTimeout(auditTimeoutRef.current);
          }
        }, 1000);
      }
    });

    // Fallback timeout to handle cases where audit events might not be received
    auditTimeoutRef.current = setTimeout(() => {
      if (isCrawling && !isAuditing) {
        // If we're still in crawling state but no audit events received after 30 seconds
        // assume audits are not running and reset state
        console.log('Audit timeout - resetting state');
        setIsCrawling(false);
        setIsAuditing(false);
      }
    }, 30000); // 30 second timeout

    return () => {
      eventSource.close();
      if (auditTimeoutRef.current) {
        clearTimeout(auditTimeoutRef.current);
      }
    };
  }, []);

  const cancelAuditProcess = async () => {
    try {
      console.log('Sending cancel request...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      // Try both endpoints
      let response;
      try {
        response = await fetch('/api/cancel-audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
      } catch (error) {
        console.log('First endpoint failed, trying API endpoint...');
        response = await fetch('/api/cancel-audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
      }
      
      clearTimeout(timeoutId);
      
      console.log('Cancel response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Cancel response data:', data);
        setLogs(prev => [...prev, '🛑 Audit cancellation requested...']);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Cancel failed:', errorData);
        setLogs(prev => [...prev, `❌ Failed to cancel audits: ${errorData.error || 'Unknown error'}`]);
      }
    } catch (error) {
      console.error('Cancel request error:', error);
      setLogs(prev => [...prev, `❌ Error cancelling audits: ${(error as Error).message}`]);
    }
  };

  const startCrawl = async () => {
    if (!url.trim()) {
      setLogs(prev => [...prev, '❌ Please enter a URL to crawl']);
      return;
    }

    try {
      setIsCrawling(true);
      setIsAuditing(false);
      setPageCount(0);
      setLogs([]);
      setPages([]);

      const response = await fetch('/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          allowSubdomains, 
          maxConcurrency, 
          mode,
          runAudits,
          auditDevice
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setLogs(prev => [...prev, `🚀 Starting crawl of ${url}`]);
    } catch (error) {
      setLogs(prev => [...prev, `❌ Error: ${(error as Error).message}`]);
      setIsCrawling(false);
    }
  };

  // Intercept manual start to check for recent results
  const checkAndMaybePrompt = async () => {
    if (!url.trim() || isCrawling) return;
    try {
      const res = await fetch(`/api/crawl/status?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        await startCrawl();
        return;
      }
      const data = await res.json();
      const latest = data.latest as any;
      const running = data.running as any;
      const avg = data.averageDurationSec as number | null;
      const now = Date.now();
      const completedAt = latest?.completedAt || latest?.completed_at;
      const recent = completedAt ? (now - new Date(completedAt).getTime()) <= 30 * 60 * 1000 : false;
      if (running || recent) {
        setRecentStatus({ running, latest, averageDurationSec: avg });
        setShowReusePrompt(true);
      } else {
        await startCrawl();
      }
    } catch {
      await startCrawl();
    }
  };

  // Resume functionality removed for minimal UI


  return (
    <div className="app">
      <header className="header">
        <h1>🕷️ Fast Web Crawler</h1>
        <p>Discover and crawl websites with powerful monitoring and analytics</p>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-number">{pageCount}</span>
            <span className="stat-label">Pages Found</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{logs.length}</span>
            <span className="stat-label">Log Entries</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{isCrawling ? 'Active' : 'Ready'}</span>
            <span className="stat-label">Status</span>
          </div>

          {crawlStats && !isCrawling && (
            <>
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <div className="stat-value">{crawlStats.count}</div>
                  <div className="stat-label">Total URLs</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-content">
                  <div className="stat-value">{crawlStats.duration}s</div>
                  <div className="stat-label">Duration</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🚀</div>
                <div className="stat-content">
                  <div className="stat-value">{crawlStats.pagesPerSecond}</div>
                  <div className="stat-label">Pages/sec</div>
                </div>
              </div>
            </>
          )}

          {auditStats && !isCrawling && runAudits && (
            <>
              <div className="audit-results-section">
                <h3>🔍 Performance Audit Results</h3>
                <div className="audit-stats">
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-content">
                      <div className="stat-value">{auditStats.successful}/{auditStats.total}</div>
                      <div className="stat-label">Audits Completed</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-content">
                      <div className="stat-value">{auditStats.successRate.toFixed(1)}%</div>
                      <div className="stat-label">Success Rate</div>
                    </div>
                  </div>
                  {auditStats.averageLcp > 0 && (
                    <div className="stat-card">
                      <div className="stat-icon">⚡</div>
                      <div className="stat-content">
                        <div className="stat-value">{Math.round(auditStats.averageLcp)}ms</div>
                        <div className="stat-label">Avg LCP</div>
                      </div>
                    </div>
                  )}
                  {auditStats.averageTbt > 0 && (
                    <div className="stat-card">
                      <div className="stat-icon">🚫</div>
                      <div className="stat-content">
                        <div className="stat-value">{Math.round(auditStats.averageTbt)}ms</div>
                        <div className="stat-label">Avg TBT</div>
                      </div>
                    </div>
                  )}
                  {auditStats.averageCls > 0 && (
                    <div className="stat-card">
                      <div className="stat-icon">📐</div>
                      <div className="stat-content">
                        <div className="stat-value">{auditStats.averageCls.toFixed(3)}</div>
                        <div className="stat-label">Avg CLS</div>
                      </div>
                    </div>
                  )}
                  {auditStats.averagePerformanceScore > 0 && (
                    <div className="stat-card performance-score-card">
                      <div className="stat-icon">🏆</div>
                      <div className="stat-content">
                        <div className="stat-value">{auditStats.averagePerformanceScore}/100</div>
                        <div className="stat-label">Avg Performance Score</div>
                      </div>
                    </div>
                  )}
                </div>
                
                {auditResults.length > 0 && (
                  <div className="audit-details">
                    <h4>Detailed Results:</h4>
                    <div className="audit-results-list">
                      {auditResults.map((result, index) => (
                        <div key={index} className={`audit-result-item ${result.success ? 'success' : 'failed'}`}>
                          <div className="audit-url">{result.url}</div>
                          {result.success ? (
                            <div className="audit-metrics">
                              {result.performanceScore && <span className="performance-score">Score: {result.performanceScore}/100</span>}
                              {result.lcp && <span>LCP: {Math.round(result.lcp)}ms</span>}
                              {result.tbt && <span>TBT: {Math.round(result.tbt)}ms</span>}
                              {result.cls && <span>CLS: {result.cls.toFixed(3)}</span>}
                            </div>
                          ) : (
                            <div className="audit-error">Error: {result.error}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </header>

      <main className="main">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'crawl' ? 'active' : ''}`}
            onClick={() => setActiveTab('crawl')}
          >
            🕷️ Manual Crawl
          </button>
          <button
            className={`tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedules')}
          >
            ⏰ Scheduled Crawls
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📜 Cron History
          </button>
          <button
            className={`tab-btn ${activeTab === 'audits' ? 'active' : ''}`}
            onClick={() => setActiveTab('audits')}
          >
            📈 Audits
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit-schedules' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit-schedules')}
          >
            ⏰ Audit Schedules
          </button>
        </div>

        {activeTab === 'crawl' && (
          <>
            <div className="controls">
              <div className="input-group">
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="url-input"
                  disabled={isCrawling || isAuditing}
                />
              </div>

              <div className="control-group">
                <label>
                  <input
                    type="checkbox"
                    checked={allowSubdomains}
                    onChange={(e) => setAllowSubdomains(e.target.checked)}
                    disabled={isCrawling || isAuditing}
                  />
                  Subdomains
                </label>
              </div>

              <div className="control-group">
                <label>
                  <input
                    type="checkbox"
                    checked={runAudits}
                    onChange={(e) => setRunAudits(e.target.checked)}
                    disabled={isCrawling || isAuditing}
                  />
                  🔍 Run Performance Audits
                </label>
              </div>

              {runAudits && (
                <>
                  <div className="control-group">
                    <label>
                      Audit Device:
                      <select
                        value={auditDevice}
                        onChange={(e) => setAuditDevice(e.target.value as 'mobile' | 'desktop')}
                        disabled={isCrawling || isAuditing}
                      >
                        <option value="desktop">Desktop</option>
                        <option value="mobile">Mobile</option>
                      </select>
                    </label>
                  </div>

                </>
              )}

              <div className="control-group">
                <label>
                  Concurrency:
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={maxConcurrency}
                    onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                    className="number-input"
                    disabled={isCrawling || isAuditing}
                  />
                </label>
              </div>

              <div className="control-group">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="select"
                  disabled={isCrawling || isAuditing}
                >
                  <option value="html">HTML only (fast)</option>
                  <option value="auto">Auto (fallback to JS)</option>
                  <option value="js">JS only (Playwright)</option>
                </select>
              </div>

              <button
                onClick={checkAndMaybePrompt}
                disabled={isCrawling || isAuditing}
                className="start-btn"
              >
                {isCrawling ? (isAuditing ? '🔍 Auditing...' : '⏳ Crawling...') : '🚀 Start Crawl'}
              </button>

              {isAuditing && (
                <button
                  onClick={cancelAuditProcess}
                  className="cancel-btn"
                >
                  🛑 Cancel Audits
                </button>
              )}

              <button
                onClick={() => setShowDataViewer(true)}
                className="view-data-btn"
              >
                📊 View Data
              </button>

            </div>

            {/* Resume UI removed for minimalism */}


            <div className="status-bar">
              <div className="status-indicator">
                <div className={`status-dot ${isCrawling ? (isAuditing ? 'auditing' : 'crawling') : ''}`}></div>
                <span>
                  {isCrawling ? (isAuditing ? 'Running performance audits...' : 'Crawling in progress...') : 'Ready to crawl'}
                </span>
              </div>
              <div className="count">{pageCount} pages discovered</div>
            </div>

            <div className="grid">
              <div className="panel">
                <h3>📝 Live Logs</h3>
                <div className="logs">
                  {logs.length === 0 ? (
                    <div className="empty-state">
                      {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
                    </div>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className="log-entry">
                        <span className="timestamp">[{new Date().toLocaleTimeString()}]</span> {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel">
                <h3>🔗 Discovered Pages</h3>
                <div className="pages">
                  {pages.length === 0 ? (
                    <div className="empty-state">
                      {isCrawling ? 'Discovering pages...' : 'No pages discovered yet'}
                    </div>
                  ) : (
                    pages.map((page, index) => (
                      <div key={index} className="page-entry">
                        <a href={page} target="_blank" rel="noreferrer noopener">
                          {page}
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'schedules' && (
          <ScheduleList />
        )}

        {activeTab === 'history' && (
          <CronHistory onClose={() => setActiveTab('crawl')} />
        )}

        {activeTab === 'audits' && (
          <AuditsPage />
        )}

        {activeTab === 'audit-schedules' && (
          <AuditScheduleManager />
        )}
      </main>

      {showDataViewer && (
        <DataViewer onClose={() => setShowDataViewer(false)} initialSessionId={initialViewerSessionId} />
      )}


      {showReusePrompt && (
        <div className="modal-overlay" onClick={() => setShowReusePrompt(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="header"><h3>Recent crawl detected</h3></div>
            <div className="body">
              <div>
                {recentStatus?.running ? (
                  <>A crawl is currently running (started at {new Date(recentStatus.running.startedAt).toLocaleString()}).</>
                ) : recentStatus?.latest ? (
                  <>Last crawl finished at {new Date(recentStatus.latest.completedAt || recentStatus.latest.startedAt).toLocaleString()} and took ~{recentStatus.latest.duration ?? recentStatus.averageDurationSec ?? 0}s.</>
                ) : null}
              </div>
              <div className="info-row">
                {recentStatus?.latest && (
                  <>
                    <span className="chip info">🔗 {url}</span>
                    <span className="chip success">✅ {recentStatus.latest.totalPages} pages</span>
                    <span className="chip">📦 {recentStatus.latest.totalResources} resources</span>
                  </>
                )}
                {recentStatus?.averageDurationSec != null && (
                  <span className="chip warn">⏱ Avg ~{recentStatus.averageDurationSec}s</span>
                )}
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-secondary" onClick={() => setShowReusePrompt(false)}>Cancel</button>
              {recentStatus?.running ? (
                <button className="btn btn-primary" onClick={async () => {
                  setShowReusePrompt(false);
                  const runningId = recentStatus?.running?.id ?? null;
                  setInitialViewerSessionId(runningId);
                  setShowDataViewer(true);
                }}>📡 View Current Run</button>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={async () => {
                    setShowReusePrompt(false);
                    const lastId = recentStatus?.latest?.id ?? null;
                    setInitialViewerSessionId(lastId);
                    setShowDataViewer(true);
                  }}>📊 View Last Results</button>
                  <button className="btn" onClick={async () => { setShowReusePrompt(false); await startCrawl(); }}>🔁 Recrawl Now</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
