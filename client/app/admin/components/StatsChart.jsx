// ~/battlehub/client/app/admin/components/StatsChart.jsx
'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

/*
  This component expects `data` to be an array like:
  [{ ts: '05/11/2025, 20:40:38', payouts: 17.0, revenue: 3.0 }, ...]
  Provide `data` from app/admin/page.jsx when rendering.
*/

export default function StatsChart({ data = [] }) {
  // defensive: ensure we always pass a sorted copy
  const safe = Array.isArray(data) ? [...data].sort((a, b) => {
    // tries to sort by timestamp string if present
    if (a.ts && b.ts) return new Date(a.ts) - new Date(b.ts);
    return 0;
  }) : [];

  // container style must have non-zero measured height/width for Recharts.
  // Use an explicit height on ResponsiveContainer to avoid warnings.
  const wrapperStyle = {
    width: '100%',
    minWidth: 0,       // avoids flexbox overflow causing -1 width
    minHeight: 320,    // ensures Recharts always has a positive height
    height: 360,
    boxSizing: 'border-box',
    padding: '6px 0',
  };

  return (
    <div className="chart-wrapper" style={wrapperStyle}>
      {/* ResponsiveContainer with explicit height (number) avoids zero-dim errors */}
      <ResponsiveContainer width="100%" height={360} debounce={200}>
        <LineChart data={safe} margin={{ top: 10, right: 24, left: 24, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="ts" minTickGap={20} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend verticalAlign="bottom" height={36} />
          <Line type="monotone" dataKey="payouts" name="Payouts (USD)" stroke="#10b981" dot={{ r: 4 }} strokeWidth={2} />
          <Line type="monotone" dataKey="revenue" name="Revenue (USD)" stroke="#3b82f6" dot={{ r: 4 }} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

