const mongoose = require('mongoose');

const PriceSnapshotSchema = new mongoose.Schema({
  isin: { type: String, unique: true, index: true, required: true },
  current_price: { type: Number, min: 0, required: true },
  as_of: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('PriceSnapshot', PriceSnapshotSchema);

