/**
 * insert-test-data.js
 * Populates MongoDB with safe test users (Alice & Bob) and sample matches.
 * Only inserts if they don't already exist.
 */

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('❌ Missing MONGO_URI env variable.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  const testTag = 'sampleData2025';

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');
    const matchesCol = db.collection('matches');
    console.log('✅ Connected to MongoDB');

    // Create email index if missing
    try {
      await usersCol.createIndex({ email: 1 }, { unique: true, sparse: true });
    } catch (err) {
      console.warn('⚠ Index create skipped:', err.message);
    }

    // --- Upsert Alice (safe and robust) ---
    let alice;
    try {
      const aliceRes = await usersCol.findOneAndUpdate(
        { email: 'alice@battlehub.local' },
        {
          $setOnInsert: {
            name: 'Alice',
            email: 'alice@battlehub.local',
            createdAt: new Date(),
            testTag
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      alice = aliceRes?.value || (await usersCol.findOne({ email: 'alice@battlehub.local' }));
    } catch (err) {
      console.warn('⚠ Fallback: inserting Alice manually:', err.message);
      const r = await usersCol.insertOne({
        name: 'Alice',
        email: 'alice@battlehub.local',
        createdAt: new Date(),
        testTag
      });
      alice = await usersCol.findOne({ _id: r.insertedId });
    }

    // --- Upsert Bob (safe and robust) ---
    let bob;
    try {
      const bobRes = await usersCol.findOneAndUpdate(
        { email: 'bob@battlehub.local' },
        {
          $setOnInsert: {
            name: 'Bob',
            email: 'bob@battlehub.local',
            createdAt: new Date(),
            testTag
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      bob = bobRes?.value || (await usersCol.findOne({ email: 'bob@battlehub.local' }));
    } catch (err) {
      console.warn('⚠ Fallback: inserting Bob manually:', err.message);
      const r = await usersCol.insertOne({
        name: 'Bob',
        email: 'bob@battlehub.local',
        createdAt: new Date(),
        testTag
      });
      bob = await usersCol.findOne({ _id: r.insertedId });
    }

    console.log('👥 Users ready:');
    console.log(`   Alice: ${alice._id}`);
    console.log(`   Bob: ${bob._id}`);

    // --- Create test matches only if none exist ---
    const existingMatches = await matchesCol.countDocuments({ testTag });
    if (existingMatches > 0) {
      console.log(`ℹ Found ${existingMatches} existing test matches — skipping inserts.`);
    } else {
      const testMatches = [
        {
          title: 'Battle #1',
          player1: alice._id,
          player2: bob._id,
          winner: alice._id,
          prize: 25,
          paid: true,
          createdAt: new Date(),
          testTag
        },
        {
          title: 'Battle #2',
          player1: bob._id,
          player2: alice._id,
          winner: bob._id,
          prize: 15,
          paid: false,
          createdAt: new Date(),
          testTag
        },
        {
          title: 'Battle #3',
          player1: alice._id,
          player2: bob._id,
          winner: bob._id,
          prize: 10,
          paid: false,
          createdAt: new Date(),
          testTag
        }
      ];

      await matchesCol.insertMany(testMatches);
      console.log('🎮 Inserted test matches:', testMatches.length);
    }

    // --- Summary output ---
    const totalUsers = await usersCol.countDocuments();
    const totalMatches = await matchesCol.countDocuments();
    console.log(`📊 Totals → users: ${totalUsers}, matches: ${totalMatches}`);

    const sampleMatch = await matchesCol.findOne({ testTag });
    if (sampleMatch) console.log('✅ Sample match:', sampleMatch.title, '| paid:', sampleMatch.paid);

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
    console.log('🔒 Closed Mongo connection');
  }
}

main();

