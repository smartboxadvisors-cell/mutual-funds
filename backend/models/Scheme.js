// models/Scheme.js
const mongoose = require('mongoose');

const schemeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    index: true
  },
  reportDate: {
    type: Date,
    required: true,
    index: true
  },
  originalFilename: {
    type: String
  }
}, { 
  timestamps: true,
  // Create compound index for upsert operations
  index: [
    { name: 1, reportDate: 1 }
  ]
});

// Create compound index for efficient queries
schemeSchema.index({ name: 1, reportDate: -1 });

module.exports = mongoose.model('Scheme', schemeSchema);
