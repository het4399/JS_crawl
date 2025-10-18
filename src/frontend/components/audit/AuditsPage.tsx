import React, { useEffect, useMemo, useState } from 'react';
import './AuditsPage.dark.css';

type AuditItem = {
  id: string;
  url: string;
  device: 'mobile' | 'desktop';
  runAt: string;
  LCP_ms?: number;
  TBT_ms?: number;
  CLS?: number;
  FCP_ms?: number;
  TTFB_ms?: number;
  performanceScore?: number;
  psiReportUrl?: string;
};

function formatMs(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value)} ms`;
}

function formatScore(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value)}/100`;
}

function statusFromVitals(lcp?: number, tbt?: number, cls?: number): 'Good' | 'NI' | 'Poor' | '-' {
  if (lcp == null && tbt == null && cls == null) return '-';
  const goodLcp = lcp != null && lcp <= 2500;
  // TBT guidance (lab proxy for interactivity): Good <= 200ms, Poor > 600ms
  const goodTbt = tbt != null && tbt <= 200;
  const goodCls = cls != null && cls <= 0.1;
  const poorLcp = lcp != null && lcp > 4000;
  const poorTbt = tbt != null && tbt > 600;
  const poorCls = cls != null && cls > 0.25;
  if (poorLcp || poorTbt || poorCls) return 'Poor';
  if (goodLcp && goodTbt && goodCls) return 'Good';
  return 'NI';
}

export default function AuditsPage() {
  const [device, setDevice] = useState<'all' | 'mobile' | 'desktop'>('mobile');
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [sessions, setSessions] = useState<Array<{ id: number; startUrl: string; startedAt: string; completedAt?: string; totalPages: number }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | 'all'>('all');

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

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

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (device !== 'all') params.set('device', device);
    if (selectedSessionId !== 'all') params.set('sessionId', String(selectedSessionId));
    params.set('limit', '100');
    return `/api/audits?${params.toString()}`;
  }, [device, selectedSessionId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed ${res.status}`);
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  return (
    <div className="panel audits-dark">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>📈 Audits</h3>
        <select 
          value={selectedSessionId} 
          onChange={(e) => setSelectedSessionId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="select"
        >
          <option value="all">All Sessions</option>
          {sessions.map(session => (
            <option key={session.id} value={session.id}>
              {session.startUrl} - {new Date(session.startedAt).toLocaleDateString()} ({session.totalPages} pages)
            </option>
          ))}
        </select>
        <select value={device} onChange={(e) => setDevice(e.target.value as any)} className="select">
          <option value="mobile">Mobile</option>
          <option value="desktop">Desktop</option>
          <option value="all">All Devices</option>
        </select>
        <input
          className="audits-filter"
          type="text"
          placeholder="Filter URLs (e.g., example.com)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn" onClick={load} disabled={loading}>{loading ? '⏳ Refreshing' : '🔄 Refresh'}</button>
        {error && <span className="chip warn">{error}</span>}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run Time</th>
              <th>Device</th>
              <th>URL</th>
              <th>Score</th>
              <th>LCP</th>
              <th>TBT</th>
              <th>CLS</th>
              <th>FCP</th>
              <th>TTFB</th>
              <th>Status</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 16 }}>{loading ? 'Loading…' : 'No audits yet'}</td></tr>
            ) : items
              .filter((it) => {
                if (!filter.trim()) return true;
                try {
                  const u = new URL(it.url);
                  return u.hostname.includes(filter.trim()) || it.url.includes(filter.trim());
                } catch {
                  return it.url.includes(filter.trim());
                }
              })
              .map((it) => {
              const status = statusFromVitals(it.LCP_ms, it.TBT_ms, it.CLS);
              return (
                <tr key={it.id}>
                  <td>{new Date(it.runAt).toLocaleString()}</td>
                  <td>{it.device}</td>
                  <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a href={it.url} target="_blank" rel="noreferrer noopener">{it.url}</a>
                  </td>
                  <td>
                    {it.performanceScore ? (
                      <span className="performance-score-badge">{formatScore(it.performanceScore)}</span>
                    ) : '-'}
                  </td>
                  <td>{formatMs(it.LCP_ms)}</td>
                  <td>{formatMs(it.TBT_ms)}</td>
                  <td>{it.CLS == null ? '-' : it.CLS.toFixed(3)}</td>
                  <td>{formatMs(it.FCP_ms)}</td>
                  <td>{formatMs(it.TTFB_ms)}</td>
                  <td>
                    <span className={`chip ${status === 'Good' ? 'success' : status === 'Poor' ? 'error' : status === 'NI' ? 'warn' : ''}`}>{status}</span>
                  </td>
                  <td>
                    {it.psiReportUrl ? <a href={it.psiReportUrl} target="_blank" rel="noreferrer noopener">Open</a> : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


