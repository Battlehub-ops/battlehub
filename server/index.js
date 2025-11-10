/**
 * server/index.js
 * BattleHub minimal backend — Render-friendly + robust Mongo connect + admin stubs
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
app.use(helmet());
app.use(express.json());

// -------------------- CORS (Cross-Origin Resource Sharing) --------------------
const cors = require('cors'); // keep this only once at top if already present

const ALLOWED_ORIGINS = [
  'http://localhost:3000',                 // Local frontend
  'http://localhost:3001',                 // Optional local test port
  'https://battlehub-frontend.vercel.app', // Main deployed frontend
  'https://battlehub-frontend-git-main-battlehub-ops-projects.vercel.app' // Optional preview deployment
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl or internal calls
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed: ' + origin), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'X-Requested-With'],
  credentials: true
}));

// Handle preflight (OPTIONS) requests globally
app.options('*', cors());

// ----- Config / env -----
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// ----- Mongo (optional) -----
let mongoClient = null;
let mongoConnected = false;

async function connectMongo(retries = 5, delayMs = 2000) {
  if (!MONGO_URI) {
    console.warn('No MONGO_URI provided — skipping Mongo connection.');
    return;
  }

  // try several times with small delays (useful for platform start-up races)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      mongoClient = new MongoClient(MONGO_URI, {}); // modern driver, no legacy options
      await mongoClient.connect();
      mongoConnected = true;
      console.log('✅ Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`Mongo connect attempt ${attempt} failed:`, err.message || err);
      mongoClient = null;
      mongoConnected = false;
      if (attempt < retries) {
        console.log(`Retrying Mongo connection in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // after retries
  if (!mongoConnected) {
    console.error('⚠️ Unable to connect to MongoDB after retries. DB features will be disabled until connection succeeds.');
  }
}

// Start trying to connect immediately (background)
connectMongo().catch(err => {
  console.error('Unexpected error in connectMongo():', err);
});

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
  return res.json({ ok: true, message: 'Matchmaking triggered (stub)' });
});

app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoConnected) {
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
  try {
    if (mongoClient && mongoConnected) {
      const db = mongoClient.db();
      const matches = await db.collection('matches').find({}).limit(200).toArray();
      return res.json(matches);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoConnected) {
      const db = mongoClient.db();
      const unpaid = await db.collection('matches').find({ paid: false }).limit(100).toArray();
      return res.json(unpaid);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error fetching unpaid matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /admin/payout-unpaid (keeps safe behaviour)
app.post('/admin/payout-unpaid', requireAdminKey, async (req, res) => {
  try {
    if (!(mongoClient && mongoConnected)) {
      return res.status(503).json({ error: 'db_unavailable', message: 'Mongo not connected' });
    }
    const db = mongoClient.db();
    const matchesCol = db.collection('matches');
    const unpaid = await matchesCol.find({ paid: false }).limit(100).toArray();
    if (!unpaid || unpaid.length === 0) return res.json({ paid: [], count: 0 });

    const ids = unpaid.map(m => m._id);
    await matchesCol.updateMany({ _id: { $in: ids } }, { $set: { paid: true, paidAt: new Date() } });

    // audit line
    const fs = require('fs');
    const path = require('path');
    const d = new Date();
    const dateStr = d.toISOString().slice(0,10);
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `payout-${dateStr}.log`);
    const line = `${new Date().toISOString()} | admin=${req.header('x-admin-key') ? 'present' : 'missing'} | payouts=${unpaid.length} | ids=${ids.map(id=>String(id)).join(',')}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8' });

    return res.json({ paid: unpaid.length, ids: ids });
  } catch (err) {
    console.error('Error in /admin/payout-unpaid:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ----- debug endpoint to inspect DB state -----
app.get('/admin/db-info', requireAdminKey, async (req, res) => {
  try {
    if (!(mongoClient && mongoConnected)) {
      return res.json({ ok: false, error: 'db_unavailable', message: mongoClient ? 'Mongo client not initialized' : 'Mongo not configured' });
    }
    const db = mongoClient.db();
    const usersCount = await db.collection('users').countDocuments();
    const matchesCount = await db.collection('matches').countDocuments();
    const sampleUsers = await db.collection('users').find({}).limit(4).toArray();
    const sampleMatches = await db.collection('matches').find({}).limit(6).toArray();

    return res.json({
      ok: true,
      usersCount,
      matchesCount,
      sampleUsers: sampleUsers.map(u => ({ _id: u._id, name: u.name, email: u.email, testTag: u.testTag || null })),
      sampleMatches: sampleMatches.map(m => ({ _id: m._id, title: m.title || null, winnerName: m.winnerName || null, paid: !!m.paid, testTag: m.testTag || null })),
    });
  } catch (err) {
    console.error('Error in /admin/db-info:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// ----- SAFE fallback (avoid path-to-regexp issues) -----
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/admin/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  return next();
});

// ----- start server -----
app.listen(PORT, () => {
  console.log(`✅ BattleHub backend running on port ${PORT}`);
});

