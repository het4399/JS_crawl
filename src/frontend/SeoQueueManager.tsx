import React, { useState, useEffect } from 'react';

interface SeoQueueStats {
  totalQueued: number;
  queuedUrls: string[];
}

interface SeoCacheStats {
  totalEntries: number;
  expiredEntries: number;
  validEntries: number;
  hitRate: number;
}

export default function SeoQueueManager({ onClose }: { onClose: () => void }) {
  const [queueStats, setQueueStats] = useState<SeoQueueStats | null>(null);
  const [cacheStats, setCacheStats] = useState<SeoCacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadQueueStats = async () => {
    try {
      const response = await fetch('/api/seo/queue/stats');
      if (response.ok) {
        const stats = await response.json();
        setQueueStats(stats || { totalQueued: 0, queuedUrls: [] });
      }
    } catch (err) {
      console.error('Failed to load queue stats:', err);
      setQueueStats({ totalQueued: 0, queuedUrls: [] });
    }
  };

  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/seo/cache/stats');
      if (response.ok) {
        const stats = await response.json();
        setCacheStats(stats || { totalEntries: 0, expiredEntries: 0, validEntries: 0, hitRate: 0 });
      }
    } catch (err) {
      console.error('Failed to load cache stats:', err);
      setCacheStats({ totalEntries: 0, expiredEntries: 0, validEntries: 0, hitRate: 0 });
    }
  };

  const clearQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/seo/queue/clear', { method: 'POST' });
      if (response.ok) {
        await loadQueueStats();
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to clear queue');
      }
    } catch (err) {
      setError('Failed to clear queue');
    } finally {
      setLoading(false);
    }
  };

  const addUrl = async () => {
    if (!newUrl.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/seo/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim() })
      });
      
      if (response.ok) {
        setNewUrl('');
        await loadQueueStats();
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to add URL');
      }
    } catch (err) {
      setError('Failed to add URL');
    } finally {
      setLoading(false);
    }
  };

  const processQueue = async () => {
    setProcessing(true);
    try {
      const response = await fetch('/api/seo/queue/process', { method: 'POST' });
      if (response.ok) {
        setError(null);
        // Start polling for updates
        const pollInterval = setInterval(async () => {
          await loadQueueStats();
          if (queueStats?.totalQueued === 0) {
            clearInterval(pollInterval);
            setProcessing(false);
          }
        }, 2000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to start processing');
        setProcessing(false);
      }
    } catch (err) {
      setError('Failed to start processing');
      setProcessing(false);
    }
  };

  const clearCache = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/seo/cache/clear-expired', { method: 'POST' });
      if (response.ok) {
        await loadCacheStats();
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to clear cache');
      }
    } catch (err) {
      setError('Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueueStats();
    loadCacheStats();
  }, []);

  // Auto-refresh stats
  useEffect(() => {
    const interval = setInterval(() => {
      loadQueueStats();
      loadCacheStats();
    }, 2000); // Refresh every 2 seconds
    
    return () => clearInterval(interval);
  }, []);



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">SEO Queue Manager</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Queue Management */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Queue Management</h3>
              
              {queueStats && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm text-gray-600">
                    <strong>Total URLs in queue:</strong> {queueStats.totalQueued || 0}
                  </p>
                  {queueStats.queuedUrls && queueStats.queuedUrls.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700 mb-2">Queued URLs:</p>
                      <div className="max-h-32 overflow-y-auto">
                        {queueStats.queuedUrls.slice(0, 10).map((url, index) => (
                          <div key={index} className="text-xs text-gray-600 truncate">
                            {index + 1}. {url}
                          </div>
                        ))}
                        {queueStats.queuedUrls && queueStats.queuedUrls.length > 10 && (
                          <div className="text-xs text-gray-500">
                            ... and {queueStats.queuedUrls.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="Enter URL to add to queue"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addUrl}
                    disabled={loading || !newUrl.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={processQueue}
                    disabled={loading || processing || !queueStats?.totalQueued}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Process Queue'}
                  </button>
                  
                  <button
                    onClick={clearQueue}
                    disabled={loading || !queueStats?.totalQueued}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Clear Queue
                  </button>
                </div>
              </div>
            </div>

            {/* Cache Management */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Cache Management</h3>
              
              {cacheStats && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Total entries:</p>
                      <p className="font-semibold">{cacheStats.totalEntries || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Valid entries:</p>
                      <p className="font-semibold text-green-600">{cacheStats.validEntries || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Expired entries:</p>
                      <p className="font-semibold text-red-600">{cacheStats.expiredEntries || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Hit rate:</p>
                      <p className="font-semibold">{cacheStats.hitRate ? cacheStats.hitRate.toFixed(1) : '0.0'}%</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={clearCache}
                disabled={loading}
                className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                Clear Expired Cache
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex gap-2">
              <button
                onClick={loadQueueStats}
                disabled={loading}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                Refresh Stats
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
