// test-mongo-conn.js
// Simple Mongo connection tester: prints counts and a small sample of users/matches.
// Usage:
//   MONGO_URI="mongodb+srv://..." node test-mongo-conn.js
// or
//   node test-mongo-conn.js "<your-uri>"

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || process.argv[2];
if (!uri) {
  console.error('Usage: MONGO_URI="..." node test-mongo-conn.js  OR  node test-mongo-conn.js "<uri>"');
  process.exit(2);
}

async function run() {
  const client = new MongoClient(uri); // no `useUnifiedTopology` option with modern drivers
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(); // uses the database name from the URI (battlehub)
    const usersCol = db.collection('users');
    const matchesCol = db.collection('matches');

    const usersCount = await usersCol.countDocuments();
    const matchesCount = await matchesCol.countDocuments();
    console.log(`📊 counts -> users: ${usersCount}, matches: ${matchesCount}`);

    const sampleUsers = await usersCol.find({}).limit(5).toArray();
    console.log('👥 sample users:');
    sampleUsers.forEach(u => {
      console.log(`  - _id:${u._id} name:${u.name || u.username || '—'} email:${u.email || '—'} testTag:${u.testTag || '—'}`);
    });

    const sampleMatches = await matchesCol.find({}).limit(5).toArray();
    console.log('🎮 sample matches:');
    sampleMatches.forEach(m => {
      console.log(`  - _id:${m._id} title:${m.title || '—'} winner:${m.winnerName || '—'} paid:${!!m.paid} testTag:${m.testTag || '—'}`);
    });

    // helpful quick-check endpoints for your admin UI:
    console.log('\nQuick curl checks (run locally):');
    console.log('curl -i -H "x-admin-key: BattleHub2025Secret!" "https://battlehub-backend.onrender.com/admin/users"');
    console.log('curl -i -H "x-admin-key: BattleHub2025Secret!" "https://battlehub-backend.onrender.com/admin/matches"');

  } catch (err) {
    console.error('❌ Mongo error:', err.message || err);
    process.exitCode = 1;
  } finally {
    await client.close();
    console.log('🔒 Closed Mongo connection');
  }
}

run();

