import React, { useState, useEffect } from 'react';
import './AEODashboard.css';
import DataViewer from '../crawler/DataViewer';
import LinkExplorer from '../crawler/LinkExplorer';
import WebTree from '../crawler/FixedWebTree';
import ScheduleList from '../scheduler/ScheduleList';
import AuditsPage from '../audit/AuditsPage';
import SeoQueueManager from '../seo/SeoQueueManager';

interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
}

interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
}

interface Competitor {
  name: string;
  count: number;
}

interface StrategyMetric {
  name: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  color: 'green' | 'orange' | 'red';
}

interface AEODashboardProps {
  url?: string;
  result?: any; // Analysis result from the API
  onAnalyze?: (url: string) => void;
  // Crawler props
  runCrawl?: boolean;
  isCrawling?: boolean;
  pageCount?: number;
  crawlStats?: {
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null;
  logs?: string[];
  discoveredPages?: any[];
  onStopCrawl?: () => void;
}

const AEODashboard: React.FC<AEODashboardProps> = ({ 
  url = 'https://yogreet.com', 
  result, 
  onAnalyze,
  runCrawl = false,
  isCrawling = false,
  pageCount = 0,
  crawlStats = null,
  logs = [],
  discoveredPages = [],
  onStopCrawl
}) => {
  const [activeView, setActiveView] = useState<'crawler' | 'data' | 'links' | 'tree' | 'schedules' | 'audits' | 'seo-queue'>(runCrawl ? 'crawler' : 'data');
  // Use real data from analysis result or fallback to defaults
  const scores: AEOScore = result ? {
    overall: Math.round(result.overall_score || 0),
    ai_presence: Math.round(result.detailed_analysis?.ai_presence?.score || 0),
    competitor_landscape: Math.round(result.detailed_analysis?.competitor_analysis?.score || 0),
    strategy_review: Math.round(result.detailed_analysis?.answerability?.score || 0)
  } : {
    overall: 40,
    ai_presence: 65,
    competitor_landscape: 0,
    strategy_review: 62
  };

  const [aiPlatforms] = useState<AIPlatform[]>([
    { name: 'ChatGPT', icon: 'A', score: 85, status: 'LIVE' },
    { name: 'Gemini', icon: 'G', score: 85, status: 'LIVE' },
    { name: 'Claude', icon: 'C', score: 85, status: 'LIVE' }
  ]);

  const [competitors] = useState<Competitor[]>([
    { name: 'Apple', count: 3 },
    { name: 'Xiaomi', count: 2 },
    { name: 'Oppo', count: 1 },
    { name: 'Samsung', count: 1 },
    { name: 'Other', count: 4 }
  ]);

  const [strategyMetrics] = useState<StrategyMetric[]>([
    { name: 'Answerability', score: 75, status: 'LIVE', color: 'green' },
    { name: 'Knowledge Base', score: 31, status: 'LIVE', color: 'red' },
    { name: 'Structured Data', score: 55, status: 'LIVE', color: 'orange' },
    { name: 'AI Crawler Accessibility', score: 87, status: 'LIVE', color: 'green' }
  ]);


  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981'; // green
    if (score >= 60) return '#F59E0B'; // orange
    if (score >= 40) return '#EF4444'; // red
    return '#6B7280'; // gray
  };

  const getScoreText = (score: number) => {
    if (score >= 90) return 'Exceptional! Your Company\'s AEO report obtained an outstanding score. Your company has mastered AI visibility strategies and is prominently featured in AI responses. Our suggestions will help maintain this exceptional performance.';
    if (score >= 70) return 'Good performance! Your AEO score shows strong AI visibility. There are opportunities to optimize further and improve your presence in AI responses.';
    if (score >= 50) return 'Moderate performance. Your AEO score indicates room for improvement in AI visibility strategies.';
    return 'Your AEO score needs attention. Focus on improving AI visibility and structured data implementation.';
  };

