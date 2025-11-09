/* server/index.js */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
app.use(helmet());
app.use(express.json());

// Basic CORS config: allow your frontend or fallback to allow any origin
const FRONTEND_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_API_BASE || process.env.FRONTEND_URL || 'https://client-3barral1r-battlehub-ops-projects.vercel.app';
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-key'],
  })
);

// Admin key and other envs
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// Mongo client (connect only if URI provided)
let mongoClient;
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
  }
}
connectMongo().catch(console.error);

// admin header protection middleware
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// example protected admin endpoints
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  // placeholder: trigger matchmaking
  return res.json({ ok: true, message: 'Matchmaking triggered' });
});

// returns a minimal users list the admin UI expects
app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db(); // default DB from the URI
      const users = await db.collection('users').find({}, { projection: { password: 0 } }).limit(100).toArray();
      return res.json({ users });
    }
    // no DB -> return empty list
    return res.json({ users: [] });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// example endpoints used by the admin UI (placeholders)
app.get('/admin/matches', requireAdminKey, async (req, res) => {
  return res.status(404).json({ error: 'not_found' }); // keep placeholder until implemented
});
app.get('/admin/unpaid-matches', requireAdminKey, async (req, res) => {
  return res.status(404).json({ error: 'not_found' }); // placeholder
});

// start server
app.listen(PORT, () => {
  console.log(`BattleHub backend running on port ${PORT}`);
});
