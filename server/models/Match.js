// models/Match.js
const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  battle: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
  entries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Entry' }], // entries for this match
  winnerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null },

  // financial fields
  potUSD: { type: Number, default: 0 }, // total pot in dollars
  winnerPayoutUSD: { type: Number, default: 0 },
  platformCutUSD: { type: Number, default: 0 },

  // payout tracking
  paid: { type: Boolean, default: false },
  payoutProcessed: { type: Boolean, default: false },
  payoutAt: { type: Date },

  // randomization seed (for fair audit)
  seed: { type: String },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Match', MatchSchema);

