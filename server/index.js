/**
 * server/index.js
 * Minimal BattleHub backend (safe defaults + automatic CORS + admin stubs)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
app.use(helmet());
app.use(express.json());

// ----- CORS (safe & automatic) -----
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || '';
const corsOptions = {
  origin: FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
};
app.use(cors(corsOptions)); // CORS automatically handles preflight

// ----- Config / env -----
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// ----- Mongo (optional) -----
let mongoClient = null;
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn('No MONGO_URI provided — skipping Mongo connection.');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Mongo connection error:', err);
    mongoClient = null;
  }
}
connectMongo().catch(console.error);

// ----- admin key middleware -----
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ----- health check -----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ----- admin endpoints (safe) -----
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  return res.json({ ok: true, message: 'Matchmaking triggered' });
});

app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const users = await db.collection('users')
        .find({}, { projection: { password: 0 } })
        .limit(100)
        .toArray();
      return res.json({ users });
    }
    return res.json({ users: [] });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/admin/matches', requireAdminKey, async (req, res) => {
  return res.json([]);
});

app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  return res.json([]);
});

// POST /admin/payout-unpaid
// - safe: finds matches with { paid: false } and marks them paid
// - logs a summary line to logs/payout-YYYYMMDD.log
app.post('/admin/payout-unpaid', requireAdminKey, async (req, res) => {
  try {
    if (!(mongoClient && mongoClient.db)) {
      // DB not connected: return a 503-like response but keep it safe
      return res.status(503).json({ error: 'db_unavailable', message: 'Mongo not connected' });
    }

    const db = mongoClient.db();
    const matchesCol = db.collection('matches');

    // find unpaid matches (safe stub: limit to 100 for protection)
    const unpaid = await matchesCol.find({ paid: false }).limit(100).toArray();

    // If none found, return empty list
    if (!unpaid || unpaid.length === 0) {
      return res.json({ paid: [], count: 0 });
    }

    // perform "payout" by setting paid:true and paidAt timestamp (no real payments)
    const ids = unpaid.map(m => m._id);
    await matchesCol.updateMany({ _id: { $in: ids } }, { $set: { paid: true, paidAt: new Date() } });

    // write a simple audit log line to logs/payout-YYYYMMDD.log
    const fs = require('fs');
    const path = require('path');
    const d = new Date();
    const dateStr = d.toISOString().slice(0,10); // YYYY-MM-DD
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `payout-${dateStr}.log`);
    const line = `${new Date().toISOString()} | admin=${req.header('x-admin-key') ? 'present' : 'missing'} | payouts=${unpaid.length} | ids=${ids.map(id=>String(id)).join(',')}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8' });

    // return the minimal result
    return res.json({ paid: unpaid.length, ids: ids });
  } catch (err) {
    console.error('Error in /admin/payout-unpaid:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ----- fallback for unknown admin endpoints -----
app.use(/^\/admin(\/.*)?$/, (req, res) => {
  return res.status(404).json({ error: 'not_found' });
});

// ----- start server -----
app.listen(PORT, () => {
  console.log(`✅ BattleHub backend running on port ${PORT}`);
});
