import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import D3TidyTree, { TreeNode as TidyTreeNode } from './D3TidyTree';

type D3TreeNode = {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: D3TreeNode[];
};

  type Session = { id: number; startedAt: string; completedAt?: string; totalPages: number; startUrl?: string };

type LinkItem = {
  id: number;
  sourcePageId: number;
  targetPageId: number;
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  position?: string;
  xpath?: string;
  rel?: string;
  nofollow?: boolean;
};

type LinksResponse = {
  links: LinkItem[];
  count: number;
};

type PageStat = { pageId: number; url: string; outCount: number; inCount: number };

type StatsResponse = {
  sessionId: number;
  stats: any;
  pageStats: PageStat[];
  relationships?: Array<{ sourceUrl: string; targetUrl: string }>;
};

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Normalize: lower-case host, strip hash, keep pathname + search
    u.hash = '';
    u.host = u.host.toLowerCase();
    // Remove trailing slash except for root
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isInternal(target: string, root: string, includeSubdomains: boolean): boolean {
  try {
    const t = new URL(target);
    const r = new URL(root);
    if (t.protocol !== r.protocol) return false;
    if (t.hostname === r.hostname) return true;
    if (!includeSubdomains) return false;
    return t.hostname.endsWith('.' + r.hostname);
  } catch {
    return false;
  }
}

function isLikelyPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Treat no extension as a page; exclude common static/resource extensions
    const pathname = u.pathname.toLowerCase();
    const lastSeg = pathname.split('/').pop() || '';
    const hasDot = lastSeg.includes('.');
    if (!hasDot) return true;
    const ext = lastSeg.split('.').pop() || '';
    const nonPageExts = new Set([
      'png','jpg','jpeg','gif','svg','webp','ico','bmp','tif','tiff',
      'css','js','mjs','cjs','map',
      'woff','woff2','ttf','otf','eot',
      'pdf','zip','rar','7z','gz','tar','bz2','xz',
      'mp3','mp4','webm','ogg','wav','mov','avi','mkv',
      'json','rss','atom','yaml','yml',
      'xml'
    ]);
    if (nonPageExts.has(ext)) return false;
    // Allow common dynamic/page extensions
    const pageExts = new Set(['html','htm','php','asp','aspx','jsp','cfm','xhtml']);
    if (pageExts.has(ext)) return true;
    // Fallback: unknown extensions considered pages
    return true;
  } catch {
    return true;
  }
}

interface WebTreeProps {
  onClose: () => void;
}

