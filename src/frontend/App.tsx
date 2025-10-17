import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import './App.css';
import AEODashboard from './components/aeo/AEODashboard';
import { apiService, AnalysisResult } from './api';


const App: React.FC = () => {
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runCrawl, setRunCrawl] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  
  // Crawler settings (matching the actual crawler)
  const [allowSubdomains, setAllowSubdomains] = useState<boolean>(true);
  const [runAudits, setRunAudits] = useState<boolean>(false);
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [captureLinkDetails, setCaptureLinkDetails] = useState<boolean>(false);
  
  // Live crawling state
  const [isCrawling, setIsCrawling] = useState<boolean>(false);
  const [pageCount, setPageCount] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [crawlStats, setCrawlStats] = useState<{
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null>(null);


  // Audit results state
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

  // Formatting helpers for audit table
  function formatMs(value?: number): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${Math.round(value)}ms`;
  }

  function formatScore(value?: number): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${Math.round(value)}/100`;
  }

  // Reuse prompt state (like original crawler)
  const [showReusePrompt, setShowReusePrompt] = useState(false);
  const [recentStatus, setRecentStatus] = useState<null | {
    running: { id: number; startedAt: string } | null;
    latest: { id: number; status: string; startedAt: string; completedAt: string | null; totalPages: number; totalResources: number; duration: number | null } | null;
    averageDurationSec: number | null;
  }>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Check for recent crawl status (like original crawler)
  const checkAndMaybePrompt = async () => {
    if (!url.trim() || isCrawling) return;
    try {
      const res = await fetch(`/api/crawl/status?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        await handleSubmit();
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
        await handleSubmit();
      }
    } catch {
      await handleSubmit();
    }
  };

  // Set up Server-Sent Events for live crawling data
  useEffect(() => {
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
      const data = JSON.parse(e.data);
      const duration = data.duration || 0;
      const pagesPerSecond = data.pagesPerSecond || 0;

      setCrawlStats({
        count: data.count,
        duration: duration,
        pagesPerSecond: pagesPerSecond
      });
      setIsCrawling(false);
      setLogs(prev => [...prev, `✅ Crawl completed! Total URLs: ${data.count} | Duration: ${duration}s | Speed: ${pagesPerSecond} pages/sec`]);
    });

    // Handle audit events
    eventSource.addEventListener('audit_progress', (e) => {
      const data = JSON.parse(e.data);
      setAuditResults(data.audits || []);
      setAuditStats(data.stats || null);
    });

    eventSource.addEventListener('audit_done', (e) => {
      const data = JSON.parse(e.data);
      setAuditResults(data.audits || []);
      setAuditStats(data.stats || null);
    });

    eventSource.addEventListener('error', (e) => {
      console.error('EventSource failed:', e);
      eventSource.close();
      setIsCrawling(false);
      setLogs(prev => [...prev, 'Error: Connection to server lost or failed.']);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;
    
    setLoading(true);
    setResult(null);
    setError(null);
    
    // Reset crawling state
    if (runCrawl) {
      setIsCrawling(true);
      setPageCount(0);
      setLogs([]);
      setPages([]);
      setCrawlStats(null);
    }
    
    console.log('Starting AEO analysis for URL:', url);
    console.log('Run crawl enabled:', runCrawl);
    if (runCrawl) {
      console.log('Crawler settings:', {
        allowSubdomains,
          runAudits,
          auditDevice,
          captureLinkDetails
      });
    }
    
    try {
      let analysisResult;
      
      if (runCrawl) {
        // Call crawler with options
        analysisResult = await apiService.analyzeUrl(url.trim(), {
          allowSubdomains,
          runAudits,
          auditDevice,
          captureLinkDetails
        });
      } else {
        // Call AEO analyzer for single page
        analysisResult = await apiService.analyzeUrl(url.trim());
      }
      
      console.log('Analysis completed:', analysisResult);
      setResult(analysisResult);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze URL');
    } finally {
      setLoading(false);
      setIsCrawling(false);
    }
  };

  return (
    <div className="min-h-screen bg-black aeo-dark" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            AEO Checker
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Analyze your website's structured data and get actionable insights to improve 
            your search engine visibility and Answer Engine Optimization (AEO).
          </p>
          </div>

        {/* Input Form */}
        <form onSubmit={(e) => { e.preventDefault(); checkAndMaybePrompt(); }} className="max-w-4xl mx-auto mb-8">
          <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter website URL (e.g., https://example.com)"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  disabled={loading}
                  required
                />
                </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>🔍</span>
                )}
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
                </div>
                
            {/* Run Crawl Checkbox */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="runCrawl"
                checked={runCrawl}
                onChange={(e) => setRunCrawl(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                disabled={loading}
              />
              <label htmlFor="runCrawl" className="text-sm font-medium text-gray-300">
                🕷️ Run Crawl (Analyze multiple pages)
              </label>
        </div>

            {/* Analysis Options */}
            {runCrawl && (
              <div className="border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">📊 Analysis Options</h3>
          <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors"
                  >
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>
        </div>

                {showAdvanced && (
                  <div className="space-y-4">
                    {/* Checkboxes Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center gap-2">
                <input
                          type="checkbox"
                          checked={allowSubdomains}
                          onChange={(e) => setAllowSubdomains(e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                          disabled={loading}
                        />
                        <span className="text-sm text-gray-300">🌐 Allow Subdomains</span>
                      </label>

                      <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={runAudits}
                        onChange={(e) => setRunAudits(e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                          disabled={loading}
                      />
                        <span className="text-sm text-gray-300">🔍 Run Performance Audits</span>
                    </label>

                      <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={captureLinkDetails}
                        onChange={(e) => setCaptureLinkDetails(e.target.checked)}
                          className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                          disabled={loading}
                      />
                        <span className="text-sm text-gray-300">🔗 Link Analysis</span>
                    </label>
                </div>

                    {/* Audit Device Selection */}
                {runAudits && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                        Audit Device:
                        </label>
                        <select
                          value={auditDevice}
                          onChange={(e) => setAuditDevice(e.target.value as 'mobile' | 'desktop')}
                          className="w-full md:w-auto px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                          disabled={loading}
                        >
                          <option value="desktop">Desktop</option>
                          <option value="mobile">Mobile</option>
                        </select>
                      </div>
                    )}
                    </div>
                )}
                  </div>
                )}
              </div>
        </form>

        {loading && (
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-300">
              {runCrawl ? 'Crawling and analyzing website...' : 'Analyzing your website...'}
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-red-900 border border-red-700 rounded-lg p-4 flex items-center gap-3">
              <div className="w-6 h-6 text-red-600 flex-shrink-0">⚠️</div>
              <div>
                <h3 className="font-semibold text-red-200">Analysis Failed</h3>
                <p className="text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* AEO Dashboard - Main Interface */}
        {result && (
          <div className="max-w-7xl mx-auto mb-8">
            <AEODashboard 
              url={url} 
              result={result}
              runCrawl={runCrawl}
              isCrawling={isCrawling}
              pageCount={pageCount}
              crawlStats={crawlStats}
              logs={logs}
              discoveredPages={pages}
              onStopCrawl={() => {
                fetch('/crawl/stop', { method: 'POST' });
                setIsCrawling(false);
              }}
            />
          </div>
        )}

        {/* Audit results now live under the dedicated "Performance Audits" tab */}

        {/* Crawler Section - Now integrated into AEO Dashboard tabs */}
        {false && runCrawl && (isCrawling || pageCount > 0) && (
          <div className="max-w-7xl mx-auto mb-8">
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">🕷️ Crawling Status</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isCrawling ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                    <span className="text-sm text-gray-300">
                      {isCrawling ? 'Crawling...' : 'Completed'}
                </span>
              </div>
                  {isCrawling && (
                    <button
                      onClick={() => {
                        fetch('/crawl/stop', { method: 'POST' });
                        setIsCrawling(false);
                      }}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      🛑 Stop
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <span className="text-2xl font-bold text-white">{pageCount}</span>
                  <div className="text-sm text-gray-300">Pages Discovered</div>
                </div>
                {crawlStats && (
                  <>
                    <div>
                      <span className="text-2xl font-bold text-white">{crawlStats?.duration.toFixed(1)}s</span>
                      <div className="text-sm text-gray-300">Duration</div>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-white">{crawlStats?.pagesPerSecond.toFixed(1)}</span>
                      <div className="text-sm text-gray-300">Pages/Sec</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Live Logs and Discovered Pages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Live Logs */}
              <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📝 Live Logs</h3>
                <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-gray-400 text-center py-8">
                      {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log, index) => (
                        <div key={index} className="text-sm text-gray-300 font-mono">
                          <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
                        </div>
                      ))}
                      </div>
                  )}
                </div>
              </div>

              {/* Discovered Pages */}
              <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">🔍 Discovered Pages</h3>
                <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto">
                  {pages.length === 0 ? (
                    <div className="text-gray-400 text-center py-8">
                      {isCrawling ? 'Discovering pages...' : 'No pages discovered yet'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pages.map((page, index) => (
                        <div key={index} className="text-sm">
                          <a 
                            href={page} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 break-all"
                          >
                          {page}
                        </a>
                      </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Reuse Prompt Modal (like original crawler) */}
      {showReusePrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowReusePrompt(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent crawl detected</h3>
                <div className="mb-4">
                {recentStatus?.running ? (
                    <p className="text-gray-600">
                      A crawl is currently running (started at {new Date(recentStatus.running.startedAt).toLocaleString()}).
                    </p>
                ) : recentStatus?.latest ? (
                    <p className="text-gray-600">
                      Last crawl finished at {new Date(recentStatus.latest.completedAt || recentStatus.latest.startedAt).toLocaleString()} and took ~{recentStatus.latest.duration ?? recentStatus.averageDurationSec ?? 0}s.
                    </p>
                ) : null}
              </div>
                
                {recentStatus?.latest && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">🔗 {url}</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">✅ {recentStatus.latest.totalPages} pages</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">📦 {recentStatus.latest.totalResources} resources</span>
                {recentStatus?.averageDurationSec != null && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">⏱ Avg ~{recentStatus.averageDurationSec}s</span>
                )}
              </div>
                )}
                
                <div className="flex gap-3">
                  <button 
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                    onClick={() => setShowReusePrompt(false)}
                  >
                    Cancel
                  </button>
                  
              {recentStatus?.running ? (
                    <button 
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      onClick={async () => {
                        setShowReusePrompt(false);
                        // TODO: Implement view current run functionality
                      }}
                    >
                      📡 View Current Run
                    </button>
              ) : (
                <>
                      <button 
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        onClick={async () => {
                          setShowReusePrompt(false);
                          // TODO: Implement view last results functionality
                        }}
                      >
                        📊 View Last Results
                      </button>
                      <button 
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        onClick={async () => { 
                          setShowReusePrompt(false); 
                          await handleSubmit(); 
                        }}
                      >
                        🔁 Recrawl Now
                      </button>
                </>
              )}
                </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default App;
