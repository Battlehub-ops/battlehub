/**
 * server/index.js
 * Clean, safe BattleHub backend (CommonJS)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(helmet());
app.use(express.json());

// Config from env
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || '';
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// CORS: prefer explicit FRONTEND_URL, fallback to allow-all (use '*' only if necessary)
const corsOptions = {
  origin: FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Optional Mongo client (safe: skip if no URI)
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
    console.error('Mongo connection error:', err && err.message ? err.message : err);
    mongoClient = null;
  }
}
connectMongo().catch((e) => console.error('connectMongo error', e));

// Admin key middleware
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Admin endpoints (safe stubs / read-only)
// Trigger (placeholder)
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  return res.json({ ok: true, message: 'Matchmaking triggered (stub)' });
});

// /admin/users -> if DB present return users array, else empty array
app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const users = await db.collection('users')
        .find({}, { projection: { password: 0 } })
        .limit(200)
        .toArray();
      return res.json(Array.isArray(users) ? users : []);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/users:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Matches stubs used by admin UI
app.get('/admin/matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      // if you want real data, implement real query here
      const db = mongoClient.db();
      const matches = await db.collection('matches').find({}).limit(200).toArray();
      return res.json(Array.isArray(matches) ? matches : []);
    }
    return res.json([]); // placeholder when DB absent
  } catch (err) {
    console.error('Error /admin/matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const unpaid = await db.collection('matches').find({ paid: false }).limit(200).toArray();
      return res.json(Array.isArray(unpaid) ? unpaid : []);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/unpaid-matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /admin/payout-unpaid - safe: marks unpaid matches paid in DB (no external payments)
app.post('/admin/payout-unpaid', requireAdminKey, async (req, res) => {
  try {
    if (!(mongoClient && mongoClient.db)) {
      return res.status(503).json({ error: 'db_unavailable', message: 'Mongo not connected' });
    }

    const db = mongoClient.db();
    const matchesCol = db.collection('matches');
    const unpaid = await matchesCol.find({ paid: false }).limit(100).toArray();

    if (!unpaid || unpaid.length === 0) {
      return res.json({ paid: [], count: 0 });
    }

    const ids = unpaid.map((m) => m._id);
    await matchesCol.updateMany({ _id: { $in: ids } }, { $set: { paid: true, paidAt: new Date() } });

    // audit log
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `payout-${dateStr}.log`);
    const line = `${new Date().toISOString()} | admin=${req.header('x-admin-key') ? 'present' : 'missing'} | payouts=${unpaid.length} | ids=${ids.map(id => String(id)).join(',')}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8' });

    return res.json({ paid: unpaid.length, ids });
  } catch (err) {
    console.error('Error /admin/payout-unpaid:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Fallback for /admin routes -> friendly 404 for admin UI
app.use(/^\/admin(\/.*)?$/, (req, res) => {
  return res.status(404).json({ error: 'not_found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ BattleHub backend listening on port ${PORT}`);
});
