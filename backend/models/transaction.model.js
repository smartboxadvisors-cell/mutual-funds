const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  isin: { type: String, index: true, required: true },
  company: { type: String, required: true },

  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  share_count: { type: Number, min: 1, required: true },
  price: { type: Number, min: 0, required: true },

  trade_date: { type: Date, required: true },

  // optional enrichments
  source: String,   // 'broker_upload' | 'manual' | 'sync'
}, { timestamps: true });

// Compound index for efficient queries
TransactionSchema.index({ user_id: 1, isin: 1, trade_date: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);

