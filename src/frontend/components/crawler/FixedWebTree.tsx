import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import D3TidyTree, { TreeNode as TidyTreeNode } from './D3TidyTree';

type D3TreeNode = {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: D3TreeNode[];
};

type Session = { id: number; startedAt: string; completedAt?: string; totalPages: number; startUrl?: string };

interface WebTreeProps {
  onClose: () => void;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.host = u.host.toLowerCase();
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isLikelyPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
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
    const pageExts = new Set(['html','htm','php','asp','aspx','jsp','cfm','xhtml']);
    if (pageExts.has(ext)) return true;
    return true;
  } catch {
    return true;
  }
}

export default function WebTree({ onClose }: WebTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [rootUrl, setRootUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<D3TreeNode | null>(null);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('horizontal');
  const [siblingSeparation, setSiblingSeparation] = useState<number>(0.8);
  const [nonSiblingSeparation, setNonSiblingSeparation] = useState<number>(1.0);
  const [labelMaxChars, setLabelMaxChars] = useState<number>(40);
  const [primaryHost, setPrimaryHost] = useState<string | null>(null);
  const [totalUrlsUsed, setTotalUrlsUsed] = useState<number>(0);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [recenterKey, setRecenterKey] = useState<number>(0);
  
  // SEO keywords toggle and data
  const [seoEnabled, setSeoEnabled] = useState<boolean>(true);
  const [seoLoading, setSeoLoading] = useState<boolean>(false);
  const [seoBatchLoading, setSeoBatchLoading] = useState<boolean>(false);
  const [seoProgress, setSeoProgress] = useState<{ current: number; total: number; estimatedTimeRemaining?: number } | null>(null);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [seoResult, setSeoResult] = useState<null | {
    parent: { text: string; score: number; intent?: string } | null;
    keywords: Array<{ text: string; score: number; intent?: string }>;
    language?: string;
  }>(null);
  // Per-URL SEO summary to attach on tree nodes (database-backed cache)
  const [seoByUrl, setSeoByUrl] = useState<Map<string, { 
    parentText?: string; 
    topKeywords?: string[];
  }>>(new Map());

  // Compute full URL from breadcrumb (first element is root URL, subsequent are path segments)
  const computeSelectedUrl = useCallback((): string | null => {
    if (!breadcrumb || breadcrumb.length === 0) return null;
    const first = breadcrumb[0];
    if (!first) return null;
    try {
      const base = new URL(first);
      if (breadcrumb.length === 1) return normalizeUrl(base.toString());
      const suffix = breadcrumb.slice(1).join('/');
      const joined = suffix ? `${base.origin}${base.pathname.replace(/\/$/, '')}/${suffix}` : base.toString();
      return normalizeUrl(joined);
    } catch {
      return null;
    }
  }, [breadcrumb]);

  // Removed: No API calls on node click - SEO keywords are only shown from cache via batch loading

  // Load sessions on mount
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

  // Collect all URLs in the current tree
  function collectAllUrls(node: D3TreeNode | null): string[] {
    if (!node) return [];
    const acc: string[] = [];
    const stack: D3TreeNode[] = [node];
    while (stack.length) {
      const n = stack.pop()!;
      const full = (n.attributes?.full as string) || n.name;
      acc.push(normalizeUrl(full));
      if (n.children) for (const c of n.children) stack.push(c);
    }
    return Array.from(new Set(acc));
  }


  // Optimized batch SEO extraction with single API call
  useEffect(() => {
    const run = async () => {
      if (!seoEnabled || !treeData) return;
      setSeoBatchLoading(true);
      
      const urls = collectAllUrls(treeData);
      // No need to filter - the API handles caching automatically
      const urlsToProcess = urls;
      
      if (urlsToProcess.length === 0) {
        setSeoBatchLoading(false);
        setSeoProgress(null);
        return;
      }

      setSeoProgress({ current: 0, total: urlsToProcess.length });

      // Use optimized batched individual calls (much better than 50+ individual requests)
      await optimizedBatchedExtraction(urlsToProcess);
      
      setSeoBatchLoading(false);
      setSeoProgress(null);
    };

    // Optimized concurrent extraction with controlled concurrency
    const optimizedBatchedExtraction = async (urls: string[]) => {
      // Adjust concurrency based on number of URLs
      let concurrency = 3; // Default for small datasets
      if (urls.length > 1000) concurrency = 5; // More concurrent for large datasets
      if (urls.length > 5000) concurrency = 8; // Even more for very large datasets
      
      const delayBetweenBatches = 50; // 50ms delay between requests
      let processedCount = 0;
      const startedAt = Date.now();
      
      // Create a semaphore to control concurrency
      const semaphore = new Array(concurrency).fill(null);
      let currentIndex = 0;
      
      const processUrl = async (url: string, index: number): Promise<void> => {
        try {
          const res = await fetch('/api/seo/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          
          // Skip 404 silently (no cached data available for this URL)
          if (res.status === 404) {
            return;
          }
          
          const data = await res.json().catch(() => ({} as any));
          if (res.ok && data) {
            // Update state immediately for each successful extraction
            setSeoByUrl(prev => {
              const next = new Map(prev);
              next.set(normalizeUrl(url), {
                parentText: data.parent?.text,
                topKeywords: Array.isArray(data.keywords) 
                  ? data.keywords.slice(0, 10).map((k: any) => k.text) 
                  : []
              });
              return next;
            });
          }
        } catch {
          // ignore individual failures
        }
        
        // Update progress with estimated time remaining
        processedCount++;
        const elapsedMs = Date.now() - startedAt;
        const avgPerItemMs = processedCount > 0 ? elapsedMs / processedCount : delayBetweenBatches;
        const remaining = urls.length - processedCount;
        const estimatedTimeRemaining = remaining > 0 ? Math.ceil((remaining * avgPerItemMs) / 1000) : 0;
        setSeoProgress({ 
          current: processedCount, 
          total: urls.length,
          estimatedTimeRemaining 
        });
      };
      
      // Process URLs with controlled concurrency
      const workers = semaphore.map(async (_, workerIndex) => {
        while (currentIndex < urls.length) {
          const urlIndex = currentIndex++;
          if (urlIndex >= urls.length) break;
          
          await processUrl(urls[urlIndex], urlIndex);
          
          // Small delay between requests to be server-friendly
          if (currentIndex < urls.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      });
      
      // Wait for all workers to complete
      await Promise.all(workers);
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seoEnabled, treeData]);

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

  const buildTree = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError(null);
    try {
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

      // Attach full URL on root for downstream lookups
      rootNode.attributes = { ...(rootNode.attributes || {}), full: normalizedRoot };
      setTreeData(rootNode);
      autoAdjustLayout(rootNode);
      setTotalUrlsUsed(usedCount);
      // If SEO is enabled, prime selection to root URL to trigger extraction
      try { setBreadcrumb([normalizedRoot]); } catch {}
      setLoading(false);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build tree');
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, sessions]);

  const handleBuild = useCallback(() => {
    buildTree();
  }, [buildTree]);

  const containerSize = useMemo(() => {
    const width = containerRef.current?.clientWidth || 1200;
    const height = containerRef.current?.clientHeight || 700;
    return { width, height };
  }, [containerRef.current]);

  // Force tree re-render when SEO data changes or when SEO is toggled
  const [seoUpdateKey, setSeoUpdateKey] = useState(0);
  useEffect(() => {
    setSeoUpdateKey(prev => prev + 1);
  }, [seoByUrl, seoEnabled]);

  function convertToTidy(root: D3TreeNode | null): TidyTreeNode | null {
    if (!root) return null;
    const mapNode = (n: D3TreeNode): TidyTreeNode => {
      const full = (n.attributes?.full as string) || n.name;
      const seo = seoByUrl.get(normalizeUrl(full));
      const label = (n.attributes?.full as string) || n.name; // show full URL when available
      const baseChildren: TidyTreeNode[] = n.children && n.children.length ? n.children.map(mapNode) : [];

      // Build a separate main keyword node as direct child of the URL node
      let childrenWithSeo: TidyTreeNode[] = [...baseChildren];
      // Only attach SEO keywords if seoEnabled is true
      if (seoEnabled && seo && seo.parentText) {
        // Attach SEO nodes without visual prefixes; mark internal types for keying
        const keywordChildren: TidyTreeNode[] = (seo.topKeywords || []).slice(0, 8).map((kw) => ({
          text: kw,
          __type: 'kw'
        } as any));
        const mainKwNode = {
          text: seo.parentText,
          children: keywordChildren.length ? keywordChildren : undefined,
          __type: 'seo'
        } as any;
        childrenWithSeo = [mainKwNode, ...childrenWithSeo];
      }

      return {
        text: label,
        children: childrenWithSeo.length ? childrenWithSeo : undefined,
      };
    };
    return mapNode(root);
  }

  function formatSeconds(totalSeconds?: number): string {
    if (totalSeconds == null || !isFinite(totalSeconds)) return '--:--';
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-white">🌳 Web Tree</h3>
            {primaryHost && (
              <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-sm">
                Root: {primaryHost}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-white">
              Session:
              <select 
                value={selectedSessionId ?? ''} 
                onChange={e => setSelectedSessionId(Number(e.target.value))}
                className="ml-2 px-3 py-1 bg-gray-700 text-white rounded border border-gray-600"
              >
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.startUrl || 'Unknown URL'} · {new Date(s.startedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            
            <div className="flex items-center gap-2">
              <button 
                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                onClick={() => { setSiblingSeparation(0.6); setNonSiblingSeparation(0.8); setLabelMaxChars(30); }}
                title="Ultra compact - Best for 1000+ nodes"
              >
                Compact
              </button>
              <button 
                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                onClick={() => { setSiblingSeparation(1.0); setNonSiblingSeparation(1.3); setLabelMaxChars(50); }}
                title="Balanced spacing - Good for 100-500 nodes"
              >
                Comfortable
              </button>
            </div>
            
            {seoEnabled && (seoLoading || seoBatchLoading) && (
              <span className="px-2 py-1 bg-yellow-900 text-yellow-300 rounded text-sm flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
                {seoBatchLoading && seoProgress ? (
                  <>
                    <span>Extracting {seoProgress.current}/{seoProgress.total}</span>
                    <span className="opacity-80">ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</span>
                  </>
                ) : (
                  <span>Extracting…</span>
                )}
              </span>
            )}
            {seoEnabled && seoError && <span className="px-2 py-1 bg-red-900 text-red-300 rounded text-sm">{seoError}</span>}
            
            <button 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={handleBuild} 
              disabled={!selectedSessionId || loading}
            >
              {loading ? 'Building…' : 'Build Tree'}
            </button>
            
            {error && <span className="text-red-400 text-sm">{error}</span>}
          </div>
        </div>

        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <div className="p-3 border-b border-gray-700 text-gray-300">
            <span className="font-medium">Path: </span>
            {breadcrumb.join(' › ')}
          </div>
        )}

        {/* Tree Container */}
        <div 
          ref={containerRef} 
          className="flex-1 bg-gray-900 overflow-hidden relative"
        >
          {(() => {
            const isSeoBusy = seoEnabled && (seoLoading || seoBatchLoading);
            if (!treeData) {
              return (
                <div className="flex items-center justify-center h-full text-gray-400">
                  {loading ? 'Building tree structure...' : 'Configure options and click "Build Tree".'}
                </div>
              );
            }
            if (isSeoBusy) {
              // Hide SVG entirely during SEO extraction
              return null;
            }
            return (
              <D3TidyTree 
                data={convertToTidy(treeData)!} 
                height={containerSize.height} 
                orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
                dx={siblingSeparation * 24}
                dy={nonSiblingSeparation * 160}
                onSelectPath={setBreadcrumb}
                recenterKey={recenterKey + seoUpdateKey}
              />
            );
          })()}
          {!treeData && (
            <div className="flex items-center justify-center h-full text-gray-400">
              {loading ? 'Building tree structure...' : 'Configure options and click "Build Tree".'}
            </div>
          )}

          {(seoEnabled && (seoLoading || seoBatchLoading)) && (
            <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex items-center gap-3 text-yellow-200">
                <span className="inline-block w-6 h-6 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
                {seoBatchLoading && seoProgress ? (
                  <div className="text-sm">
                    <div className="font-semibold">Extracting keywords…</div>
                    <div className="opacity-90">{seoProgress.current}/{seoProgress.total} • ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold">Extracting keywords…</div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
