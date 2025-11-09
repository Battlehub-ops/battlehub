/* server/index.js */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
app.use(helmet());
app.use(express.json());

// ======== CORS CONFIG ========
const FRONTEND_URL =
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.FRONTEND_URL ||
  'https://client-3barral1r-battlehub-ops-projects.vercel.app';

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-key'],
  })
);

// Let the CORS middleware handle preflight automatically
app.options('*', cors());

// ======== ENVIRONMENT CONFIG ========
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGODB_URI || '';
let mongoClient;

// ======== MONGO CONNECTION ========
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn('⚠️ No Mongo URI provided — skipping MongoDB connection.');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }
}
connectMongo().catch(console.error);

// ======== ADMIN AUTH MIDDLEWARE ========
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ======== HEALTH CHECK ========
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ======== ADMIN ENDPOINTS ========
app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const users = await db
        .collection('users')
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
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const matches = await db.collection('matches').find({}).toArray();
      return res.json({ matches });
    }
    return res.json({ matches: [] });
  } catch (err) {
    console.error('Error fetching matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db();
      const unpaid = await db
        .collection('matches')
        .find({ paid: false })
        .toArray();
      return res.json({ unpaid });
    }
    return res.json({ unpaid: [] });
  } catch (err) {
    console.error('Error fetching unpaid matches:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ======== 404 HANDLER ========
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// ======== START SERVER ========
app.listen(PORT, () => {
  console.log(`🚀 BattleHub backend running on port ${PORT}`);
});

