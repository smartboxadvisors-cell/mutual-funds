const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  instrument_name: String,
  report_date: String,
  scheme_name: String,
  isin: String,
  _fileId: String,
  _fileName: String,
  _modifiedTime: Date,
  _rowIndex: Number,
  _sheetTitle: String,
  _source: String,
  market_value_lacs: Number,
  pct_to_nav: Number,
  quantity: Number,
  rating: String,
  ytm: Number,
}, { strict: false });

module.exports = mongoose.model('DriveImport', dataSchema, 'drive_imports');
