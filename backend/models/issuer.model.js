const mongoose = require('mongoose');

const IssuerSchema = new mongoose.Schema({
  isin: { type: String, unique: true, index: true, required: true },
  company: { type: String, required: true },
  sector: String,
  rating: String,
  market_cap: String,            // e.g. "₹3.5L cr"
  week52_high: Number,
  week52_low: Number,
  description: String,
}, { timestamps: true });

module.exports = mongoose.model('Issuer', IssuerSchema);

