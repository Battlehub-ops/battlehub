// models/Entry.js
const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  battle: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
  stripeSessionId: { type: String },
  paid: { type: Boolean, default: false },
  locked: { type: Boolean, default: false }, // becomes true when matched/locked
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Entry', EntrySchema);

