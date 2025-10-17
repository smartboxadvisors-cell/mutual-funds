// models/InstrumentHolding.js
const mongoose = require('mongoose');

const instrumentHoldingSchema = new mongoose.Schema({
  schemeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scheme',
    required: true,
    index: true
  },
  instrumentName: {
    type: String,
    required: true,
    index: true
  },
  instrumentType: {
    type: String,
    index: true // Category like "Debt Instruments", "Equity Instruments"
  },
  isin: {
    type: String,
    sparse: true // Allow null but index non-null values
  },
  quantity: {
    type: Number
  },
  marketValue: {
    type: Number // In lakhs as per PROJECT_PROMPT
  },
  navPercent: {
    type: Number // % to Net Assets
  },
  maturityDate: {
    type: Date
  },
  coupon: {
    type: Number
  },
  rating: {
    type: String
  },
  sector: {
    type: String
  },
  issuer: {
    type: String
  },
  reportDate: {
    type: Date,
    required: true, // Mandatory field
    index: true // Index for efficient filtering by date
  },
  other: {
    type: Object, // For additional fields like YTM, etc.
    default: {}
  }
}, { 
  timestamps: true 
});

// Create compound indexes for efficient queries
instrumentHoldingSchema.index({ schemeId: 1, instrumentType: 1 });
instrumentHoldingSchema.index({ schemeId: 1, instrumentName: 1 });
instrumentHoldingSchema.index({ isin: 1 });

module.exports = mongoose.model('InstrumentHolding', instrumentHoldingSchema);
