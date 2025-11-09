/**
 * server/index.js
 * Clean + Render-safe BattleHub backend (Express 4/5 compatible)
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

// ===== CONFIG =====
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || '';
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// ===== CORS =====
const corsOptions = {
  origin: FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ===== MONGO (Optional) =====
let mongoClient = null;
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn('⚠️  No MONGO_URI provided — skipping DB connection.');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Mongo connection error:', err.message);
    mongoClient = null;
  }
}
connectMongo().catch(console.error);

// ===== ADMIN KEY CHECK =====
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ===== ADMIN ENDPOINTS =====

// Matchmaking trigger stub
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  return res.json({ ok: true, message: 'Matchmaking triggered (stub)' });
});

// Users
app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const users = await db.collection('users')
        .find({}, { projection: { password: 0 } })
        .limit(200)
        .toArray();
      return res.json(users);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/users:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Matches
app.get('/admin/matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const matches = await db.collection('matches').find({}).limit(200).toArray();
      return res.json(matches);
    }
    return res.json([]); // placeholder
  } catch (err) {
    console.error('Error /admin/matches:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Unpaid matches
app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const unpaid = await db.collection('matches').find({ paid: false }).limit(200).toArray();
      return res.json(unpaid);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/unpaid-matches:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Payout unpaid matches
app.post('/admin/payout-unpaid', requireAdminKey, async (req, res) => {
  try {
    if (!(mongoClient && mongoClient.db)) {
      return res.status(503).json({ error: 'db_unavailable', message: 'Mongo not connected' });
    }

    const db = mongoClient.db();
    const matchesCol = db.collection('matches');
    const unpaid = await matchesCol.find({ paid: false }).limit(100).toArray();

    if (!unpaid.length) return res.json({ paid: [], count: 0 });

    const ids = unpaid.map((m) => m._id);
    await matchesCol.updateMany({ _id: { $in: ids } }, { $set: { paid: true, paidAt: new Date() } });

    // Log the payout
    const dateStr = new Date().toISOString().slice(0, 10);
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `payout-${dateStr}.log`);
    const line = `${new Date().toISOString()} | payouts=${unpaid.length} | ids=${ids.map(id => String(id)).join(',')}\n`;
    fs.appendFileSync(logFile, line, 'utf8');

    res.json({ paid: unpaid.length, ids });
  } catch (err) {
    console.error('Error /admin/payout-unpaid:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ===== SAFE FALLBACK =====
app.use((req, res) => {
  if (req.path.startsWith('/admin/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(404).send('Not Found');
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 BattleHub backend running on port ${PORT}`);
});
