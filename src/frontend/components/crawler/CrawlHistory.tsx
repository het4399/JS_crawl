import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './CrawlHistory.css';

interface CrawlHistoryItem {
  session: {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    startedAt: string;
    completedAt?: string;
    totalPages: number;
    totalResources: number;
    duration: number;
    status: 'running' | 'completed' | 'failed';
  };
  aeoResult: {
    grade: string;
    gradeColor: string;
    overallScore: number;
    analysisTimestamp: string;
  } | null;
  isReused?: boolean;
}

interface CrawlHistoryProps {
  onSelectCrawl: (url: string, sessionId: number, aeoResult: any) => void;
}

export const CrawlHistory: React.FC<CrawlHistoryProps> = ({ onSelectCrawl }) => {
  const { accessToken } = useAuth();
  const [history, setHistory] = useState<CrawlHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/crawl-history', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch crawl history');
      }

      const data = await response.json();
      setHistory(data.history);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-blue-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500'
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status as keyof typeof colors] || 'bg-gray-500'} text-white`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="crawl-history-container">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-300">Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crawl-history-container">
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-200">Error: {error}</p>
          <button
            onClick={fetchHistory}
            className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="crawl-history-container">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🕷️</div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">No Crawl History Yet</h3>
          <p className="text-gray-400">
            Your crawl history will appear here once you start analyzing websites.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="crawl-history-container">
      <h2 className="text-2xl font-bold text-white mb-6">📜 Crawl History</h2>
      
      <div className="history-grid">
        {history.map((item) => (
          <div
            key={item.session.id}
            className="history-card bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-purple-500 transition-all cursor-pointer"
            onClick={() => onSelectCrawl(item.session.startUrl, item.session.id, item.aeoResult)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white truncate mb-1">
                  {item.session.startUrl}
                </h3>
                <p className="text-sm text-gray-400">
                  {formatDate(item.session.startedAt)}
                </p>
              </div>
              <div className="flex gap-2 items-start">
                {getStatusBadge(item.session.status)}
                {item.isReused && (
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white whitespace-nowrap">
                    ⚡ Reused
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="stat-box bg-gray-900 rounded p-2">
                <p className="text-xs text-gray-400">Pages Crawled</p>
                <p className="text-xl font-bold text-white">{item.session.totalPages}</p>
              </div>
              <div className="stat-box bg-gray-900 rounded p-2">
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-xl font-bold text-white">{(item.session.duration)+ "s"}</p>
              </div>
            </div>

            {item.aeoResult && (
              <div className="aeo-score-box bg-gradient-to-r from-purple-900 to-purple-800 rounded p-3 mt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-purple-200">AEO Score</p>
                    <p className="text-2xl font-bold text-white">
                      {item.aeoResult.overallScore.toFixed(1)}%
                    </p>
                  </div>
                  <div
                    className="grade-badge text-3xl font-bold px-4 py-2 rounded"
                    style={{ backgroundColor: item.aeoResult.gradeColor }}
                  >
                    {item.aeoResult.grade}
                  </div>
                </div>
              </div>
            )}

            {!item.aeoResult && item.session.status === 'completed' && (
              <div className="mt-3 text-center text-sm text-gray-400">
                No AEO analysis available
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

