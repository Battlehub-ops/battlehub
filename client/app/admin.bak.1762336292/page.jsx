'use client';

import React, { useEffect, useState } from 'react';

// AdminDashboard.jsx
// Single-file admin dashboard (Next.js - App Router friendly)

const API_BASE =
  typeof window !== "undefined"
    ? window.__BATTLEHUB_API_BASE__ || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"
    : process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

// Place under: client/app/admin/page.jsx  (or client/pages/admin.js if using pages router)
// IMPORTANT FIX: Do NOT access `process.env` at runtime in client-side code.
// Instead this component will read an admin key from one of these sources (in this order):
// 1) `window.__BATTLEHUB_ADMIN_KEY__` (if you choose to inject it at runtime on the page)
// 2) `localStorage` (persisted by the user after a prompt)
// 3) prompt the user to paste the admin key once (the value is then saved to localStorage)
// This avoids using `process.env` directly in the browser which can cause "process is not defined" errors.

export default function AdminDashboard() {
  // NOTE: Admin key is sensitive. For local development it's fine to store it in localStorage;
  // for production you should protect the admin UI behind proper auth (not a client-side key).
  const [ADMIN_KEY, setAdminKey] = useState(null);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // Resolve admin key in a safe client-side way
    if (typeof window !== 'undefined') {
      const injected = window.__BATTLEHUB_ADMIN_KEY__ || null;
      const stored = localStorage.getItem('battlehub_admin_key');
      if (injected) {
        setAdminKey(injected);
      } else if (stored) {
        setAdminKey(stored);
      } else {
        // Prompt once for convenience during local dev. The user can cancel and still use read-only features.
        const k = window.prompt('Enter admin key for BattleHub (you can paste it once; it will be saved to localStorage):');
        if (k && k.trim()) {
          localStorage.setItem('battlehub_admin_key', k.trim());
          setAdminKey(k.trim());
        } else {
          setMessage({ type: 'info', text: 'Admin key not set — some admin actions will be disabled.' });
        }
      }
    }
  }, []);

  useEffect(() => {
    // only load data after ADMIN_KEY is available (or we still try but will show errors)
    if (ADMIN_KEY) {
      loadSummary();
      loadUsers();
      loadTransactions();
    }
  }, [ADMIN_KEY]);

