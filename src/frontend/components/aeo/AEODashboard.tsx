import React, { useState, useEffect } from 'react';
import './AEODashboard.css';
import DataViewer from '../crawler/DataViewer';
import LinkExplorer from '../crawler/LinkExplorer';
import WebTree from '../crawler/FixedWebTree';
import AuditsPage from '../audit/AuditsPage';

interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
  structured_data?: number;
}

interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  details?: {
    understanding_level?: string;
    clarity_score?: number;
    key_topics?: string[];
    main_issues?: string[];
    recommendations?: string[];
    bot_accessibility_score?: number;
    understanding_score?: number;
    scoreType?: 'bot_accessibility' | 'ai_understanding' | 'combined';
    [key: string]: any; // Allow additional properties from backend
  };
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
  crawlStatus?: 'idle' | 'running' | 'auditing' | 'completed';
  pageCount?: number;
  crawlStats?: {
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null;
  logs?: string[];
  discoveredPages?: any[];
}

const AEODashboard: React.FC<AEODashboardProps> = ({ 
  url = 'https://yogreet.com', 
  result, 
  onAnalyze,
  runCrawl = false,
  isCrawling = false,
  crawlStatus = 'idle',
  pageCount = 0,
  crawlStats = null,
  logs = [],
  discoveredPages = []
}) => {
  const [activeView, setActiveView] = useState<'crawler' | 'data' | 'links' | 'tree' | 'audits' | 'schema'>(runCrawl ? 'crawler' : 'data');
  const [showRecommendations, setShowRecommendations] = useState<string | null>(null);
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [schemaFormat, setSchemaFormat] = useState<'json-ld' | 'rdfa'>('json-ld');

  // Generate schema markup
  const generateSchema = async () => {
    if (!url) return;
    
    setSchemaLoading(true);
    setSchemaError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/aeo/generate-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSchemaData(data.results);
      } else {
        setSchemaError(data.error || 'Failed to generate schema');
      }
    } catch (error: any) {
      setSchemaError(error.message || 'Failed to generate schema');
    } finally {
      setSchemaLoading(false);
    }
  };

  // Copy schema to clipboard
  const copySchemaToClipboard = () => {
    const textToCopy = schemaFormat === 'json-ld' ? schemaData?.schema_text : schemaData?.rdfa_markup;
    if (!textToCopy) return;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    });
  };

  // Get recommendations for specific modules
  const getModuleRecommendations = (moduleName: string): string[] => {
    if (!result?.detailed_analysis) return [];
    
    const module = result.detailed_analysis[moduleName];
    return module?.recommendations || [];
  };

  // Determine priority level for a recommendation
  const getRecommendationPriority = (rec: string): 'high' | 'medium' | 'low' => {
    const recLower = rec.toLowerCase();
    
    // High priority keywords
    const highPriorityKeywords = [
      'add title tag',
      'add meta description',
      'allow indexing',
      'robots.txt',
      'sitemap',
      'schema',
      'structured data',
      'faq section',
      'canonical',
      'organization schema',
      'website schema',
      'webpage schema'
    ];
    
    // Medium priority keywords
    const mediumPriorityKeywords = [
      'improve',
      'enhance',
      'optimize',
      'add more',
      'better',
      'clear',
      'formatting',
      'alt text',
      'open graph',
      'twitter card'
    ];
    
    if (highPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'high';
    }
    
    if (mediumPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  };

  // Use real data from analysis result or fallback to defaults
  const scores: AEOScore = result ? {
    overall: Math.round(result.overall_score || 0),
    ai_presence: Math.round(result.module_scores?.ai_presence || result.detailed_analysis?.ai_presence?.score || 0),
    competitor_landscape: Math.round(result.module_scores?.competitor_analysis || result.detailed_analysis?.competitor_analysis?.score || 0),
    strategy_review: Math.round(
      (
        (result.module_scores?.answerability || 0) +
        (result.module_scores?.knowledge_base || 0) +
        (result.module_scores?.structured_data || 0) +
        (result.module_scores?.crawler_accessibility || 0)
      ) / 4
    ),
    structured_data: Math.round(result.module_scores?.structured_data || result.detailed_analysis?.structured_data?.score || 0)
  } : {
    overall: 0,
    ai_presence: 0,
    competitor_landscape: 0,
    strategy_review: 0,
    structured_data: 0
  };

  // Dynamically generate AI platforms from API response
  const getAIPlatforms = (): AIPlatform[] => {
    if (!result || !result.detailed_analysis?.ai_presence) {
      // If no result available, show 0 scores instead of demo data
      return [
        { name: 'ChatGPT', icon: 'A', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: 'G', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: 'C', score: 0, status: 'OFFLINE' }
      ];
    }

    const aiData = result.detailed_analysis.ai_presence;
    const platforms: AIPlatform[] = [];

    // Map common AI platforms to icons
    const platformIcons: { [key: string]: string } = {
      'GPTBot': '🤖',
      'ChatGPT': '🤖',
      'chatgpt': '🤖',
      'OpenAI': '🤖',
      'Google-Extended': '🧠',
      'Gemini': '🧠',
      'gemini': '🧠',
      'ClaudeBot': '🎭',
      'Claude': '🎭',
      'claude': '🎭'
    };

    // Track which platforms we've already added to avoid duplicates
    const addedPlatforms = new Set<string>();
    
    // Process platforms data from backend
    // Backend already handles: score calculation, AI understanding merging, bot accessibility
    if (aiData.platforms && typeof aiData.platforms === 'object') {
      Object.entries(aiData.platforms).forEach(([name, data]: [string, any]) => {
        // Map bot names to AI provider names for display
        const displayName = name === 'GPTBot' ? 'ChatGPT' : 
                          name === 'Google-Extended' ? 'Gemini' : 
                          name === 'ClaudeBot' ? 'Claude' : name;
        
        // Backend already provides the correct score and all details
        // Score is either:
        // - AI understanding score (if bot allowed + API key exists)
        // - Bot accessibility score (if bot allowed but no API key)
        // - 0 (if bot blocked)
        platforms.push({
          name: displayName,
          icon: platformIcons[name] || platformIcons[displayName] || name.charAt(0).toUpperCase(),
          score: Math.round(data.score || 0),
          status: data.status || 'LIVE',
          details: {
            ...data.details,
            // Backend provides: score_type, ai_understanding_score, bot_accessibility_score,
            // understanding_level, clarity_score, key_topics, etc.
            scoreType: data.details?.score_type || 'bot_accessibility'
          }
        });
        addedPlatforms.add(displayName.toLowerCase());
      });
    }

    // Note: AI understanding data is already merged into platforms by backend
    // We only process ai_understanding here if we need additional comparison data
    // or if there are platforms with understanding but no bot entry
    if (aiData.ai_understanding && typeof aiData.ai_understanding === 'object') {
      const multiAI = aiData.ai_understanding;
      
      // Check if there are any providers with understanding data but no platform entry
      // (This should be rare, as backend handles merging)
      if (multiAI.openai || multiAI.gemini || multiAI.claude) {
        const aiProviders = [
          { name: 'ChatGPT', key: 'openai', icon: '🤖' },
          { name: 'Gemini', key: 'gemini', icon: '🧠' },
          { name: 'Claude', key: 'claude', icon: '🎭' }
        ];
        
        aiProviders.forEach(provider => {
          const data = multiAI[provider.key];
          const platformKey = provider.name.toLowerCase();
          
          // Only add if this provider isn't already in platforms
          // (Backend should have already included it, but handle edge cases)
          if (data && !data.error) {
            const existingIndex = platforms.findIndex(p => 
              p.name.toLowerCase() === platformKey
            );
            
            if (existingIndex === -1) {
              // Edge case: Provider has understanding but no bot/platform entry
              // This shouldn't happen normally, but handle gracefully
              platforms.push({
                name: provider.name,
                icon: provider.icon,
                score: Math.round(data.score || 0),
                status: 'LIVE',
                details: {
                  understanding_level: data.understanding_level,
                  clarity_score: data.clarity_score,
                  key_topics: data.key_topics,
                  main_issues: data.main_issues,
                  recommendations: data.recommendations,
                  scoreType: 'ai_understanding',
                  ai_understanding_available: true,
                  ai_understanding_score: Math.round(data.score || 0)
                }
              });
            }
            // If platform already exists, backend already merged everything correctly
          }
        });
      }
    }

    // If no platforms data found in API, return 0 scores
    if (platforms.length === 0) {
      return [
        { name: 'ChatGPT', icon: '🤖', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: '🧠', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: '🎭', score: 0, status: 'OFFLINE' }
      ];
    }

    return platforms;
  };

  // Dynamically generate competitors from API response (DataForSEO format)
  const getCompetitors = (): Competitor[] => {
    if (!result || !result.detailed_analysis?.competitor_analysis) {
      // Fallback to demo data
      return [
        { name: 'No Data', count: 0 }
      ];
    }

    const compData = result.detailed_analysis.competitor_analysis;
    
    // Check if there's an error (API not configured)
    if (compData.error) {
      return [
        { name: 'Not Configured', count: 0 }
      ];
    }
    
    // DataForSEO API returns: top_competitors as array of {domain, referring_domains}
    if (compData.top_competitors && Array.isArray(compData.top_competitors)) {
      // Map top competitors to display format
      return compData.top_competitors.map((comp: any) => {
        const domain = comp.domain || 'Unknown';
        const count = comp.referring_domains || 0;
        return {
          name: domain,
          count: count
        };
      });
    }

    // Fallback - show that competitor analysis exists but no competitors data
    return [
      { name: 'No Competitors Found', count: 0 }
    ];
  };

  const aiPlatforms = getAIPlatforms();
  const competitors = getCompetitors();

  // Dynamically generate strategy metrics from API response
  const getStrategyMetrics = (): StrategyMetric[] => {
    if (!result || !result.module_scores) {
      // Fallback to demo data if no results
      return [
        { name: 'Answerability', score: 0, status: 'LIVE', color: 'green' },
        { name: 'Knowledge Base', score: 0, status: 'LIVE', color: 'red' },
        { name: 'Structured Data', score: 0, status: 'LIVE', color: 'orange' },
        { name: 'AI Crawler Accessibility', score: 0, status: 'LIVE', color: 'green' }
      ];
    }

    const getColorForScore = (score: number): 'green' | 'orange' | 'red' => {
      if (score >= 70) return 'green';
      if (score >= 40) return 'orange';
      return 'red';
    };

    const metrics: StrategyMetric[] = [];

    // Answerability
    if (result.module_scores.answerability !== undefined) {
      const score = Math.round(result.module_scores.answerability);
      metrics.push({
        name: 'Answerability',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    // Knowledge Base
    if (result.module_scores.knowledge_base !== undefined) {
      const score = Math.round(result.module_scores.knowledge_base);
      metrics.push({
        name: 'Knowledge Base',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    // Structured Data
    if (result.module_scores.structured_data !== undefined) {
      const score = Math.round(result.module_scores.structured_data);
      metrics.push({
        name: 'Structured Data',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    // AI Crawler Accessibility
    if (result.module_scores.crawler_accessibility !== undefined) {
      const score = Math.round(result.module_scores.crawler_accessibility);
      metrics.push({
        name: 'AI Crawler Accessibility',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    return metrics;
  };

  const strategyMetrics = getStrategyMetrics();


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
            {getModuleRecommendations('ai_presence').length > 0 && (
              <button 
                className="info-button"
                onClick={() => setShowRecommendations('ai_presence')}
                title={`View ${getModuleRecommendations('ai_presence').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="7" r="0.75" fill="currentColor"/>
                </svg>
                <span className="info-badge">{getModuleRecommendations('ai_presence').length}</span>
              </button>
            )}
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
            {getModuleRecommendations('competitor_analysis').length > 0 && (
              <button 
                className="info-button"
                onClick={() => setShowRecommendations('competitor_analysis')}
                title={`View ${getModuleRecommendations('competitor_analysis').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="7" r="0.75" fill="currentColor"/>
                </svg>
                <span className="info-badge">{getModuleRecommendations('competitor_analysis').length}</span>
              </button>
            )}
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
            {result?.detailed_analysis?.competitor_analysis?.metrics ? (
              <>
                Your domain has <strong>{result.detailed_analysis.competitor_analysis.metrics.total_referring_domains || 0}</strong> referring domains 
                with <strong>{result.detailed_analysis.competitor_analysis.metrics.total_individual_backlinks || 0}</strong> total backlinks.
              </>
            ) : (
              'Analyzing your backlink profile and competitive landscape.'
            )}
          </div>
          <div className="competitors-list">
            <div className="competitors-label">Top Referring Domains:</div>
            <div className="competitors-tags">
              {competitors.length > 0 && competitors[0].name !== 'No Data' && competitors[0].name !== 'Not Configured' ? (
                competitors.map((competitor, index) => (
                  <span key={index} className="competitor-tag">
                    <span className="competitor-count">{competitor.count}</span> {competitor.name}
                  </span>
                ))
              ) : (
                <span className="competitor-tag-empty">
                  {competitors[0]?.name === 'Not Configured' 
                    ? 'Configure DataForSEO API to see competitor data' 
                    : 'No competitor data available'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Strategy Review Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Strategy Review</h3>
            {(getModuleRecommendations('answerability').length > 0 || 
              getModuleRecommendations('knowledge_base').length > 0 || 
              getModuleRecommendations('structured_data').length > 0 || 
              getModuleRecommendations('crawler_accessibility').length > 0) && (
              <button 
                className="info-button"
                onClick={() => setShowRecommendations('strategy_review')}
                title={`View ${getModuleRecommendations('answerability').length + getModuleRecommendations('knowledge_base').length + getModuleRecommendations('structured_data').length + getModuleRecommendations('crawler_accessibility').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="7" r="0.75" fill="currentColor"/>
                </svg>
                <span className="info-badge">
                  {getModuleRecommendations('answerability').length + 
                   getModuleRecommendations('knowledge_base').length + 
                   getModuleRecommendations('structured_data').length + 
                   getModuleRecommendations('crawler_accessibility').length}
                </span>
              </button>
            )}
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
            onClick={() => setActiveView('schema')}
            className={`tab-button ${activeView === 'schema' ? 'active' : ''}`}
          >
            📝 Schema Generator
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
                    <span>
                      {crawlStatus === 'running' ? 'Crawling...' : 
                       crawlStatus === 'auditing' ? 'Auditing...' : 
                       'Completed'}
                    </span>
                  </div>
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
                        <div className="stat-label">Items/Sec</div>
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
          
          {activeView === 'schema' && (
            <div className="schema-generator-content">
              <div className="content-header">
                <div>
                  <h3>📝 Schema.org Markup Generator</h3>
                  <p>Generate SEO-optimized Schema.org JSON-LD markup using AI</p>
                </div>
                <button 
                  className="action-button primary"
                  onClick={generateSchema}
                  disabled={schemaLoading || !url}
                >
                  {schemaLoading ? '⏳ Generating...' : '✨ Generate Schema'}
                </button>
              </div>

              {schemaError && (
                <div className="schema-error">
                  <div className="error-icon">⚠️</div>
                  <div>
                    <h4>Error Generating Schema</h4>
                    <p>{schemaError}</p>
                  </div>
                </div>
              )}

              {schemaLoading && (
                <div className="schema-loading">
                  <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Analyzing page content and generating schema markup...</p>
                  </div>
                </div>
              )}

              {schemaData && !schemaLoading && (
                <div className="schema-results">
                  {/* Schema Code */}
                  <div className="schema-code-card">
                    <div className="schema-code-header">
                      <div className="schema-header-left">
                        <h4>Schema Markup</h4>
                        <div className="schema-format-toggle">
                          <button 
                            className={`format-button ${schemaFormat === 'json-ld' ? 'active' : ''}`}
                            onClick={() => setSchemaFormat('json-ld')}
                          >
                            JSON-LD
                          </button>
                          <button 
                            className={`format-button ${schemaFormat === 'rdfa' ? 'active' : ''}`}
                            onClick={() => setSchemaFormat('rdfa')}
                          >
                            RDFa
                          </button>
                        </div>
                      </div>
                      <button 
                        className="copy-button"
                        onClick={copySchemaToClipboard}
                      >
                        {copiedSchema ? '✅ Copied!' : '📋 Copy to Clipboard'}
                      </button>
                    </div>
                    <div className="schema-code-container">
                      <pre className="schema-code">
                        <code>{schemaFormat === 'json-ld' ? schemaData.schema_text : schemaData.rdfa_markup}</code>
                      </pre>
                    </div>
                  </div>

                </div>
              )}

              {!schemaData && !schemaLoading && !schemaError && (
                <div className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <h3>Generate Schema Markup</h3>
                  <p>
                    Click the "Generate Schema" button above to create SEO-optimized Schema.org markup for your page.
                    <br /><br />
                    Our AI will analyze your page content and generate the most appropriate schema type
                    (Article, Product, LocalBusiness, Organization, etc.) with all relevant properties.
                  </p>
                  <div className="empty-state-hint">
                    💡 Make sure your OpenAI API key is configured for AI-powered schema generation
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recommendations Modal */}
      {showRecommendations && (
        <div className="recommendations-modal-overlay" onClick={() => setShowRecommendations(null)}>
          <div className="recommendations-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <div className="modal-title-icon">
                  {showRecommendations === 'ai_presence' && '🤖'}
                  {showRecommendations === 'competitor_analysis' && '🎯'}
                  {showRecommendations === 'strategy_review' && '📊'}
                </div>
                <div className="modal-title-section">
                  <h3>
                    {showRecommendations === 'ai_presence' && 'AI Presence Recommendations'}
                    {showRecommendations === 'competitor_analysis' && 'Competitor Analysis Recommendations'}
                    {showRecommendations === 'strategy_review' && 'Strategy Review Recommendations'}
                  </h3>
                  <p className="modal-subtitle">
                    {showRecommendations === 'ai_presence' && 'Improve your AI visibility and presence'}
                    {showRecommendations === 'competitor_analysis' && 'Enhance your competitive positioning'}
                    {showRecommendations === 'strategy_review' && 'Optimize your overall strategy'}
                  </p>
                </div>
              </div>
              <button 
                className="close-button"
                onClick={() => setShowRecommendations(null)}
                aria-label="Close modal"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-content">
              {showRecommendations === 'strategy_review' ? (
                <div className="strategy-recommendations">
                  {getModuleRecommendations('answerability').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">❓</span>
                        <h4>Answerability</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('answerability').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('knowledge_base').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">📚</span>
                        <h4>Knowledge Base</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('knowledge_base').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('structured_data').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">🔧</span>
                        <h4>Structured Data</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('structured_data').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('crawler_accessibility').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">🕷️</span>
                        <h4>Crawler Accessibility</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('crawler_accessibility').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {(() => {
                    const moduleName = showRecommendations === 'ai_presence' ? 'AI Presence' : 
                                      showRecommendations === 'competitor_analysis' ? 'Competitor Analysis' : '';
                    const moduleIcon = showRecommendations === 'ai_presence' ? '🤖' : 
                                     showRecommendations === 'competitor_analysis' ? '🎯' : '';
                    const recommendations = getModuleRecommendations(showRecommendations);
                    
                    if (recommendations.length === 0) {
                      return (
                        <div className="no-recommendations">
                          <div className="no-recommendations-icon">📝</div>
                          <div className="no-recommendations-text">
                            No recommendations available for this module.
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="module-section">
                        {moduleName && (
                          <div className="module-section-header">
                            <span className="module-icon">{moduleIcon}</span>
                            <h4>{moduleName}</h4>
                          </div>
                        )}
                        <div className="recommendations-list">
                          {recommendations.map((rec, index) => {
                            const priority = getRecommendationPriority(rec);
                            return (
                              <div key={index} className={`recommendation-item priority-${priority}`}>
                                <div className="recommendation-icon-wrapper">
                                  <div className="recommendation-icon">💡</div>
                                </div>
                                <div className="recommendation-content">
                                  <div className="recommendation-header">
                                    <span className={`priority-badge priority-${priority}`}>
                                      {priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="recommendation-text">{rec}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AEODashboard;
