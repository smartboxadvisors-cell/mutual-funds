const mongoose = require('mongoose');

const masterRatingSchema = new mongoose.Schema(
  {
    isin: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    issuerName: {
      type: String,
      default: '',
      trim: true,
    },
    ratingRaw: {
      type: String,
      default: '',
      trim: true,
    },
    rating: {
      type: String,
      default: '',
      trim: true,
    },
    ratingGroup: {
      type: String,
      default: 'UNRATED',
      index: true,
      uppercase: true,
      trim: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MasterRating', masterRatingSchema);
