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
app.use(cors(corsOptions)); // this alone handles preflight automatically

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

// ----- fallback for unknown admin endpoints -----
app.use('/admin/*', (req, res) => {
  return res.status(404).json({ error: 'not_found' });
});

// ----- start server -----
app.listen(PORT, () => {
  console.log(`✅ BattleHub backend running on port ${PORT}`);
});
