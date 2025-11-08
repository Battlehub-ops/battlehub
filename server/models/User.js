// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String },
  role: { type: String, default: 'user' },
  balanceUSD: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// strip sensitive fields when converting to JSON (e.g. sending API responses)
UserSchema.options.toJSON = UserSchema.options.toJSON || {};
UserSchema.options.toJSON.transform = function (doc, ret) {
  // remove fields we never want sent to clients
  delete ret.password;
  // you can delete other internal fields here if desired, e.g. delete ret.__v;
  return ret;
};

module.exports = mongoose.model('User', UserSchema);

