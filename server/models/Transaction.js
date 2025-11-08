// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // null for platform fees
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' }, // optional
  amountUSD: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['payout','platform_fee','deposit','withdrawal','other'], 
    default: 'payout' 
  },
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);

