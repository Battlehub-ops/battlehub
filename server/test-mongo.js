const mongoose = require('mongoose');

const uri = "mongodb+srv://trevor96mukisa_db_user:6oRB3VJupNkOdmRq@battlehub.gpmowab.mongodb.net/battlehub?retryWrites=true&w=majority&appName=BattleHub";

console.log('Trying to connect to MongoDB...');

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ connected!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ connection error:');
    console.error(err);
    process.exit(1);
  });

