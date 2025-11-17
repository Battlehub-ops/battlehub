// server/scripts/create-sample-game.js
const mongoose = require('mongoose');
const path = require('path');
const Game = require(path.join(__dirname, '..', 'models', 'Game'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/battlehub';

async function run() {
  try {
    console.log('Connecting to Mongo:', MONGO_URI);
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    const sample = {
      title: 'TEST 60s Duel — Sample',
      type: 'duel',
      entryFee: 10,
      prizePool: 8.5,
      players: [
        { username: 'Alice', score: 0 },
        { username: 'Bob', score: 0 }
      ],
      status: 'pending'
    };

    const doc = await Game.create(sample);
    console.log('✅ Created Game:', {
      _id: doc._id.toString(),
      title: doc.title,
      status: doc.status,
      createdAt: doc.createdAt
    });

    await mongoose.disconnect();
    console.log('✅ Disconnected. Done.');
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
}

run();

