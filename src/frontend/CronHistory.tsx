import React, { useState, useEffect } from 'react';
import './CronHistory.css';

interface CronExecution {
  id: number;
  scheduleId: number;
  sessionId: number;
  scheduleName: string;
  startUrl: string;
  mode: string;
  allowSubdomains: boolean;
  maxConcurrency: number;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  errorMessage?: string;
  pagesCrawled: number;
  resourcesFound: number;
  duration: number;
}

interface CronStats {
  overall: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    runningExecutions: number;
    successRate: number;
    averageDuration: number;
    totalPagesCrawled: number;
    totalResourcesFound: number;
  };
  recent: CronExecution[];
  performance: Array<{
    scheduleId: number;
    scheduleName: string;
    startUrl: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    averageDuration: number;
    lastRun?: string;
  }>;
}

interface CronHistoryProps {
  onClose: () => void;
}

const CronHistory: React.FC<CronHistoryProps> = ({ onClose }) => {
  const [executions, setExecutions] = useState<CronExecution[]>([]);
  const [stats, setStats] = useState<CronStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<CronExecution | null>(null);
  const [filters, setFilters] = useState({
    scheduleId: '',
    status: '',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0,
    hasMore: false
  });

  useEffect(() => {
    loadHistory();
    loadStats();
  }, [filters, pagination.offset]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        ...(filters.scheduleId && { scheduleId: filters.scheduleId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      });

      const response = await fetch(`/api/cron/history?${params}`);
      if (!response.ok) throw new Error('Failed to load history');
      
      const data = await response.json();
      setExecutions(data.executions);
      setPagination(prev => ({
        ...prev,
        total: data.paging.total,
        hasMore: data.paging.hasMore
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/cron/stats');
      if (!response.ok) throw new Error('Failed to load stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const params = new URLSearchParams({
        format,
        ...(filters.scheduleId && { scheduleId: filters.scheduleId }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      });

      const response = await fetch(`/api/cron/export?${params}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cron-history-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      case 'running': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (loading && executions.length === 0) {
    return (
      <div className="cron-history-overlay">
        <div className="cron-history-modal">
          <div className="loading">Loading cron session history...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cron-history-container">
        <div className="cron-history-header">
          <h2>Cron Session History</h2>
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Stats Overview */}
        {stats && (
          <div className="stats-overview">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.overall.totalExecutions}</div>
                <div className="stat-label">Total Executions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#10b981' }}>
                  {stats.overall.successRate}%
                </div>
                <div className="stat-label">Success Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.overall.successfulExecutions}</div>
                <div className="stat-label">Successful</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#ef4444' }}>
                  {stats.overall.failedExecutions}
                </div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{formatDuration(stats.overall.averageDuration)}</div>
                <div className="stat-label">Avg Duration</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.overall.totalPagesCrawled.toLocaleString()}</div>
                <div className="stat-label">Total Pages</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="filters-section">
          <div className="filters-grid">
            <div className="filter-group">
              <label>Schedule ID:</label>
              <input
                type="number"
                value={filters.scheduleId}
                onChange={(e) => handleFilterChange('scheduleId', e.target.value)}
                placeholder="Filter by schedule ID"
              />
            </div>
            <div className="filter-group">
              <label>Status:</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Start Date:</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>End Date:</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
          <div className="filter-actions">
            <button onClick={() => setFilters({ scheduleId: '', status: '', startDate: '', endDate: '' })}>
              Clear Filters
            </button>
            <button onClick={() => handleExport('json')}>Export JSON</button>
            <button onClick={() => handleExport('csv')}>Export CSV</button>
          </div>
        </div>

        {/* Executions Table */}
        <div className="executions-section">
          <div className="table-container">
            <table className="executions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Schedule</th>
                  <th>Start URL</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Pages</th>
                  <th>Resources</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.id}>
                    <td>{execution.id}</td>
                    <td>
                      <div className="schedule-info">
                        <div className="schedule-name">{execution.scheduleName}</div>
                        <div className="schedule-id">ID: {execution.scheduleId}</div>
                      </div>
                    </td>
                    <td>
                      <div className="url-cell">
                        <a href={execution.startUrl} target="_blank" rel="noopener noreferrer">
                          {execution.startUrl}
                        </a>
                      </div>
                    </td>
                    <td>{formatDate(execution.startedAt)}</td>
                    <td>{formatDuration(execution.duration)}</td>
                    <td>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(execution.status) }}
                      >
                        {execution.status}
                      </span>
                    </td>
                    <td>{execution.pagesCrawled.toLocaleString()}</td>
                    <td>{execution.resourcesFound.toLocaleString()}</td>
                    <td>
                      <button 
                        className="view-details-btn"
                        onClick={() => setSelectedExecution(execution)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button 
              disabled={pagination.offset === 0}
              onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            >
              Previous
            </button>
            <span>
              Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <button 
              disabled={!pagination.hasMore}
              onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            >
              Next
            </button>
          </div>
        </div>

        {/* Execution Details */}
        {selectedExecution && (
          <div className="execution-details-container">
              <div className="execution-details-header">
                <h3>Execution Details - #{selectedExecution.id}</h3>
                <button className="close-btn" onClick={() => setSelectedExecution(null)}>×</button>
              </div>
              <div className="execution-details-content">
                <div className="details-grid">
                  <div className="detail-item">
                    <label>Schedule:</label>
                    <span>{selectedExecution.scheduleName} (ID: {selectedExecution.scheduleId})</span>
                  </div>
                  <div className="detail-item">
                    <label>Start URL:</label>
                    <span>{selectedExecution.startUrl}</span>
                  </div>
                  
                  <div className="detail-item">
                    <label>Started:</label>
                    <span>{formatDate(selectedExecution.startedAt)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Completed:</label>
                    <span>{selectedExecution.completedAt ? formatDate(selectedExecution.completedAt) : 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Duration:</label>
                    <span>{formatDuration(selectedExecution.duration)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Status:</label>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(selectedExecution.status) }}
                    >
                      {selectedExecution.status}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Pages Crawled:</label>
                    <span>{selectedExecution.pagesCrawled.toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <label>Resources Found:</label>
                    <span>{selectedExecution.resourcesFound.toLocaleString()}</span>
                  </div>
                  {selectedExecution.errorMessage && (
                    <div className="detail-item full-width">
                      <label>Error Message:</label>
                      <div className="error-message-text">{selectedExecution.errorMessage}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
        )}
    </div>
  );
};

export default CronHistory;
