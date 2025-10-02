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
  onClose: () => void;
}

export default function LinkExplorer({ onClose }: LinkExplorerProps) {
  
  const [sessions, setSessions] = useState<Array<{ id: number; startedAt: string; completedAt?: string; totalPages: number }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [linkType, setLinkType] = useState<'out' | 'in'>('out');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [internalFilter, setInternalFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadData();
    }
  }, [selectedSessionId]);

  const loadSessions = async () => {
    try {
      console.log('Loading sessions...');
      const response = await fetch('/api/data/sessions?limit=200');
      console.log('Sessions response status:', response.status);
      if (!response.ok) throw new Error('Failed to load sessions');
      const result = await response.json();
      console.log('Sessions data received:', result);
      setSessions(result.sessions || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  };

  const loadData = async () => {
    if (!selectedSessionId) return;
    
    try {
      setLoading(true);
      setError(null);
      console.log('Loading data for session:', selectedSessionId);

      // Load link statistics
      const statsResponse = await fetch(`/api/links/stats/${selectedSessionId}`);
      console.log('Stats response status:', statsResponse.status);
      if (!statsResponse.ok) throw new Error('Failed to load link statistics');
      const statsData = await statsResponse.json();
      console.log('Stats data received:', statsData);
      
      setStats(statsData.stats);
      setPageStats(statsData.pageStats);

      // Load links for the first page if available
      if (statsData.pageStats.length > 0) {
        setSelectedPageId(statsData.pageStats[0].pageId);
        await loadLinksForPage(statsData.pageStats[0].pageId);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const loadLinksForPage = async (pageId: number, type?: 'out' | 'in') => {
    if (!selectedSessionId) return;
    
    const linkTypeToUse = type || linkType;
    console.log('Loading links for page:', pageId, 'with type:', linkTypeToUse);
    
    try {
      const response = await fetch(`/api/links?sessionId=${selectedSessionId}&pageId=${pageId}&type=${linkTypeToUse}&limit=100`);
      if (!response.ok) throw new Error('Failed to load links');
      const data = await response.json();
      console.log('Links loaded:', data.links.length, 'links');
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
    console.log('Changing link type to:', type);
    setLinkType(type);
    if (selectedPageId) {
      loadLinksForPage(selectedPageId, type);
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
    if (!selectedSessionId) return;
    
    try {
      const url = selectedPageId 
        ? `/api/links/export.csv?sessionId=${selectedSessionId}&pageId=${selectedPageId}&type=${linkType}`
        : `/api/links/export.csv?sessionId=${selectedSessionId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `links-${selectedSessionId}${selectedPageId ? `-page-${selectedPageId}` : ''}.csv`;
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
      
      {/* Session Selection */}
      <div className="session-selection">
        <label htmlFor="session-select">Select Crawl Session:</label>
        <select 
          id="session-select"
          value={selectedSessionId || ''} 
          onChange={(e) => setSelectedSessionId(Number(e.target.value) || null)}
          className="session-select"
        >
          <option value="">Choose a session...</option>
          {sessions.map(session => (
            <option key={session.id} value={session.id}>
              Session {session.id} - {new Date(session.startedAt).toLocaleString()} ({session.totalPages} pages)
            </option>
          ))}
        </select>
      </div>
      
      {!selectedSessionId && (
        <div className="no-session">
          <p>Please select a crawl session to view link data.</p>
        </div>
      )}
      
      {selectedSessionId && (
        <>
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
                      <th>{linkType === 'in' ? 'Source URL' : 'Target URL'}</th>
                      <th>Position</th>
                      <th>Type</th>
                      <th>Rel</th>
                      <th>Nofollow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLinks.map(link => {
                      const urlToShow = linkType === 'in' ? link.sourceUrl : link.targetUrl;
                      return (
                        <tr key={link.id}>
                          <td className="anchor-text" title={link.anchorText}>
                            {link.anchorText || '(empty)'}
                          </td>
                          <td className="target-url" title={urlToShow}>
                            <a href={urlToShow} target="_blank" rel="noopener noreferrer">
                              {urlToShow}
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
                      );
                    })}
                  </tbody>
                </table>
                
                {filteredLinks.length === 0 && (
                  <div className="no-links">No links found matching the current filters.</div>
                )}
              </div>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}