export default function WebTree({ onClose }: WebTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [rootUrl, setRootUrl] = useState<string>('');
  const [internalOnly] = useState<boolean>(true);
  // Subdomains are always included for the chosen root host
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<D3TreeNode | null>(null);
  const [pageIndex, setPageIndex] = useState<Map<string, number>>(new Map()); // url -> pageId
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set()); // urls whose children were lazy-loaded
  // Always build from session URL list
  const [useUrlListMode] = useState<boolean>(true);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [siblingSeparation, setSiblingSeparation] = useState<number>(1.2);
  const [nonSiblingSeparation, setNonSiblingSeparation] = useState<number>(1.6);
  const [labelMaxChars, setLabelMaxChars] = useState<number>(60);
  const [primaryHost, setPrimaryHost] = useState<string | null>(null);
  const [totalUrlsUsed, setTotalUrlsUsed] = useState<number>(0);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [recenterKey, setRecenterKey] = useState<number>(0);

  function computeTreeStats(root: D3TreeNode | null): { maxDepth: number; levelCounts: number[] } {
    if (!root) return { maxDepth: 0, levelCounts: [] };
    const levelCounts: number[] = [];
    const stack: Array<{ node: D3TreeNode; level: number }> = [{ node: root, level: 0 }];
    let maxDepth = 0;
    while (stack.length) {
      const { node, level } = stack.pop()!;
      maxDepth = Math.max(maxDepth, level);
      levelCounts[level] = (levelCounts[level] || 0) + 1;
      if (node.children) for (const c of node.children) stack.push({ node: c, level: level + 1 });
    }
    return { maxDepth, levelCounts };
  }

  function autoAdjustLayout(root: D3TreeNode | null) {
    const { maxDepth, levelCounts } = computeTreeStats(root);
    const breadth = Math.max(...(levelCounts.length ? levelCounts : [1]));
    const sib = Math.min(3, Math.max(0.9, 1 + (breadth / 300)));
    const nonSib = Math.min(4, Math.max(1.0, 1.2 + (maxDepth / 8)));
    setSiblingSeparation(Number(sib.toFixed(2)));
    setNonSiblingSeparation(Number(nonSib.toFixed(2)));
    const maxChars = breadth > 200 ? 30 : breadth > 100 ? 40 : 60;
    setLabelMaxChars(maxChars);
  }

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await fetch('/api/data/sessions?limit=200');
        if (!response.ok) throw new Error('Failed to load sessions');
        const result = await response.json();
        const list: Session[] = result.sessions || [];
        setSessions(list);
        if (list.length > 0 && !selectedSessionId) {
          setSelectedSessionId(list[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      }
    };
    loadSessions();
  }, []);

  // Build a quick index of pageId by URL for the selected session
  useEffect(() => {
    const loadStats = async () => {
      if (!selectedSessionId) return;
      try {
        const res = await fetch(`/api/links/stats/${selectedSessionId}`);
        if (!res.ok) throw new Error('Failed to load link stats');
        const data: StatsResponse = await res.json();
        const idx = new Map<string, number>();
        for (const p of data.pageStats || []) {
          idx.set(normalizeUrl(p.url), p.pageId);
        }
        setPageIndex(idx);
        // Root URL will be computed from the session URL list during build
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to build page index');
      }
    };
    loadStats();
  }, [selectedSessionId]);

  const fetchOutlinks = useCallback(async (sessionId: number, pageId: number, limit: number): Promise<LinkItem[]> => {
    const response = await fetch(`/api/links?sessionId=${sessionId}&pageId=${pageId}&type=out&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to load links');
    const data: LinksResponse = await response.json();
    return data.links || [];
  }, []);

  const buildTree = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError(null);
    try {
      if (useUrlListMode) {
        // Build directly from all URLs for the session
        let normalizedRoot = '' as string;
        let root: URL | null = null;
        const urls: string[] = [];
        let offset = 0;
        const limit = 1000;
        // Fetch in batches
        for (let i = 0; i < 50; i++) { // hard cap 50k
          const params = new URLSearchParams();
          params.set('limit', String(limit));
          params.set('offset', String(offset));
          params.set('sessionId', String(selectedSessionId));
          const res = await fetch(`/api/data/pages?${params.toString()}`);
          if (!res.ok) throw new Error('Failed to load URL list');
          const result = await res.json();
          const items = (result.data || []) as Array<{ url: string }>;
          if (items.length === 0) break;
          for (const it of items) {
            if (!it.url) continue;
            const nu = normalizeUrl(it.url);
            // Filter: only likely page URLs
            if (!isLikelyPageUrl(nu)) continue;
            urls.push(nu);
          }
          offset += items.length;
          if (result?.paging?.total && offset >= result.paging.total) break;
        }

        // Determine start root from the selected session's startUrl
        if (urls.length === 0) throw new Error('No URLs found for this session');
        const sess = sessions.find(s => s.id === selectedSessionId);
        const sessionStart = sess?.startUrl || urls[0];
        normalizedRoot = normalizeUrl(sessionStart);
        root = new URL(normalizedRoot);
        setRootUrl(normalizedRoot);
        setPrimaryHost(root.host);

        // Build path-based tree from the start root
        const rootNode: D3TreeNode = { name: normalizedRoot, attributes: { level: 0, full: normalizedRoot }, children: [] };
        // Map path segments under the same hostname as root
        const byPath: Record<string, D3TreeNode> = {};
        const ensureChild = (parent: D3TreeNode, name: string, level: number, full: string): D3TreeNode => {
          if (!parent.children) parent.children = [];
          let child = parent.children.find(c => c.name === name);
          if (!child) {
            child = { name, attributes: { level, full }, children: [] };
            parent.children.push(child);
          }
          return child;
        };

        let usedCount = 0;
        for (const u of urls) {
          let parsed: URL;
          try { parsed = new URL(u); } catch { continue; }
          if (!root) continue;
          // Always include subdomains of the chosen root host
          if (parsed.host !== root.host && !parsed.hostname.endsWith('.' + root.hostname)) continue;
          const segments = parsed.pathname.split('/').filter(Boolean);
          const maxSegments = segments.length;
          let current = rootNode;
          let currentFull = `${root.protocol}//${root.host}`;
          for (let i = 0; i < maxSegments; i++) {
            const seg = segments[i];
            currentFull += `/${seg}`;
            current = ensureChild(current, seg, ((current.attributes?.level as number) ?? 0) + 1, currentFull);
          }
          usedCount++;
        }

        setTreeData(rootNode);
        autoAdjustLayout(rootNode);
        setLoadedUrls(new Set([normalizedRoot]));
        setTotalUrlsUsed(usedCount);
        setLoading(false);
        return;
      }
      // BFS mode removed; always using session URL list builder
      throw new Error('Only session URL list mode is supported');
      // Unreachable
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build tree');
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, rootUrl, pageIndex, fetchOutlinks]);

  function cloneNode(node: D3TreeNode): D3TreeNode {
    return {
      name: node.name,
      attributes: node.attributes ? { ...node.attributes } : undefined,
      children: node.children ? node.children.map(cloneNode) : undefined,
    };
  }

  function findAndUpdate(root: D3TreeNode, targetName: string, updater: (n: D3TreeNode) => void): D3TreeNode {
    const copy = cloneNode(root);
    const stack: D3TreeNode[] = [copy];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.name === targetName) {
        updater(n);
        break;
      }
      if (n.children) stack.push(...n.children);
    }
    return copy;
  }

  const loadChildrenForUrl = useCallback(async (url: string) => {
    if (!treeData || !selectedSessionId) return;
    const normalized = normalizeUrl(url);
    if (loadedUrls.has(normalized)) return;

    const pageId = pageIndex.get(normalized);
    if (!pageId) return;

    try {
      const links = await fetchOutlinks(selectedSessionId, pageId, 500);
      const childrenUrls: string[] = [];
      for (const link of links) {
        const t = normalizeUrl(link.targetUrl);
        if (internalOnly && !isInternal(t, normalizeUrl(rootUrl), true)) continue;
        childrenUrls.push(t);
      }

      const updated = findAndUpdate(treeData, normalized, (node) => {
        const currentLevel = (node.attributes?.level as number) ?? 0;
        const existing = new Set((node.children || []).map(c => c.name));
        const newChildren: D3TreeNode[] = [];
        for (const cu of childrenUrls) {
          if (existing.has(cu)) continue;
          newChildren.push({ name: cu, attributes: { level: currentLevel + 1 }, children: [] });
        }
        node.children = [...(node.children || []), ...newChildren];
      });

      setTreeData(updated);
      setLoadedUrls(prev => new Set(prev).add(normalized));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load children');
    }
  }, [treeData, selectedSessionId, pageIndex, loadedUrls, fetchOutlinks, rootUrl]);

  const handleBuild = useCallback(() => {
    buildTree();
  }, [buildTree]);

  const containerSize = useMemo(() => {
    const width = containerRef.current?.clientWidth || 1200;
    const height = containerRef.current?.clientHeight || 700;
    return { width, height };
  }, [containerRef.current]);

  function convertToTidy(root: D3TreeNode | null): TidyTreeNode | null {
    if (!root) return null;
    const mapNode = (n: D3TreeNode): TidyTreeNode => ({
      text: n.name,
      children: n.children && n.children.length ? n.children.map(mapNode) : undefined,
    });
    return mapNode(root);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '96vw', height: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', background: 'linear-gradient(180deg,#ffffff,#fafafa)' }}>
        <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: 'inherit', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0 }}>🌳 Web Tree</h3>
            {primaryHost && (
              <span className="chip" style={{ background: '#eff6ff', color: '#1d4ed8' }}>Root: {primaryHost}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <label>
            Session:
            <select value={selectedSessionId ?? ''} onChange={e => setSelectedSessionId(Number(e.target.value))}>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  #{s.id} · {s.startUrl || 'Unknown URL'} · {new Date(s.startedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          {/* Root URL input removed - computed automatically from session */}
          {/* Depth and node cap removed to allow full tree build */}
          {/* Internal-only is always enforced; subdomains are treated as internal */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Layout:</span>
            <button className="btn" onClick={() => setOrientation(prev => prev === 'vertical' ? 'horizontal' : 'vertical')}>
              {orientation === 'vertical' ? 'Vertical' : 'Horizontal'}
            </button>
            <button className="btn" onClick={() => { setSiblingSeparation(0.9); setNonSiblingSeparation(1.0); setLabelMaxChars(40); }}>Compact</button>
            <button className="btn" onClick={() => { setSiblingSeparation(1.4); setNonSiblingSeparation(1.6); setLabelMaxChars(60); }}>Comfortable</button>
            <button className="btn" onClick={() => { setSiblingSeparation(2.0); setNonSiblingSeparation(2.2); setLabelMaxChars(80); }}>Spacious</button>
            <button className="btn" onClick={() => { autoAdjustLayout(treeData); setRecenterKey(k => k + 1); }}>Auto-fit</button>
          </div>
          <button className="btn btn-primary" onClick={handleBuild} disabled={!selectedSessionId || loading} style={{ boxShadow: '0 2px 8px rgba(29,78,216,0.25)' }}>
            {loading ? 'Building…' : 'Build Tree'}
          </button>
          {error && <span className="chip warn">{error}</span>}
        </div>
        {breadcrumb.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', color: '#374151' }}>
            <span style={{ fontWeight: 500 }}>Path: </span>
            {breadcrumb.join(' › ')}
            <button className="btn" style={{ marginLeft: 12 }} onClick={() => setRecenterKey(k => k + 1)}>Center</button>
          </div>
        )}
        <div ref={containerRef} className="tree-container" style={{ flex: 1, borderTop: '1px solid #eee', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          {treeData ? (
            <D3TidyTree 
              data={convertToTidy(treeData)!} 
              height={containerSize.height} 
              orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
              dx={siblingSeparation * 24}
              dy={nonSiblingSeparation * 160}
              onSelectPath={setBreadcrumb}
              recenterKey={recenterKey}
            />
          ) : (
            <div style={{ padding: 16, color: '#555' }}>Configure options and click "Build Tree".</div>
          )}
        </div>
        {/* D3 renderer handles zoom via mouse; no explicit buttons needed */}
      </div>
    </div>
  );
}


