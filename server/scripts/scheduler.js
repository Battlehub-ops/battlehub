/**
 * scripts/scheduler.js
 *
 * Finds battles that should be started (startAt <= now) and closes them,
 * then triggers admin matchmaking endpoint to process closed battles.
 *
 * Usage:
 *   NODE_ENV=development node scripts/scheduler.js
 *
 * Requires .env with MONGO_URI and ADMIN_KEY (or set environment variables before running).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Battle = require('../models/Battle');

const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const API_BASE = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : 'http://localhost:4000';
const MATCHMAKING_ENDPOINT = `${API_BASE}/admin/run-matchmaking`;

let running = false;

async function closeDueBattles() {
  if (running) return;
  running = true;

  try {
    const now = new Date();
    // find open battles where startAt is set and <= now
    const due = await Battle.find({ state: 'open', startAt: { $ne: null, $lte: now } });
    if (due.length === 0) {
      console.log(new Date().toISOString(), 'No due battles to close.');
      running = false;
      return;
    }

    console.log(new Date().toISOString(), `Closing ${due.length} battle(s):`, due.map(b => b._id.toString()));

    // Mark each as closed (atomic per document)
    for (const b of due) {
      try {
        await Battle.updateOne({ _id: b._id, state: 'open' }, { $set: { state: 'closed' } });
        console.log('Closed battle', b._id.toString());
      } catch (err) {
        console.error('Error closing battle', b._id.toString(), err.message);
      }
    }

    // trigger matchmaking to process newly closed battles
    try {
      console.log('Triggering matchmaking at', MATCHMAKING_ENDPOINT);
      const resp = await fetch(MATCHMAKING_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
      });
      const data = await resp.text();
      console.log('Matchmaking response status', resp.status, data);
    } catch (err) {
      console.error('Error calling matchmaking endpoint:', err.message);
    }
  } catch (err) {
    console.error('Error in closeDueBattles:', err);
  } finally {
    running = false;
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not found in .env or env; set MONGO_URI and try again.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {});

  console.log('Connected. Starting scheduler loop (checks every 60s).');
  // Run immediately, then every minute
  closeDueBattles();
  const interval = setInterval(closeDueBattles, 60 * 1000);

  // Clean shutdown
  process.on('SIGINT', async () => {
    console.log('SIGINT received — shutting down scheduler...');
    clearInterval(interval);
    await mongoose.disconnect();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received — shutting down scheduler...');
    clearInterval(interval);
    await mongoose.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Scheduler fatal error:', err);
  process.exit(1);
});
