// models/Battle.js
const mongoose = require('mongoose');

const BattleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  sport: { type: String, default: 'car' }, // car, boxing, bike, football etc.
  entryFeeUSD: { type: Number, default: 5 }, // dollars
  startAt: { type: Date, default: Date.now },
  state: { type: String, default: 'open' }, // open / ongoing / finished
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Battle', BattleSchema);

