require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/create-entry.js <userId> <battleId> [--paid] [--locked]');
    process.exit(2);
  }
  const userId = args[0];
  const battleId = args[1];
  const paid = args.includes('--paid');
  const locked = args.includes('--locked');

  // load models relative to server root
  const Entry = require('../models/Entry');
  const Match = require('../models/Match');
  const Battle = require('../models/Battle');

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!MONGO_URI) {
    console.error('Missing MONGO_URI in environment (.env).');
    process.exit(3);
  }

  await mongoose.connect(MONGO_URI, { connectTimeoutMS: 10000 });
  console.log('Connected to MongoDB');

  try {
    // Basic sanity checks
    const battle = await Battle.findById(battleId).lean().exec();
    if (!battle) {
      console.error('Battle not found:', battleId);
      process.exit(4);
    }

    // create the entry
    const e = await Entry.create({
      user: userId,
      battle: battleId,
      stripeSessionId: null,
      paid: Boolean(paid),
      locked: Boolean(locked)
    });

    console.log('Entry created:', e._id.toString());

    // If the battle is open and you want to auto-close it when it fills, do not change here.
    // Optionally you can also create a Match object immediately, but we'll let your matchmaking script do that.

  } catch (err) {
    console.error('ERROR', err && err.message || err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

main();
