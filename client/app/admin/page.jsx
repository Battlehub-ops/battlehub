'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer
} from 'recharts';

/**
 * Simple helper to format USD
 */
const fmt = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '$0.00');

/**
 * StatsChart - small wrapper around Recharts LineChart
 * - uses a fixed numeric height to avoid Recharts "width/height must be > 0" warnings
 * - expects data: [{ ts: '05/11/2025, 20:40:38', payouts: 8.5, revenue: 1.5 }, ...]
 */
function StatsChart({ data }) {
  return (
    <div style={{ width: '100%', minHeight: 320, height: 360, padding: 10, boxSizing: 'border-box' }}>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="ts" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="bottom" height={36} />
          <Line type="monotone" dataKey="payouts" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} name="Payouts (USD)" />
          <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} name="Revenue (USD)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('BattleHub2025Secret!');
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [unpaid, setUnpaid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState(
    typeof window !== 'undefined'
      ? window.__BATTLEHUB_API_BASE__ || 'http://localhost:4000'
      : 'http://localhost:4000'
  );

  // fetch admin data
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-admin-key': adminKey };
      const [uRes, mRes, unRes] = await Promise.all([
        fetch(`${apiBase}/admin/users`, { headers }),
        fetch(`${apiBase}/admin/matches`, { headers }),
        fetch(`${apiBase}/admin/unpaid-matches`, { headers })
      ]);

      // handle non-json responses gracefully
      const toJson = async (res) => {
        const ct = res.headers.get('content-type') || '';
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Request failed ${res.url}: ${res.status} ${txt.slice(0, 200)}`);
        }
        if (ct.includes('application/json')) return res.json();
        // try to parse, otherwise return [] or {}
        try { return JSON.parse(await res.text()); } catch { return []; }
      };

      const [usersData, matchesData, unpaidData] = await Promise.all([
        toJson(uRes),
        toJson(mRes),
        toJson(unRes)
      ]);

      setUsers(Array.isArray(usersData) ? usersData : []);
      setMatches(Array.isArray(matchesData) ? matchesData : []);
      setUnpaid(Array.isArray(unpaidData) ? unpaidData : []);
    } catch (err) {
      console.error('fetchData error', err);
      alert('Error fetching admin data: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helper to compute totals
  const totalRevenue = matches.reduce((s, m) => s + (m.platformCutUSD || 0), 0);
  const totalPayouts = matches.reduce((s, m) => s + (m.winnerPayoutUSD || 0), 0);

  // prepare chart data: sort matches by createdAt asc
  const chartData = matches
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((m) => ({
      ts: new Date(m.createdAt).toLocaleString(),
      payouts: m.winnerPayoutUSD || 0,
      revenue: m.platformCutUSD || 0
    }));

  // run matchmaking or batch payout buttons (best-effort POST; server may or may not implement)
  const postAction = async (path) => {
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }
      });
      const txt = await res.text();
      alert(`Action response: ${res.status}\n\n${txt.slice(0, 200)}`);
      await fetchData();
    } catch (err) {
      alert('Action failed: ' + err.message);
    }
  };

  // helper to find winner's name for a match
  const winnerName = (m) => {
    if (!m.winnerEntry || !Array.isArray(m.entries)) return 'N/A';
    const e = m.entries.find((en) => en._id === m.winnerEntry);
    return e && e.user && e.user.name ? e.user.name : 'N/A';
  };

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f59e0b', fontSize: 28 }}>⚡</span> BattleHub Admin
          </h1>
          <p style={{ marginTop: 6, marginBottom: 0, color: '#374151' }}>Manage matches, payouts, and platform stats.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', minWidth: 260 }} />
          <button onClick={fetchData} style={{ padding: '10px 14px', borderRadius: 8, border: '2px solid #111827', background: 'white', cursor: 'pointer' }}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </header>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 18 }}>
        <div style={{ padding: 18, borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.04)', background: '#fff' }}>
          <div style={{ color: '#6b7280' }}>Total Users</div>
          <div style={{ fontSize: 24, marginTop: 8 }}>{users.length}</div>
        </div>
        <div style={{ padding: 18, borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.04)', background: '#fff' }}>
          <div style={{ color: '#6b7280' }}>Revenue (USD)</div>
          <div style={{ fontSize: 24, marginTop: 8 }}>{fmt(totalRevenue)}</div>
        </div>
        <div style={{ padding: 18, borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.04)', background: '#fff' }}>
          <div style={{ color: '#6b7280' }}>Total Payouts (USD)</div>
          <div style={{ fontSize: 24, marginTop: 8 }}>{fmt(totalPayouts)}</div>
        </div>
      </div>

      {/* admin actions */}
      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button onClick={() => postAction('/admin/run-matchmaking')} style={{ padding: '10px 14px', borderRadius: 8 }}>Run Matchmaking</button>
        <button onClick={() => postAction('/admin/batch-payout')} style={{ padding: '10px 14px', borderRadius: 8 }}>Batch Payout</button>
      </div>

      {/* chart */}
      <section style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 12 }}>Platform Trends</h2>
        <StatsChart data={chartData} />
        <div style={{ marginTop: 10, color: '#6b7280' }}>Chart shows per-match payouts & platform revenue.</div>
      </section>

      {/* unpaid matches */}
      <section className="section" style={{ marginTop: 28 }}>
        <h2>Unpaid Matches</h2>
        {unpaid.length === 0 ? (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(17,24,39,0.04)' }}>No unpaid matches</div>
        ) : (
          unpaid.map((m) => (
            <div key={m._id}>{m.battle?.title || 'Untitled'}</div>
          ))
        )}
      </section>

      {/* recent matches list */}
      <section className="section" style={{ marginTop: 28 }}>
        <h2>Recent Matches</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {matches.map((m) => (
            <div key={m._id} style={{ padding: 18, background: '#fff', boxShadow: '0 6px 18px rgba(17,24,39,0.04)', borderRadius: 10, display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{m.battle?.title || 'Untitled'} <small style={{ marginLeft: 8, color: '#6b7280' }}>{m.battle?.sport}</small></h3>
                <div style={{ marginTop: 8, color: '#6b7280' }}>Pot: {fmt(m.potUSD)} • Created: {new Date(m.createdAt).toLocaleString()}</div>

                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div>
                    <div style={{ color: '#6b7280' }}>Winner</div>
                    <div style={{ fontWeight: 700 }}>{winnerName(m)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Winner Payout</div>
                    <div style={{ fontWeight: 700 }}>{fmt(m.winnerPayoutUSD)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280' }}>Platform Cut</div>
                    <div style={{ fontWeight: 700 }}>{fmt(m.platformCutUSD)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={() => postAction(`/admin/matches/${m._id}/run-matchmaking`)} style={{ padding: '8px 12px', borderRadius: 6 }}>Run Matchmaking</button>
                <button disabled style={{ padding: '8px 12px', borderRadius: 6, opacity: 0.6 }}>Paid</button>
                <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(m, null, 2)); alert('JSON copied to clipboard'); }} style={{ padding: '8px 12px', borderRadius: 6 }}>View JSON</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: 36, color: '#9CA3AF' }}>Data shown is from the local BattleHub server.</footer>
    </div>
  );
}

