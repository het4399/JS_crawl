import React, { useState, useEffect } from 'react';
import './DataViewer.css';

interface CrawlData {
  url: string;
  title: string;
  description: string;
  contentType: string;
  lastModified: string | null;
  statusCode: number | null;
  responseTime: number | null;
  timestamp: string;
  success?: boolean;
  resourceType?: string;
  sessionId?: number;
  scheduleId?: number;
  scheduleName?: string;
  wordCount?: number;
}

interface DataViewerProps {
  onClose: () => void;
  initialSessionId?: number | null;
}

const DataViewer: React.FC<DataViewerProps> = ({ onClose, initialSessionId }) => {
  const [data, setData] = useState<CrawlData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof CrawlData>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [serverLimit] = useState(1000);
  const [sessions, setSessions] = useState<Array<{ id: number; startedAt: string; completedAt?: string; scheduleId?: number }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | ''>(initialSessionId ?? '');

  useEffect(() => {
    loadSessions();
    if (selectedSessionId !== '') {
      loadData();
    } else {
      setLoading(false);
    }
  }, []);

  // When initialSessionId changes on open, set the selected session and reload
  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
      setServerOffset(0);
      loadData();
    }
  }, [initialSessionId]);

  const loadData = async (opts?: { append?: boolean }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(serverLimit));
      params.set('offset', String(opts?.append ? serverOffset : 0));
      if (selectedSessionId !== '') params.set('sessionId', String(selectedSessionId));
      const response = await fetch(`/api/data/list?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load data');
      
      const result = await response.json();
      console.log('DataViewer received data:', result);
      setServerTotal(result?.paging?.total ?? null);
      const items = result.data || [];
      if (opts?.append) {
        setData(prev => [...prev, ...items]);
      } else {
        setData(items);
      }
      setServerOffset((opts?.append ? serverOffset : 0) + items.length);
    } catch (error) {
      console.error('Error loading data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/data/sessions?limit=200');
      if (!res.ok) throw new Error('Failed to load sessions');
      const result = await res.json();
      setSessions(result.sessions || []);
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  };

  const handleSort = (field: keyof CrawlData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedData = data
    .filter(item => 
      (item.url || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.contentType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.lastModified || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      return 0;
    });

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredAndSortedData.slice(startIndex, endIndex);

  const exportData = async (format: string) => {
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (selectedSessionId !== '') {
        params.set('sessionId', String(selectedSessionId));
      }
      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `crawl-data${selectedSessionId !== '' ? `-session-${selectedSessionId}` : ''}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatResponseTime = (time: number | null) => {
    if (time === null || time === undefined) return 'Not available';
    return `${time}ms`;
  };

  const formatLastModified = (lastModified: string | null) => {
    if (!lastModified) return 'Not available';
    try {
      return new Date(lastModified).toLocaleString();
    } catch {
      return lastModified; // Return raw value if parsing fails
    }
  };

  const getStatusBadge = (statusCode: number | null) => {
    if (statusCode === null || statusCode === undefined) {
      return <span className="status-badge unknown">N/A</span>;
    }
    if (statusCode >= 200 && statusCode < 300) {
      return <span className="status-badge success">{statusCode}</span>;
    } else if (statusCode >= 300 && statusCode < 400) {
      return <span className="status-badge redirect">{statusCode}</span>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <span className="status-badge client-error">{statusCode}</span>;
    } else if (statusCode >= 500) {
      return <span className="status-badge server-error">{statusCode}</span>;
    }
    return <span className="status-badge unknown">{statusCode}</span>;
  };

  if (loading) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer">
          <div className="loading">Loading data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="data-viewer-overlay">
      <div className="data-viewer">
        <div className="data-viewer-header">
          <h2>📊 Crawl Data Viewer</h2>
          <button onClick={onClose} className="close-btn" title="Close Data Viewer">
            ×
          </button>
        </div>

        <div className="data-viewer-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search URLs, titles, descriptions, content types, last modified..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="session-filter">
            <select
              value={selectedSessionId}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value);
                setSelectedSessionId(v);
                if (v !== '') {
                  setServerOffset(0);
                  loadData();
                }
              }}
              className="search-input"
              title="Filter by session"
            >
              <option value="" disabled>Select a session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  Session #{s.id} {s.startedAt ? `(${new Date(s.startedAt).toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </div>
          
          <div className="export-controls">
            <button onClick={() => exportData('json')} className="export-btn">
              📥 JSON
            </button>
            <button onClick={() => exportData('csv')} className="export-btn">
              📊 CSV
            </button>
            <button onClick={() => exportData('txt')} className="export-btn">
              📄 TXT
            </button>
            <button onClick={() => exportData('xml')} className="export-btn">
              📋 XML
            </button>
          </div>
        </div>

        <div className="data-stats">
          <span>Total (loaded): {data.length} items</span>
          {serverTotal !== null && (
            <span>Server total: {serverTotal}</span>
          )}
          <span>Filtered: {filteredAndSortedData.length} items</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('url')} className="sortable">
                  URL {sortField === 'url' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {/* Schedule and Session columns removed per request */}
                <th onClick={() => handleSort('title')} className="sortable">
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>
                  Resource Type
                </th>
                <th onClick={() => handleSort('description')} className="sortable">
                  Meta Description {sortField === 'description' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('contentType')} className="sortable">
                  Content Type {sortField === 'contentType' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('lastModified')} className="sortable">
                  Last Modified {sortField === 'lastModified' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('statusCode')} className="sortable">
                  Status {sortField === 'statusCode' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('responseTime')} className="sortable">
                  Response Time {sortField === 'responseTime' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('wordCount' as keyof CrawlData)} className="sortable">
                  Word Count {sortField === 'wordCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('timestamp')} className="sortable">
                  Timestamp {sortField === 'timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((item, index) => (
                <tr key={index} className={item.success ? 'success-row' : 'error-row'}>
                  <td className="url-cell">
                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer">
                      {item.url || 'No URL'}
                    </a>
                  </td>
                  {/* Schedule and Session cells removed; filtering remains via dropdown */}
                  <td className="title-cell" title={item.title || 'No title'}>
                    {item.title || 'No title'}
                  </td>
                  <td className="resource-type-cell">
                    {item.resourceType ? item.resourceType.toUpperCase() : 'PAGE'}
                  </td>
                  <td className="description-cell" title={item.description || 'No description'}>
                    {item.description || 'No description'}
                  </td>
                  <td className="content-type-cell" title={item.contentType || 'Unknown'}>
                    {item.contentType || 'Unknown'}
                  </td>
                  <td className="last-modified-cell" title={item.lastModified || 'Not available'}>
                    {formatLastModified(item.lastModified)}
                  </td>
                  <td className="status-cell">
                    {getStatusBadge(item.statusCode || 0)}
                  </td>
                  <td className="response-time-cell">
                    {formatResponseTime(item.responseTime || 0)}
                  </td>
                  <td className="word-count-cell">
                    {item.wordCount ?? '—'}
                  </td>
                  <td className="timestamp-cell">
                    {formatTimestamp(item.timestamp || new Date().toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="page-btn"
            >
              First
            </button>
            <button 
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="page-btn"
            >
              Previous
            </button>
            
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            
            <button 
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="page-btn"
            >
              Next
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="page-btn"
            >
              Last
            </button>
          </div>
        )}

        {serverTotal !== null && data.length < serverTotal && (
          <div className="pagination">
            <button 
              onClick={() => loadData({ append: true })}
              className="page-btn"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default DataViewer;