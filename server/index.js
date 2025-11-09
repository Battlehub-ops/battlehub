/**
 * server/index.js
 * Clean + Render-safe BattleHub backend (avoids '*' route strings)
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
// Use a concrete path for origins (FRONTEND_URL) when available; otherwise allow all.
const corsOptions = {
  origin: FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
  optionsSuccessStatus: 204,
};
// Apply CORS middleware globally. Do NOT register app.options('*', ...) to avoid path-to-regexp issues.
app.use(cors(corsOptions));

// ===== MONGO (optional) =====
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
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  return res.json({ ok: true, message: 'Matchmaking triggered (stub)' });
});

app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const users = await db.collection('users').find({}, { projection: { password: 0 } }).limit(200).toArray();
      return res.json(users);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/users:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/admin/matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const matches = await db.collection('matches').find({}).limit(200).toArray();
      return res.json(matches);
    }
    return res.json([]);
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
      return res.json(unpaid);
    }
    return res.json([]);
  } catch (err) {
    console.error('Error /admin/unpaid-matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

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

    const dateStr = new Date().toISOString().slice(0, 10);
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `payout-${dateStr}.log`);
    const line = `${new Date().toISOString()} | payouts=${unpaid.length} | ids=${ids.map((id) => String(id)).join(',')}\n`;
    fs.appendFileSync(logFile, line, 'utf8');

    return res.json({ paid: unpaid.length, ids });
  } catch (err) {
    console.error('Error /admin/payout-unpaid:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ===== Admin Debug Endpoint =====
// This route helps verify MongoDB connection and sample data.
// Only accessible with the admin key for safety.

app.get('/admin/db-info', requireAdminKey, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(503).json({
        ok: false,
        error: 'db_unavailable',
        message: 'Mongo client not initialized'
      });
    }

    // Ensure MongoDB is connected
    try {
      await mongoClient.db().command({ ping: 1 });
    } catch (err) {
      return res.status(503).json({
        ok: false,
        error: 'db_unavailable',
        message: 'Mongo client not connected',
        inner: err.message
      });
    }

    const db = mongoClient.db(); // Default DB from URI
    const usersCount = await db.collection('users').countDocuments();
    const matchesCount = await db.collection('matches').countDocuments();

    const sampleUsers = await db.collection('users')
      .find({})
      .project({ password: 0 })
      .limit(5)
      .toArray();

    const sampleMatches = await db.collection('matches')
      .find({})
      .limit(5)
      .toArray();

    return res.json({
      ok: true,
      usersCount,
      matchesCount,
      sampleUsers,
      sampleMatches: sampleMatches.map(m => ({
        _id: m._id,
        title: m.title || '—',
        winnerName: m.winnerName || m.winner || '—',
        paid: !!m.paid,
        testTag: m.testTag || '—'
      }))
    });

  } catch (err) {
    console.error('Error in /admin/db-info', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || String(err)
    });
  }
});

// ===== SAFE FALLBACK =====
// Use a simple startsWith check rather than a pattern that could be parsed by path-to-regexp.
app.use((req, res) => {
  if (req.path.startsWith('/admin/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.status(404).send('Not Found');
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`BattleHub backend running on port ${PORT}`);
});