  return (
    <div className="aeo-dashboard">

      {/* Overall Score and Report Summary */}
      <div className="overall-section">
        <div className="overall-score">
          <div 
            className="score-circle"
            style={{ '--progress': scores.overall } as React.CSSProperties}
          >
            <div className="score-value">{scores.overall}</div>
            <div className="score-total">/100</div>
          </div>
        </div>
        <div className="report-summary">
          <div className="summary-date">{new Date().toLocaleDateString('en-GB')}</div>
          <div className="summary-text">{getScoreText(scores.overall)}</div>
        </div>
      </div>

      {/* Main Dashboard Cards */}
      <div className="dashboard-cards">
        {/* AI Presence Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>AI Presence</h3>
          </div>
          <div className="card-score">
            <div 
              className="score-circle-metric"
              style={{ 
                '--progress': scores.ai_presence,
                '--color': getScoreColor(scores.ai_presence)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.ai_presence}</div>
            </div>
          </div>
          <div className="ai-platforms">
            {aiPlatforms.map((platform, index) => (
              <div key={index} className="platform-item">
                <div className="platform-icon" style={{ backgroundColor: platform.status === 'LIVE' ? '#10B981' : '#6B7280' }}>
                  {platform.icon}
                </div>
                <div className="platform-info">
                  <span className="platform-name">{platform.name}</span>
                  <div className="platform-score">
                    <span className="score">{platform.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Competitor Landscape Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Competitor Landscape</h3>
          </div>
          <div className="card-score">
            <div 
              className="score-circle-metric"
              style={{ 
                '--progress': scores.competitor_landscape,
                '--color': getScoreColor(scores.competitor_landscape)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.competitor_landscape}</div>
            </div>
          </div>
          <div className="competitor-description">
            Your company or product was mentioned in industry/product related searches.
          </div>
          <div className="competitors-list">
            <div className="competitors-label">Competitors Mentioned:</div>
            <div className="competitors-tags">
              {competitors.map((competitor, index) => (
                <span key={index} className="competitor-tag">
                  {competitor.count} {competitor.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Strategy Review Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Strategy Review</h3>
          </div>
          <div className="card-score">
            <div 
              className="score-circle-metric"
              style={{ 
                '--progress': scores.strategy_review,
                '--color': getScoreColor(scores.strategy_review)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.strategy_review}</div>
            </div>
          </div>
          <div className="strategy-metrics">
            {strategyMetrics.map((metric, index) => (
              <div key={index} className="metric-item">
                <div className="metric-name">{metric.name}</div>
                <div className="metric-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ 
                        width: `${metric.score}%`,
                        backgroundColor: metric.color === 'green' ? '#10B981' : 
                                       metric.color === 'orange' ? '#F59E0B' : '#EF4444'
                      }}
                    ></div>
                  </div>
                  <div className="metric-score">
                    <span className="score">{metric.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        <div className="tab-navigation">
          {runCrawl && (
            <button
              onClick={() => setActiveView('crawler')}
              className={`tab-button ${activeView === 'crawler' ? 'active' : ''}`}
            >
              🕷️ Crawler {isCrawling && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
            </button>
          )}
          <button
            onClick={() => setActiveView('data')}
            className={`tab-button ${activeView === 'data' ? 'active' : ''}`}
          >
            📋 Crawled Data
          </button>
          <button
            onClick={() => setActiveView('links')}
            className={`tab-button ${activeView === 'links' ? 'active' : ''}`}
          >
            🔗 Link Analysis
          </button>
          <button
            onClick={() => setActiveView('tree')}
            className={`tab-button ${activeView === 'tree' ? 'active' : ''}`}
          >
            🌳 Site Structure
          </button>
          <button
            onClick={() => setActiveView('audits')}
            className={`tab-button ${activeView === 'audits' ? 'active' : ''}`}
          >
            🔍 Performance Audits
          </button>
          <button
            onClick={() => setActiveView('schedules')}
            className={`tab-button ${activeView === 'schedules' ? 'active' : ''}`}
          >
            📅 Schedules
          </button>
          <button
            onClick={() => setActiveView('seo-queue')}
            className={`tab-button ${activeView === 'seo-queue' ? 'active' : ''}`}
          >
            🔍 SEO Queue
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeView === 'crawler' && (
            <div className="crawler-content">
              {/* Crawling Status */}
              <div className="crawler-status">
                <div className="status-header">
                  <h3>🕷️ Crawling Status</h3>
                  <div className="status-indicator">
                    <div className={`status-dot ${isCrawling ? 'active' : ''}`}></div>
                    <span>{isCrawling ? 'Crawling...' : 'Completed'}</span>
                  </div>
                  {isCrawling && onStopCrawl && (
                    <button onClick={onStopCrawl} className="stop-button">
                      🛑 Stop
                    </button>
                  )}
                </div>
                <div className="crawler-stats">
                  <div className="stat-box">
                    <div className="stat-value">{pageCount}</div>
                    <div className="stat-label">Pages Discovered</div>
                  </div>
                  {crawlStats && (
                    <>
                      <div className="stat-box">
                        <div className="stat-value">{crawlStats.duration.toFixed(1)}s</div>
                        <div className="stat-label">Duration</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{crawlStats.pagesPerSecond.toFixed(1)}</div>
                        <div className="stat-label">Pages/Sec</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Live Logs and Discovered Pages */}
              <div className="crawler-panels">
                {/* Live Logs */}
                <div className="crawler-panel">
                  <h4>📝 Live Logs</h4>
                  <div className="logs-container">
                    {logs.length === 0 ? (
                      <div className="empty-logs">
                        {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
                      </div>
                    ) : (
                      logs.slice(-50).map((log, idx) => (
                        <div key={idx} className="log-entry">
                          <span className="log-time">{new Date().toLocaleTimeString()}</span>
                          <span className="log-text">{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Discovered Pages */}
                <div className="crawler-panel">
                  <h4>📄 Discovered Pages</h4>
                  <div className="pages-container">
                    {discoveredPages.length === 0 ? (
                      <div className="empty-pages">
                        No pages discovered yet...
                      </div>
                    ) : (
                      discoveredPages.map((page, idx) => (
                        <div key={idx} className="page-entry">
                          <a 
                            href={page.url || page} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="page-url"
                          >
                            {page.url || page}
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeView === 'data' && (
            <div className="data-content-embedded">
              <DataViewer
                onClose={() => {}}
                initialSessionId={result?.session_id || null}
              />
            </div>
          )}
          
          {activeView === 'links' && (
            <div className="links-content-embedded">
              <LinkExplorer
                onClose={() => {}}
              />
            </div>
          )}
          
          {activeView === 'tree' && (
            <div className="tree-content-embedded">
              <WebTree
                onClose={() => {}}
              />
            </div>
          )}
          
          {activeView === 'audits' && <AuditsPage />}
          {activeView === 'schedules' && <ScheduleList />}
          {activeView === 'seo-queue' && (
            <SeoQueueManager onClose={() => setActiveView('data')} />
          )}
        </div>
      </div>

    </div>
  );
};

export default AEODashboard;
