import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import DataViewer from './DataViewer';
import ScheduleList from './ScheduleList';
import CronHistory from './CronHistory';

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
  const [isCrawling, setIsCrawling] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [activeTab, setActiveTab] = useState<'crawl' | 'schedules' | 'history'>('crawl');
  const [crawlStats, setCrawlStats] = useState<{
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null>(null);
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
      setIsCrawling(false);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const startCrawl = async () => {
    if (!url.trim()) {
      setLogs(prev => [...prev, '❌ Please enter a URL to crawl']);
      return;
    }

    try {
      setIsCrawling(true);
      setPageCount(0);
      setLogs([]);
      setPages([]);

      const response = await fetch('/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, allowSubdomains, maxConcurrency, mode })
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
                  disabled={isCrawling}
                />
              </div>

              <div className="control-group">
                <label>
                  <input
                    type="checkbox"
                    checked={allowSubdomains}
                    onChange={(e) => setAllowSubdomains(e.target.checked)}
                    disabled={isCrawling}
                  />
                  Subdomains
                </label>
              </div>

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
                    disabled={isCrawling}
                  />
                </label>
              </div>

              <div className="control-group">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="select"
                  disabled={isCrawling}
                >
                  <option value="html">HTML only (fast)</option>
                  <option value="auto">Auto (fallback to JS)</option>
                  <option value="js">JS only (Playwright)</option>
                </select>
              </div>

              <button
                onClick={checkAndMaybePrompt}
                disabled={isCrawling}
                className="start-btn"
              >
                {isCrawling ? '⏳ Crawling...' : '🚀 Start Crawl'}
              </button>

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
                <div className={`status-dot ${isCrawling ? 'crawling' : ''}`}></div>
                <span>{isCrawling ? 'Crawling in progress...' : 'Ready to crawl'}</span>
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
      </main>

      {showDataViewer && (
        <DataViewer onClose={() => setShowDataViewer(false)} />
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
              <button className="btn btn-primary" onClick={async () => { setShowReusePrompt(false); setShowDataViewer(true); }}>📊 View Last Results</button>
              <button className="btn" onClick={async () => { setShowReusePrompt(false); await startCrawl(); }}>🔁 Recrawl Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
