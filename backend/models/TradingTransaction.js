const mongoose = require('mongoose');

const tradingTransactionSchema = new mongoose.Schema(
  {
    exchange: {
      type: String,
      enum: ['BSE', 'NSE', 'UNKNOWN'],
      default: 'UNKNOWN',
      index: true,
    },
    serialNo: {
      type: String,
      default: '',
      trim: true,
    },
    isin: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    symbol: {
      type: String,
      trim: true,
      index: true,
    },
    issuerName: {
      type: String,
      trim: true,
    },
    coupon: {
      type: String,
      trim: true,
    },
    maturityDate: {
      type: Date,
    },
    tradeDate: {
      type: Date,
      index: true,
    },
    settlementType: {
      type: String,
      trim: true,
    },
    tradeAmountRaw: {
      type: String,
      trim: true,
    },
    tradeAmountValue: {
      type: Number,
      index: true,
    },
    tradePriceRaw: {
      type: String,
      trim: true,
    },
    tradePriceValue: {
      type: Number,
    },
    yieldRaw: {
      type: String,
      trim: true,
    },
    yieldValue: {
      type: Number,
    },
    tradeTime: {
      type: String,
      trim: true,
    },
    orderType: {
      type: String,
      trim: true,
      index: true,
    },
    settlementStatus: {
      type: String,
      trim: true,
    },
    settlementDate: {
      type: Date,
    },
    rating: {
      type: String,
      trim: true,
    },
    ratingGroup: {
      type: String,
      default: 'UNRATED',
      trim: true,
      uppercase: true,
      index: true,
    },
    masterRatingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterRating',
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    source: {
      fileName: {
        type: String,
        trim: true,
      },
      exchangeType: {
        type: String,
        trim: true,
      },
    },
    raw: {
      type: Object,
    },
  },
  {
    timestamps: true,
  }
);

tradingTransactionSchema.index({ ratingGroup: 1, tradeDate: -1 });
tradingTransactionSchema.index({ isin: 1, tradeDate: -1 });

module.exports = mongoose.model('TradingTransaction', tradingTransactionSchema);
