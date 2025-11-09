/* server/index.js */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
app.use(helmet());
app.use(express.json());

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "x-admin-key"]
}));

// allow CORS preflight on all routes
app.options((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.sendStatus(204);
});

const FRONTEND_URL = process.env.BASE_URL || 'https://battlehub-frontend.vercel.app';
app.use(cors({ origin: [FRONTEND_URL] }));

const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Mongo client (connect on start if URI present)
let mongoClient;
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn('No MONGO_URI provided – skipping Mongo connection.');
    return;
  }
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  console.log('Connected to MongoDB');
}
connectMongo().catch(err => console.error('Mongo connection error:', err));

// admin header protection
function requireAdminKey(req, res, next) {
  const key = req.header('x-admin-key');
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// example protected admin endpoint
app.post('/admin/run-matchmaking', requireAdminKey, async (req, res) => {
  // placeholder: trigger matchmaking
  return res.json({ ok: true, message: 'Matchmaking triggered' });
});

// returns a minimal users list the admin UI expects
app.get('/admin/users', requireAdminKey, async (req, res) => {
  try {
    // if you have a MongoDB connection and a users collection, return real data:
    if (mongoClient && mongoClient.db) {
      const db = mongoClient.db(); // default DB from the URI
      const users = await db.collection('users')
        .find({}, { projection: { password: 0 } })
        .limit(100)
        .toArray();
      return res.json({ users });
    }
    // fallback: empty list so frontend doesn't 404
    return res.json({ users: [] });
  } catch (err) {
    console.error('admin/users error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// public API example
app.get('/api/stats', async (req, res) => {
  const stats = { totalUsers: 0, revenueUsd: 0, unpaidUsd: 0 };
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) {
      // optionally query DB for real data
    }
  } catch (e) {
    console.error(e);
  }
  res.json(stats);
});

// stripe webhook (raw body required)
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  // TODO: verify signature using STRIPE_WEBHOOK_SECRET
  res.status(200).send('received');
});

// simple 404
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`BattleHub backend running on port ${PORT}`);
});
