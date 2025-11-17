// patch-fix-matches.js
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI || "mongodb+srv://trevor96mukisa_db_user:6oRB3VJupNkOdmRq@battlehub.gpmowab.mongodb.net/battlehub?retryWrites=true&w=majority";

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("battlehub");
    const matches = db.collection("matches");

    console.log("✅ Connected to MongoDB for patch");

    // Find users Alice & Bob to map their IDs
    const users = await db.collection("users").find({ name: { $in: ["Alice", "Bob"] } }).toArray();
    const alice = users.find(u => u.name === "Alice");
    const bob = users.find(u => u.name === "Bob");

    // Patch only "null" title or winnerName fields
    const res1 = await matches.updateMany(
      { title: { $in: [null, "", "Untitled"] } },
      { $set: { title: "TEST 60s Drag Duel — Open Battle" } }
    );

    const res2 = await matches.updateMany(
      { winnerName: { $in: [null, "", "N/A"] } },
      [
        {
          $set: {
            winnerName: {
              $cond: [
                { $lt: [{ $rand: {} }, 0.5] },
                alice ? alice.name : "Alice",
                bob ? bob.name : "Bob"
              ]
            }
          }
        }
      ]
    );

    console.log(`🛠 Updated ${res1.modifiedCount} match titles`);
    console.log(`🏁 Updated ${res2.modifiedCount} winner names`);

    // Verify patch results
    const sample = await matches.find().limit(5).toArray();
    console.log("✅ Sample patched matches:");
    sample.forEach(m => console.log(`- ${m.title} | Winner: ${m.winnerName}`));

  } catch (err) {
    console.error("❌ Patch error:", err);
  } finally {
    await client.close();
    console.log("🔒 Closed Mongo connection");
  }
}

main();

