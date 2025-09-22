import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import DataViewer from './DataViewer';

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
  const [crawlStats, setCrawlStats] = useState<{
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null>(null);
  
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
            onClick={startCrawl}
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
      </main>

      {showDataViewer && (
        <DataViewer onClose={() => setShowDataViewer(false)} />
      )}
    </div>
  );
}

export default App;
