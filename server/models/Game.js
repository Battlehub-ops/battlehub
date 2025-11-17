// server/models/Game.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  username: { type: String, required: true },
  score: { type: Number, default: 0 }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['duel','tournament'], default: 'duel' },
  entryFee: { type: Number, default: 0 },
  prizePool: { type: Number, default: 0 },
  players: { type: [playerSchema], default: [] },
  winner: { type: String, default: null },
  status: { type: String, enum: ['pending','active','completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Game || mongoose.model('Game', gameSchema);