// safe absolute API fetch helper — builds full URL from API_BASE or accepts full URLs
async function apiGet(path) {
  if (!ADMIN_KEY) throw new Error('Missing admin key.');

  // if path is already absolute (starts with http), use it; otherwise prefix with API_BASE
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${API_BASE}${path}`;

  const res = await fetch(url, {
    headers: { 'x-admin-key': ADMIN_KEY }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Request failed: ${res.status}`);
  }
  return res.json();
}

  async function loadSummary() {
    try {
      setLoading(true);
      const data = await apiGet('/admin/summary');
      setSummary(data);
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally { setLoading(false); }
  }

  async function loadUsers() {
    try {
      const data = await apiGet('/admin/users');
      setUsers(data);
    } catch (err) { setMessage({ type: 'error', text: String(err) }); }
  }

  async function loadTransactions() {
    try {
      const data = await apiGet('/admin/transactions');
      setTransactions(data);
    } catch (err) { setMessage({ type: 'error', text: String(err) }); }
  }

  async function runMatchmaking() {
    try {
      if (!ADMIN_KEY) throw new Error('Missing admin key.');
      setMessage({ type: 'info', text: 'Running matchmaking...' });
      const res = await fetch('/admin/run-matchmaking', { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY }});
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setMessage({ type: 'success', text: 'Matchmaking complete' });
      loadSummary();
      loadTransactions();
    } catch (err) { setMessage({ type: 'error', text: String(err) }); }
  }

  async function runPayout(matchId) {
    try {
      if (!ADMIN_KEY) throw new Error('Missing admin key.');
      setMessage({ type: 'info', text: `Paying out match ${matchId}...` });
      const res = await fetch(`/admin/payout/${matchId}`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY }});
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setMessage({ type: 'success', text: `Payout processed: ${JSON.stringify(json)}` });
      loadSummary();
      loadTransactions();
      loadUsers();
    } catch (err) { setMessage({ type: 'error', text: String(err) }); }
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">BattleHub — Admin Dashboard</h1>
          <p className="text-sm text-slate-600">Quick admin tools: matchmaking, payouts, users, transactions.</p>
        </header>

        {message && (
          <div className={`p-3 mb-4 rounded ${message.type==='error' ? 'bg-red-100 text-red-800' : message.type==='success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
            {message.text}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-white shadow rounded">
            <h3 className="font-semibold">Summary</h3>
            {summary ? (
              <ul className="mt-3 text-sm space-y-1">
                <li>Total users: <strong>{summary.totalUsers}</strong></li>
                <li>Total battles: <strong>{summary.totalBattles}</strong></li>
                <li>Total matches: <strong>{summary.totalMatches}</strong></li>
                <li>Total payouts USD: <strong>${summary.totalPayoutsUSD}</strong></li>
                <li>Platform revenue USD: <strong>${summary.platformRevenueUSD}</strong></li>
                <li>Unpaid matches: <strong>{summary.unpaidMatchesCount}</strong></li>
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No summary yet</p>
            )}
          </div>

          <div className="p-4 bg-white shadow rounded">
            <h3 className="font-semibold">Quick Actions</h3>
            <div className="mt-3 space-y-2">
              <button onClick={runMatchmaking} className="px-3 py-2 rounded bg-indigo-600 text-white">Run Matchmaking</button>
              <button onClick={() => { loadSummary(); loadUsers(); loadTransactions(); }} className="px-3 py-2 rounded border">Refresh Data</button>
            </div>
          </div>

          <div className="p-4 bg-white shadow rounded">
            <h3 className="font-semibold">Statistics</h3>
            <p className="mt-2 text-sm text-slate-500">Lightweight admin tools for monitoring and quick ops.</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-white shadow rounded">
            <h3 className="font-semibold">Users</h3>
            <div className="mt-3 overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr><th>Name</th><th>Email</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u._id} className="border-t"><td className="py-2">{u.name}</td><td>{u.email}</td><td>${u.balanceUSD}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-white shadow rounded">
            <h3 className="font-semibold">Transactions</h3>
            <div className="mt-3 overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr><th>Type</th><th>Amount</th><th>Match</th></tr>
                </thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={t._id} className="border-t"><td className="py-2">{t.type}</td><td>${t.amountUSD}</td><td>{t.match}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="p-4 bg-white shadow rounded">
          <h3 className="font-semibold">Matches / Payout</h3>
          <p className="text-sm text-slate-600">Fetch matches and run payouts on selected match.</p>
          <div className="mt-3 flex items-center gap-2">
            <input placeholder="Match ID (or leave empty to fetch latest)" className="border rounded p-2 w-1/2" id="matchIdInput" />
            <button onClick={async () => {
              const input = document.getElementById('matchIdInput').value.trim();
              setMessage(null);
              if (!input) {
                // fetch unpaid matches from server
                try {
                  setLoading(true);
                  const res = await apiGet('/matches?unpaid=true');
                  setMatches(res || []);
                } catch (err) { setMessage({ type: 'error', text: String(err) }); } finally { setLoading(false); }
                return;
              }
              // run payout on provided match id
              await runPayout(input);
            }} className="px-3 py-2 rounded bg-emerald-600 text-white">Fetch / Payout</button>
          </div>

          {matches.length>0 && (
            <div className="mt-3 overflow-auto max-h-48">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-600"><tr><th>Match ID</th><th>Pot</th><th>Winner</th><th>Action</th></tr></thead>
                <tbody>
                  {matches.map(m => (
                    <tr key={m._id} className="border-t"><td className="py-2">{m._id}</td><td>${m.potUSD}</td><td>{m.winnerEntry}</td><td><button onClick={() => runPayout(m._id)} className="px-2 py-1 rounded bg-yellow-500">Payout</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mt-8 text-sm text-slate-500">BattleHub Admin • Built with Next + Tailwind</footer>
      </div>
    </div>
  );
}

