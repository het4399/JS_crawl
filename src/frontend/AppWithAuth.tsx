import React, { useState } from 'react';
import './index.css';
import './App.css';
import { useAuth } from './contexts/AuthContext';
import { Navbar } from './components/navbar/Navbar';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { HomePage } from './components/home/HomePage';
import { UserProfile } from './components/user/UserProfile';
import { UserSettings } from './components/user/UserSettings';
import AEODashboard from './components/aeo/AEODashboard';
import { CrawlHistory } from './components/crawler/CrawlHistory';
import { apiService, AnalysisResult } from './api';

type View = 'home' | 'login' | 'register' | 'profile' | 'settings' | 'history';

const AppWithAuth: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [currentView, setCurrentView] = useState<View>('home');
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runCrawl, setRunCrawl] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  
  // Crawler settings
  const [allowSubdomains, setAllowSubdomains] = useState<boolean>(true);
  const [runAudits, setRunAudits] = useState<boolean>(false);
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [captureLinkDetails, setCaptureLinkDetails] = useState<boolean>(true);
  
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

  // Server-Sent Events for live updates (only for authenticated users)
  React.useEffect(() => {
    // Only connect SSE if user is authenticated
    if (!isAuthenticated) {
      console.log('SSE: User not authenticated, skipping connection');
      return;
    }

    console.log('SSE: Connecting for authenticated user...');
    const eventSource = new EventSource('/events');

    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('SSE connected:', data);
    });

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
      setCrawlStats({
        count: data.count,
        duration: data.duration || 0,
        pagesPerSecond: data.pagesPerSecond || 0
      });
      setIsCrawling(false);
      setLogs(prev => [...prev, `✅ Crawl completed! Total URLs: ${data.count}`]);
    });

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // EventSource will automatically reconnect
    };

    // Cleanup: close connection when component unmounts or user logs out
    return () => {
      console.log('SSE: Closing connection');
      eventSource.close();
    };
  }, [isAuthenticated]); // Re-run when authentication status changes

  // Clear all crawl/history data when user logs out
  React.useEffect(() => {
    if (!isAuthenticated) {
      setUrl('');
      setLoading(false);
      setResult(null);
      setError(null);
      setRunCrawl(false);
      setIsCrawling(false);
      setPageCount(0);
      setLogs([]);
      setPages([]);
      setCrawlStats(null);
      setCurrentView('home');
    }
  }, [isAuthenticated]);

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
    
    try {
      const analysisResult = runCrawl
        ? await apiService.analyzeUrl(url.trim(), {
            allowSubdomains,
            runAudits,
            auditDevice,
            captureLinkDetails
          })
        : await apiService.analyzeUrl(url.trim());
      
      setResult(analysisResult);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze URL');
    } finally {
      setLoading(false);
      setIsCrawling(false);
    }
  };

  // Handle selecting a crawl from history
  const handleSelectCrawl = async (crawlUrl: string, sessionId: number, aeoResult: any) => {
    setUrl(crawlUrl);
    setCurrentView('home');
    setLoading(true);
    
    try {
      // Fetch session data (pages, stats, etc.)
      const sessionData = await apiService.getSessionData(sessionId);
      
      // Extract pages from session data
      const sessionPages = sessionData.data
        .filter((item: any) => item.resourceType === 'page')
        .map((page: any) => page.url);
      
      // Restore pages and stats
      setPages(sessionPages);
      setPageCount(sessionData.totalPages);
      
      // Restore logs
      if (sessionData.logs && sessionData.logs.length > 0) {
        const logMessages = sessionData.logs.map((log: any) => log.message);
        setLogs(logMessages);
      } else {
        // If no logs in database, show a placeholder message
        setLogs([`📜 Crawl completed for ${crawlUrl}`, `Total pages: ${sessionData.totalPages}`]);
      }
      
      // Set crawl stats if session data available
      if (sessionData.session) {
        setCrawlStats({
          count: sessionData.totalPages,
          duration: sessionData.session.duration || 0,
          pagesPerSecond: sessionData.session.duration 
            ? parseFloat((sessionData.totalPages / (sessionData.session.duration / 1000)).toFixed(2))
            : 0
        });
      } else {
        // Fallback crawl stats based on available data
        setCrawlStats({
          count: sessionData.totalPages,
          duration: 0,
          pagesPerSecond: 0
        });
      }
      
      // Restore AEO result if available
      if (aeoResult) {
        const restoredResult: AnalysisResult = {
          success: true,
          url: crawlUrl,
          grade: aeoResult.grade,
          grade_color: aeoResult.gradeColor,
          overall_score: aeoResult.overallScore,
          module_scores: aeoResult.moduleScores,
          module_weights: aeoResult.moduleWeights,
          detailed_analysis: aeoResult.detailedAnalysis,
          structured_data: aeoResult.structuredData,
          all_recommendations: aeoResult.recommendations,
          errors: aeoResult.errors,
          warnings: aeoResult.warnings,
          analysis_timestamp: aeoResult.analysisTimestamp,
          run_id: aeoResult.runId
        };
        setResult(restoredResult);
      }
      
      setRunCrawl(true); // Show crawl results including crawler tab
      
    } catch (error: any) {
      console.error('Failed to restore session data:', error);
      setError(`Failed to restore crawl data: ${error.message}`);
      
      // Still restore AEO result even if session data fails
      if (aeoResult) {
        const restoredResult: AnalysisResult = {
          success: true,
          url: crawlUrl,
          grade: aeoResult.grade,
          grade_color: aeoResult.gradeColor,
          overall_score: aeoResult.overallScore,
          module_scores: aeoResult.moduleScores,
          module_weights: aeoResult.moduleWeights,
          detailed_analysis: aeoResult.detailedAnalysis,
          structured_data: aeoResult.structuredData,
          all_recommendations: aeoResult.recommendations,
          errors: aeoResult.errors,
          warnings: aeoResult.warnings,
          analysis_timestamp: aeoResult.analysisTimestamp,
          run_id: aeoResult.runId
        };
        setResult(restoredResult);
        setRunCrawl(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Render different views
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-black">
        <Navbar
          user={null}
          isAuthenticated={false}
          onNavigate={setCurrentView}
          onLogout={logout}
          currentView={currentView}
        />
        <Login
          onSwitchToRegister={() => setCurrentView('register')}
          onSuccess={() => setCurrentView('home')}
        />
      </div>
    );
  }

  if (currentView === 'register') {
    return (
      <div className="min-h-screen bg-black">
        <Navbar
          user={null}
          isAuthenticated={false}
          onNavigate={setCurrentView}
          onLogout={logout}
          currentView={currentView}
        />
        <Register
          onSwitchToLogin={() => setCurrentView('login')}
          onSuccess={() => setCurrentView('home')}
        />
      </div>
    );
  }

  if (currentView === 'profile') {
    return (
      <div className="min-h-screen bg-black">
        <Navbar
          user={user}
          isAuthenticated={isAuthenticated}
          onNavigate={setCurrentView}
          onLogout={logout}
          currentView={currentView}
        />
        <UserProfile />
      </div>
    );
  }

  if (currentView === 'settings') {
    return (
      <div className="min-h-screen bg-black">
        <Navbar
          user={user}
          isAuthenticated={isAuthenticated}
          onNavigate={setCurrentView}
          onLogout={logout}
          currentView={currentView}
        />
        <UserSettings />
      </div>
    );
  }

  if (currentView === 'history') {
    return (
      <div className="min-h-screen bg-black" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
        <Navbar
          user={user}
          isAuthenticated={isAuthenticated}
          onNavigate={setCurrentView}
          onLogout={logout}
          currentView={currentView}
        />
        <div className="container mx-auto px-4 py-8">
          <CrawlHistory onSelectCrawl={handleSelectCrawl} />
        </div>
      </div>
    );
  }

  // Main Home View - Show landing page if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar
          user={null}
          isAuthenticated={false}
          onNavigate={setCurrentView}
          onLogout={logout}
        />
        <HomePage 
          onLogin={() => setCurrentView('login')}
          onRegister={() => setCurrentView('register')}
        />
      </div>
    );
  }

  // Authenticated User - Main Dashboard
  return (
    <div className="min-h-screen bg-black aeo-dark" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
      <Navbar
        user={user}
        isAuthenticated={isAuthenticated}
        onNavigate={setCurrentView}
        onLogout={logout}
        currentView={currentView}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-4">
            Content Analytics & AEO Intelligence
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Analyze your website's structured data and get actionable insights to improve 
            your search engine visibility and Answer Engine Optimization (AEO).
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto mb-8">
          <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
            <div className="flex gap-4 mb-4">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter website URL (e.g., https://example.com)"
                className="flex-1 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                disabled={loading}
                required
              />
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
            
            {/* Crawl Checkbox */}
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

            {/* Advanced Options */}
            {runCrawl && (
              <div className="border-t border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-purple-400 hover:text-purple-300 font-medium mb-4 transition-colors"
                >
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

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

        {/* Results */}
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
      </div>
    </div>
  );
};

export default AppWithAuth;

