import React, { useState, useEffect } from 'react';
import './LinkExplorer.css';

interface LinkData {
  id: number;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  position: string;
  isInternal: boolean;
  rel: string;
  nofollow: boolean;
}

interface LinkStats {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  linksByPosition: Record<string, number>;
}

interface PageStats {
  pageId: number;
  url: string;
  title: string;
  outlinks: number;
  inlinks: number;
  externalOutlinks: number;
  internalOutlinks: number;
}

interface LinkExplorerProps {
  sessionId: number;
  onClose: () => void;
}

export default function LinkExplorer({ sessionId, onClose }: LinkExplorerProps) {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [linkType, setLinkType] = useState<'out' | 'in'>('out');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [internalFilter, setInternalFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load link statistics
      const statsResponse = await fetch(`/api/links/stats/${sessionId}`);
      if (!statsResponse.ok) throw new Error('Failed to load link statistics');
      const statsData = await statsResponse.json();
      
      setStats(statsData.stats);
      setPageStats(statsData.pageStats);

      // Load links for the first page if available
      if (statsData.pageStats.length > 0) {
        setSelectedPageId(statsData.pageStats[0].pageId);
        await loadLinksForPage(statsData.pageStats[0].pageId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadLinksForPage = async (pageId: number) => {
    try {
      const response = await fetch(`/api/links?sessionId=${sessionId}&pageId=${pageId}&type=${linkType}&limit=100`);
      if (!response.ok) throw new Error('Failed to load links');
      const data = await response.json();
      setLinks(data.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    }
  };

  const handlePageSelect = (pageId: number) => {
    setSelectedPageId(pageId);
    loadLinksForPage(pageId);
  };

  const handleTypeChange = (type: 'out' | 'in') => {
    setLinkType(type);
    if (selectedPageId) {
      loadLinksForPage(selectedPageId);
    }
  };

  const filteredLinks = links.filter(link => {
    if (positionFilter !== 'all' && link.position !== positionFilter) return false;
    if (internalFilter !== 'all') {
      const isInternal = link.isInternal;
      if (internalFilter === 'internal' && !isInternal) return false;
      if (internalFilter === 'external' && isInternal) return false;
    }
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        link.anchorText.toLowerCase().includes(searchLower) ||
        link.targetUrl.toLowerCase().includes(searchLower) ||
        link.sourceUrl.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const exportLinks = async () => {
    try {
      const url = selectedPageId 
        ? `/api/links/export.csv?sessionId=${sessionId}&pageId=${selectedPageId}&type=${linkType}`
        : `/api/links/export.csv?sessionId=${sessionId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `links-${sessionId}${selectedPageId ? `-page-${selectedPageId}` : ''}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  if (loading) {
    return (
      <div className="link-explorer">
        <div className="link-explorer-header">
          <h2>🔗 Link Explorer</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="loading">Loading link data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="link-explorer">
        <div className="link-explorer-header">
          <h2>🔗 Link Explorer</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="link-explorer">
      <div className="link-explorer-header">
        <h2>🔗 Link Explorer</h2>
        <button onClick={onClose} className="close-btn" title="Close Link Explorer">×</button>
      </div>

      {stats && (
        <div className="link-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.totalLinks}</div>
            <div className="stat-label">Total Links</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.internalLinks}</div>
            <div className="stat-label">Internal</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.externalLinks}</div>
            <div className="stat-label">External</div>
          </div>
          {Object.entries(stats.linksByPosition).map(([position, count]) => (
            <div key={position} className="stat-card">
              <div className="stat-value">{count}</div>
              <div className="stat-label">{position}</div>
            </div>
          ))}
        </div>
      )}

      <div className="link-explorer-content">
        <div className="page-selector">
          <h3>Select Page</h3>
          <div className="page-list">
            {pageStats.map(page => (
              <div 
                key={page.pageId} 
                className={`page-item ${selectedPageId === page.pageId ? 'selected' : ''}`}
                onClick={() => handlePageSelect(page.pageId)}
              >
                <div className="page-title">{page.title}</div>
                <div className="page-url">{page.url}</div>
                <div className="page-stats">
                  {page.outlinks} out • {page.inlinks} in
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedPageId && (
          <div className="links-section">
            <div className="links-controls">
              <div className="control-group">
                <label>Link Type:</label>
                <select value={linkType} onChange={(e) => handleTypeChange(e.target.value as 'out' | 'in')}>
                  <option value="out">Outlinks</option>
                  <option value="in">Inlinks</option>
                </select>
              </div>
              
              <div className="control-group">
                <label>Position:</label>
                <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="Header">Header</option>
                  <option value="Footer">Footer</option>
                  <option value="Navigation">Navigation</option>
                  <option value="Main">Main</option>
                  <option value="Sidebar">Sidebar</option>
                </select>
              </div>
              
              <div className="control-group">
                <label>Type:</label>
                <select value={internalFilter} onChange={(e) => setInternalFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              
              <div className="control-group">
                <input
                  type="text"
                  placeholder="Search links..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <button onClick={exportLinks} className="export-btn">
                📥 Export CSV
              </button>
            </div>

            <div className="links-table-container">
              <table className="links-table">
                <thead>
                  <tr>
                    <th>Anchor Text</th>
                    <th>Target URL</th>
                    <th>Position</th>
                    <th>Type</th>
                    <th>Rel</th>
                    <th>Nofollow</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinks.map(link => (
                    <tr key={link.id}>
                      <td className="anchor-text" title={link.anchorText}>
                        {link.anchorText || '(empty)'}
                      </td>
                      <td className="target-url" title={link.targetUrl}>
                        <a href={link.targetUrl} target="_blank" rel="noopener noreferrer">
                          {link.targetUrl}
                        </a>
                      </td>
                      <td className="position">{link.position}</td>
                      <td className="type">
                        <span className={`type-badge ${link.isInternal ? 'internal' : 'external'}`}>
                          {link.isInternal ? 'Internal' : 'External'}
                        </span>
                      </td>
                      <td className="rel">{link.rel || '-'}</td>
                      <td className="nofollow">
                        {link.nofollow ? '✓' : '✗'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredLinks.length === 0 && (
                <div className="no-links">No links found matching the current filters.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
