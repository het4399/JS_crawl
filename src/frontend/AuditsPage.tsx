import React, { useEffect, useMemo, useState } from 'react';

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
  psiReportUrl?: string;
};

function formatMs(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value)} ms`;
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

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (device !== 'all') params.set('device', device);
    params.set('limit', '100');
    return `/api/audits?${params.toString()}`;
  }, [device]);

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
    <div className="panel">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>📈 Audits</h3>
        <select value={device} onChange={(e) => setDevice(e.target.value as any)} className="select">
          <option value="mobile">Mobile</option>
          <option value="desktop">Desktop</option>
          <option value="all">All</option>
        </select>
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
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 16 }}>{loading ? 'Loading…' : 'No audits yet'}</td></tr>
            ) : items.map((it) => {
              const status = statusFromVitals(it.LCP_ms, it.TBT_ms, it.CLS);
              return (
                <tr key={it.id}>
                  <td>{new Date(it.runAt).toLocaleString()}</td>
                  <td>{it.device}</td>
                  <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a href={it.url} target="_blank" rel="noreferrer noopener">{it.url}</a>
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


