const mongoose = require("mongoose");

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/battlehub";
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected (from connectDB)");
}

// ~/battlehub/server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));

// Models (require your model files -- they should export Mongoose models)
const Battle = require('./models/Battle');
const Entry = require('./models/Entry');
const Match = require('./models/Match');
const Transaction = require('./models/Transaction');
const User = require('./models/User');

// Env / defaults
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/battlehub';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const ADMIN_KEY = process.env.ADMIN_KEY || 'BattleHub2025Secret!';

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('Mongo connect error', err); process.exit(1); });

// --------------------- middlewares ---------------------
function requireAuth(req, res, next) {
  const auth = req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Not authenticated' });
  const token = m[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// requireAdmin: checks x-admin-key header first, otherwise checks token role === 'admin'
function requireAdmin(req, res, next) {
  console.log("DEBUG: requireAdmin ENTRY; headers:", req.headers);
  const headerKey = req.header('x-admin-key');
  if (headerKey && headerKey === ADMIN_KEY) return next();

  // fallback to token role
  const auth = req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Not authorized' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    if (payload && payload.role === 'admin') {
      req.user = payload;
      return next();
    }
    return res.status(403).json({ error: 'Not admin' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --------------------- helpers ---------------------
function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });
}

// --------------------- routes ---------------------

app.get('/', (req, res) => res.json({ ok: true }));

// Create / Register battle (open by default — do NOT auto-close on creation)
app.post('/battles/create', requireAuth, async (req, res) => {
  try {
    const { title, sport, entryFeeUSD, startAt } = req.body || {};
    if (!title || !sport || typeof entryFeeUSD === 'undefined') {
      return res.status(400).json({ error: 'title, sport and entryFeeUSD are required' });
    }

    const battle = await Battle.create({
      title,
      sport,
      entryFeeUSD: Number(entryFeeUSD),
      startAt: startAt ? new Date(startAt) : null,
      state: 'open'
    });

    res.status(201).json({ battle });
  } catch (err) {
    console.error('Error /battles/create', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /matches/:id - return a single match (populated)
app.get('/matches/:id', requireAdmin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate({ path: 'entries', populate: { path: 'user', select: 'name email balanceUSD' } })
      .populate('battle');

    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    console.error('GET /matches/:id error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/matches - return recent matches (admin only)
app.get('/admin/matches', requireAdmin, async (req, res) => {
  try {
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({ path: 'entries', populate: { path: 'user', select: 'name email balanceUSD' } })
      .populate('battle')
      .lean();

    res.json(matches);
  } catch (err) {
    console.error('GET /admin/matches error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/run-matchmaking - simple matchmaking runner (closes open battles with >=2 locked+paid entries)
app.post('/admin/run-matchmaking', requireAdmin, async (req, res) => {
  try {
    const processed = [];

    // find open battles
    const openBattles = await Battle.find({ state: 'open' }).sort({ createdAt: 1 }).limit(200);
    for (const b of openBattles) {
      const entries = await Entry.find({ battle: b._id, paid: true, locked: true }).sort({ createdAt: 1 }).lean();
      if (!entries || entries.length < 2) continue;

      // close the battle and create a Match
      b.state = 'closed';
      await b.save();

      // deterministic seed: random + timestamp
      const seed = crypto.randomBytes(32).toString('hex') + '|' + Date.now();
      const hash = crypto.createHash('sha256').update(seed).digest('hex');

      // choose winner index by converting hash to integer
      const chosenIndex = parseInt(hash.slice(0, 8), 16) % entries.length;
      const winnerEntry = entries[chosenIndex];

      const matchDoc = await Match.create({
        battle: b._id,
        entries: entries.map(e => e._id),
        winnerEntry: winnerEntry._id,
        potUSD: entries.length * (b.entryFeeUSD || 0),
        winnerPayoutUSD: Math.max(0, entries.length * (b.entryFeeUSD || 0) - ((entries.length * (b.entryFeeUSD || 0)) * 0.15)),
        platformCutUSD: ((entries.length * (b.entryFeeUSD || 0)) * 0.15),
        seed,
        payoutProcessed: false,
        paid: false
      });

      // mark entries locked true (they should already be)
      await Entry.updateMany({ battle: b._id }, { $set: { locked: true } });

      processed.push({ battleId: b._id.toString(), matchId: matchDoc._id.toString(), winnerEntry: winnerEntry._id.toString() });
    }

    res.json({ ok: true, processed });
  } catch (err) {
    console.error('POST /admin/run-matchmaking error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin payout endpoint: payout a single match (simple, updates balances and transactions)
app.post('/admin/payout/:matchId', requireAdmin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId).populate({
      path: 'entries',
      populate: { path: 'user', select: 'name email balanceUSD' }
    }).populate('battle');

    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.payoutProcessed) return res.json({ error: 'Payout already processed for this match', matchId: match._id });

    const winnerEntryId = match.winnerEntry;
    const winnerEntry = await Entry.findById(winnerEntryId).populate('user');
    if (!winnerEntry) return res.status(500).json({ error: 'Winner entry not found' });

    const winnerUser = await User.findById(winnerEntry.user._id);
    if (!winnerUser) return res.status(500).json({ error: 'Winner user not found' });

    // compute pot / cuts (fallback values if not present)
    const pot = match.potUSD || (match.entries.length * (match.battle?.entryFeeUSD || 0));
    const platformCut = match.platformCutUSD != null ? match.platformCutUSD : Number((pot * 0.15).toFixed(2));
    const winnerPayout = match.winnerPayoutUSD != null ? match.winnerPayoutUSD : Number((pot - platformCut).toFixed(2));

    // update winner balance
    winnerUser.balanceUSD = (winnerUser.balanceUSD || 0) + winnerPayout;
    await winnerUser.save();

    // mark match as paid and payoutProcessed
    match.paid = true;
    match.payoutProcessed = true;
    match.payoutAt = new Date();
    await match.save();

    // create transactions records
    await Transaction.create({
      user: winnerUser._id,
      match: match._id,
      amountUSD: winnerPayout,
      type: 'payout',
      note: `Payout for match ${match._id}`
    });

    await Transaction.create({
      user: null,
      match: match._id,
      amountUSD: platformCut,
      type: 'platform_fee',
      note: `Platform cut for match ${match._id}`
    });

    res.json({ ok: true, matchId: match._id, winnerUserId: winnerUser._id, updatedBalanceUSD: winnerUser.balanceUSD, winnerPayoutUSD: winnerPayout, platformCutUSD: platformCut });
  } catch (err) {
    console.error('POST /admin/payout error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin verify endpoint (recompute seed hash & chosen index)
app.get('/admin/match/:id/verify', requireAdmin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate({
      path: 'entries',
      populate: { path: 'user', select: 'name email' }
    }).lean();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // recompute chosen index/hash using stored seed
    const storedSeed = match.seed;
    const recomputedHash = crypto.createHash('sha256').update(storedSeed || '').digest('hex');
    const chosenIndex = parseInt(recomputedHash.slice(0, 8), 16) % (match.entries.length || 1);

    res.json({
      matchId: match._id,
      storedSeed,
      recomputedHash,
      seedsMatch: !!storedSeed,
      chosenIndex,
      entries: (match.entries || []).map((e, i) => ({ index: i, id: e._id.toString(), userEmail: e.user?.email, userName: e.user?.name })),
      winnerEntryId: match.winnerEntry
    });
  } catch (err) {
    console.error('GET /admin/match/:id/verify error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/users (simple admin listing)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    console.error('GET /admin/users', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/transactions
app.get('/admin/transactions', requireAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find().sort({ createdAt: -1 }).lean();
    res.json(txs);
  } catch (err) {
    console.error('GET /admin/transactions', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 BattleHub server listening on port ${PORT}`);
});


// --- ADMIN SUMMARY (auto-added for dev) ---
app.get('/admin/summary', requireAdmin, async (req, res) => {
  console.log("DEBUG: /admin/summary handler ENTRY; headers:", req.headers);
  try {
    await connectDB();
    const totalUsers = await User.countDocuments();
    const totalBattles = await Battle.countDocuments();
    const totalMatches = await Match.countDocuments();
    const payouts = await Transaction.find({ type: 'payout' });
    const totalPayoutsUSD = payouts.reduce((s, t) => s + (t.amountUSD || 0), 0);
    res.json({ totalUsers, totalBattles, totalMatches, totalPayoutsUSD });
  } catch (err) {
    console.error('GET /admin/summary error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});
// --- end admin summary ---

// TEMP DEV: quick health-check route (dev only) - remove later
app.get('/_dev_health', (req, res) => {
  return res.json({ ok: true, pid: process.pid, when: new Date().toISOString() });
});
// END TEMP

/**
 * Temporary lightweight endpoint for Admin UI while we diagnose slow /admin/matches.
 * Returns a small list of recent matches without heavy populate calls.
 */
app.get('/admin/matches-lite', async (req, res) => {
  try {
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id battle potUSD winnerEntry winnerPayoutUSD paid payoutProcessed createdAt')
      .lean();
    return res.json(matches);
  } catch (err) {
    console.error('GET /admin/matches-lite error', err && err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Debug endpoint that mirrors /admin/matches but adds step timing logs.
 * Use this to identify which DB operation is slow (or whether it's a populate).
 */
app.get('/admin/matches-dbg', async (req, res) => {
  console.log('DEBUG /admin/matches-dbg start', new Date().toISOString());
  console.time('admin_matches_total');

  try {
    console.time('find_matches');
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .select('-__v') // lightweight select first
      .lean();
    console.timeEnd('find_matches');

    // If there are zero matches, return early to avoid slow populates
    if (!Array.isArray(matches) || matches.length === 0) {
      console.timeEnd('admin_matches_total');
      return res.json(matches);
    }

    // Log count
    console.log('DEBUG matches.count =', matches.length);

    // Now run a controlled populate in two steps and time them separately
    console.time('populate_battles');
    const battleIds = Array.from(new Set(matches.map(m => (m.battle ? String(m.battle) : null)).filter(Boolean)));
    const battles = await Battle.find({ _id: { $in: battleIds } }).select('_id title state').lean();
    console.timeEnd('populate_battles');

    console.time('populate_entries_users');
    // only find entries for these matches (lightweight)
    const matchIds = matches.map(m => m._id);
    const entries = await Entry.find({ battle: { $in: battleIds } })
      .select('_id user battle paid locked createdAt')
      .lean();
    // gather users referenced by entries
    const userIds = Array.from(new Set(entries.map(e => (e.user ? String(e.user) : null)).filter(Boolean)));
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email balanceUSD').lean();
    console.timeEnd('populate_entries_users');

    // Map data into a compact shape
    const battlesById = Object.fromEntries(battles.map(b => [String(b._id), b]));
    const usersById = Object.fromEntries(users.map(u => [String(u._id), u]));
    const entriesByBattle = {};
    for (const e of entries) {
      const key = String(e.battle);
      entriesByBattle[key] = entriesByBattle[key] || [];
      entriesByBattle[key].push({
        _id: e._id,
        user: usersById[String(e.user)] || null,
        paid: e.paid,
        locked: e.locked,
        createdAt: e.createdAt
      });
    }

    // Attach light populated fields to matches
    const out = matches.map(m => ({
      _id: m._id,
      createdAt: m.createdAt,
      potUSD: m.potUSD,
      winnerEntry: m.winnerEntry,
      winnerPayoutUSD: m.winnerPayoutUSD,
      platformCutUSD: m.platformCutUSD,
      paid: m.paid,
      payoutProcessed: m.payoutProcessed,
      seed: m.seed,
      battle: battlesById[String(m.battle)] || null,
      entries: entriesByBattle[String(m.battle)] || []
    }));

    console.timeEnd('admin_matches_total');
    console.log('DEBUG /admin/matches-dbg done', new Date().toISOString());
    return res.json(out);
  } catch (err) {
    console.timeEnd('admin_matches_total');
    console.error('ERROR /admin/matches-dbg', err && err.stack || err && err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Temporary lightweight endpoint for Admin UI while we diagnose slow /admin/matches.
 * Returns a small list of recent matches without heavy populate calls.
 */
app.get('/admin/matches-lite', async (req, res) => {
  try {
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id battle potUSD winnerEntry winnerPayoutUSD paid payoutProcessed createdAt')
      .lean();
    return res.json(matches);
  } catch (err) {
    console.error('GET /admin/matches-lite error', err && err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Debug endpoint that mirrors /admin/matches but adds step timing logs.
 * Use this to identify which DB operation is slow (or whether it's a populate).
 */
app.get('/admin/matches-dbg', async (req, res) => {
  console.log('DEBUG /admin/matches-dbg start', new Date().toISOString());
  console.time('admin_matches_total');

  try {
    console.time('find_matches');
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .select('-__v')
      .lean();
    console.timeEnd('find_matches');

    if (!Array.isArray(matches) || matches.length === 0) {
      console.timeEnd('admin_matches_total');
      return res.json(matches);
    }

    console.log('DEBUG matches.count =', matches.length);

    console.time('populate_battles');
    const battleIds = Array.from(new Set(matches.map(m => (m.battle ? String(m.battle) : null)).filter(Boolean)));
    const battles = await Battle.find({ _id: { $in: battleIds } }).select('_id title state').lean();
    console.timeEnd('populate_battles');

    console.time('populate_entries_users');
    const entries = await Entry.find({ battle: { $in: battleIds } })
      .select('_id user battle paid locked createdAt')
      .lean();
    const userIds = Array.from(new Set(entries.map(e => (e.user ? String(e.user) : null)).filter(Boolean)));
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email balanceUSD').lean();
    console.timeEnd('populate_entries_users');

    const battlesById = Object.fromEntries(battles.map(b => [String(b._id), b]));
    const usersById = Object.fromEntries(users.map(u => [String(u._id), u]));
    const entriesByBattle = {};
    for (const e of entries) {
      const key = String(e.battle);
      entriesByBattle[key] = entriesByBattle[key] || [];
      entriesByBattle[key].push({
        _id: e._id,
        user: usersById[String(e.user)] || null,
        paid: e.paid,
        locked: e.locked,
        createdAt: e.createdAt
      });
    }

    const out = matches.map(m => ({
      _id: m._id,
      createdAt: m.createdAt,
      potUSD: m.potUSD,
      winnerEntry: m.winnerEntry,
      winnerPayoutUSD: m.winnerPayoutUSD,
      platformCutUSD: m.platformCutUSD,
      paid: m.paid,
      payoutProcessed: m.payoutProcessed,
      seed: m.seed,
      battle: battlesById[String(m.battle)] || null,
      entries: entriesByBattle[String(m.battle)] || []
    }));

    console.timeEnd('admin_matches_total');
    console.log('DEBUG /admin/matches-dbg done', new Date().toISOString());
    return res.json(out);
  } catch (err) {
    console.timeEnd('admin_matches_total');
    console.error('ERROR /admin/matches-dbg', err && err.stack || err && err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/admin/unpaid-matches', requireAdmin, async (req, res) => {
  try {
    console.log('DEBUG: /admin/unpaid-matches handler ENTRY; headers:', req.headers && { origin: req.headers.origin, host: req.headers.host, 'x-admin-key': req.headers['x-admin-key'] ? 'provided' : 'missing' });
    const matches = await Match.find({ paid: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id battle potUSD winnerPayoutUSD paid payoutProcessed createdAt')
      .lean();
    // Light populate for battle title
    if (matches.length > 0) {
      const battleIds = Array.from(new Set(matches.map(m => m.battle).filter(Boolean)));
      const battles = await Battle.find({ _id: { $in: battleIds } }).select('_id title').lean();
      const battlesById = Object.fromEntries(battles.map(b => [String(b._id), b]));
      const out = matches.map(m => ({ ...m, battle: battlesById[String(m.battle)] || null }));
      return res.json(out);
    }
    return res.json(matches);
  } catch (err) {
    console.error('ERROR /admin/unpaid-matches', err && (err.stack || err.message));
    return res.status(500).json({ error: err && err.message });
  }
});

app.get('/admin/unpaid-matches', requireAdmin, async (req, res) => {
  try {
    console.log('DEBUG: /admin/unpaid-matches handler ENTRY; headers:', req.headers && { origin: req.headers.origin, host: req.headers.host, 'x-admin-key': req.headers['x-admin-key'] ? 'provided' : 'missing' });
    const matches = await Match.find({ paid: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('_id battle potUSD winnerPayoutUSD paid payoutProcessed createdAt')
      .lean();
    // Light populate for battle title
    if (matches.length > 0) {
      const battleIds = Array.from(new Set(matches.map(m => m.battle).filter(Boolean)));
      const battles = await Battle.find({ _id: { $in: battleIds } }).select('_id title').lean();
      const battlesById = Object.fromEntries(battles.map(b => [String(b._id), b]));
      const out = matches.map(m => ({ ...m, battle: battlesById[String(m.battle)] || null }));
      return res.json(out);
    }
    return res.json(matches);
  } catch (err) {
    console.error('ERROR /admin/unpaid-matches', err && (err.stack || err.message));
    return res.status(500).json({ error: err && err.message });
  }
});

// --- Admin: batch payout (starts scripts/payout-unpaid.js) ---
let payoutRunning = false;
app.post('/admin/payout-unpaid', requireAdmin, (req, res) => {
  try {
    if (payoutRunning) {
      return res.status(409).json({ ok: false, error: 'Batch payout already running' });
    }

    // Mark running immediately so concurrent requests fail fast
    payoutRunning = true;

    const path = require('path');
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, 'scripts', 'payout-unpaid.js');

    // spawn node script with --apply flag (adjust if you want dry-run)
    const child = spawn(process.execPath, [scriptPath, '--apply'], {
      cwd: __dirname,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // rotate basic logs
    const logsDir = path.join(__dirname, 'logs');
    try { require('fs').mkdirSync(logsDir, { recursive: true }); } catch (e) {}
    const outLog = path.join(logsDir, `payout-${new Date().toISOString().replace(/[:.]/g,'-')}.log`);
    const fs = require('fs');
    const outStream = fs.createWriteStream(outLog, { flags: 'a' });

    child.stdout.on('data', (d) => { outStream.write('[stdout] ' + d.toString()); });
    child.stderr.on('data', (d) => { outStream.write('[stderr] ' + d.toString()); });
    child.on('close', (code) => {
      outStream.write(`\n[child exit] code=${code}\n`);
      payoutRunning = false;
      outStream.end();
      console.log('Batch payout script finished, code=', code);
    });
    child.on('error', (err) => {
      outStream.write('[child error] ' + (err && err.stack || err) + '\n');
      payoutRunning = false;
      outStream.end();
      console.error('Failed to start payout script:', err);
    });

    // Immediately respond so UI is not blocked
    res.json({ ok: true, message: 'Batch payout started' });
  } catch (err) {
    payoutRunning = false;
    console.error('Error starting batch payout:', err && err.stack || err);
    res.status(500).json({ ok: false, error: err && err.message });
  }
});
