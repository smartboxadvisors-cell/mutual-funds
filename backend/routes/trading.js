// routes/trading.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const MasterRating = require('../models/MasterRating');
const InstrumentHolding = require('../models/InstrumentHolding');
const TradingTransaction = require('../models/TradingTransaction');
const router = express.Router();

// Configure multer for file uploads (use memory storage for Vercel)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept CSV and Excel files (including XLSM with macros)
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.xlsm'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV (.csv) and Excel (.xlsx, .xls, .xlsm) files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const RATING_GROUPS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B'];

let masterRatings = {};
let masterRatingMeta = {};
let masterRatingsLoadedAt = null;
let holdingRatings = {};
let holdingRatingMeta = {};
let holdingRatingsLoadedAt = null;

function normalizeIsin(value = '') {
  return String(value || '').trim().toUpperCase();
}

function computeRatingGroup(input) {
  if (!input) return 'UNRATED';
  const normalized = String(input).toUpperCase();
  const tierMatch = normalized.match(/\b(AAA|AA[+\-]?|A[+\-]?|BBB[+\-]?|BB[+\-]?|B[+\-]?|CCC|CC|C|D)\b/);
  if (tierMatch) {
    const token = tierMatch[1].replace(/[+\-]/g, '');
    if (token.startsWith('AAA')) return 'AAA';
    if (token.startsWith('AA')) return 'AA';
    if (token.startsWith('BBB')) return 'BBB';
    if (token.startsWith('BB')) return 'BB';
    if (token.startsWith('B')) return 'B';
    if (token.startsWith('A')) return 'A';
  }
  const simpleMatch = normalized.match(/\b([A-D]{1,3})\b/);
  if (simpleMatch) {
    const token = simpleMatch[1];
    if (token.startsWith('AAA')) return 'AAA';
    if (token.startsWith('AA')) return 'AA';
    if (token.startsWith('BBB')) return 'BBB';
    if (token.startsWith('BB')) return 'BB';
    if (token.startsWith('B')) return 'B';
    if (token.startsWith('A')) return 'A';
  }
  return 'UNRATED';
}

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeRegex = (value) => new RegExp(escapeRegex(value), 'i');

function parseNumericValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value)
    .replace(/[^0-9.+-]/g, "")
    .trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDateValue(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + value * msPerDay);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value) .trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '/').replace(/-/g, '/');
  const dateMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dateMatch) {
    let [, dd, mm, yyyy, hh, min, sec] = dateMatch;
    let year = Number(yyyy);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    const month = Number(mm) - 1;
    const day = Number(dd);
    const hours = Number(hh || 0);
    const minutes = Number(min || 0);
    const seconds = Number(sec || 0);
    const candidate = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMasterRatingValue(raw) {
  if (!raw) return '';
  const formatted = String(raw)
    .split('()')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return formatted.join(' | ');
}

async function refreshMasterRatingsCache() {
  const documents = await MasterRating.find({}).lean();
  const ratingsMap = {};
  const metaMap = {};
  documents.forEach((doc) => {
    const isin = normalizeIsin(doc.isin);
    if (!isin) return;
    const ratingValue = doc.rating || doc.ratingRaw || '';
    ratingsMap[isin] = ratingValue;
    metaMap[isin] = {
      ratingGroup: doc.ratingGroup || computeRatingGroup(ratingValue),
      masterRatingId: doc._id,
      issuerName: doc.issuerName || '',
    };
  });
  masterRatings = ratingsMap;
  masterRatingMeta = metaMap;
  masterRatingsLoadedAt = new Date();
}

async function ensureMasterRatingsCache() {
  if (!masterRatingsLoadedAt) {
    await refreshMasterRatingsCache();
    return;
  }
  const ageMs = Date.now() - masterRatingsLoadedAt.getTime();
  if (ageMs > 10 * 60 * 1000) {
    await refreshMasterRatingsCache();
  }
}

async function refreshHoldingRatingsCache() {
  const documents = await InstrumentHolding.find({
    isin: { $exists: true, $ne: null, $ne: '' },
    rating: { $exists: true, $ne: null, $ne: '' },
  })
    .select({ isin: 1, rating: 1, issuer: 1, instrumentName: 1 })
    .lean();

  const ratingsMap = {};
  const metaMap = {};

  documents.forEach((doc) => {
    const isin = normalizeIsin(doc.isin);
    if (!isin) return;
    const ratingValue = String(doc.rating || '') .trim();
    if (!ratingValue) return;

    ratingsMap[isin] = ratingValue;
    metaMap[isin] = {
      ratingGroup: computeRatingGroup(ratingValue),
      issuerName: doc.issuer || doc.instrumentName || '',
    };
  });

  holdingRatings = ratingsMap;
  holdingRatingMeta = metaMap;
  holdingRatingsLoadedAt = new Date();
}

async function ensureHoldingRatingsCache() {
  if (!holdingRatingsLoadedAt) {
    await refreshHoldingRatingsCache();
    return;
  }
  const ageMs = Date.now() - holdingRatingsLoadedAt.getTime();
  if (ageMs > 10 * 60 * 1000) {
    await refreshHoldingRatingsCache();
  }
}

function getRatingDetailsForIsin(isin) {
  const normalized = normalizeIsin(isin);
  let rating = masterRatings[normalized] || '';
  let meta = masterRatingMeta[normalized] || {};

  if (!rating) {
    rating = holdingRatings[normalized] || '';
    meta = holdingRatingMeta[normalized] || meta;
  }

  return {
    rating,
    ratingGroup: meta.ratingGroup || computeRatingGroup(rating),
    masterRatingId: meta.masterRatingId || null,
    issuerName: meta.issuerName || '',
  };
}

// POST /api/trading/upload - Handle CSV and Excel file upload for trading data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const originalFileName = req.file.originalname;
    const fileName = originalFileName.toLowerCase();
    const fileExt = path.extname(fileName).toLowerCase();

    console.log('=================================================');
    console.log(`📁 Original File Name: ${originalFileName}`);
    console.log(`📁 Lowercase File Name: ${fileName}`);
    console.log('=================================================');

    let rawData = [];
    let exchangeType = 'UNKNOWN';
    let duplicates = 0;

    // Detect exchange type from filename ONLY - priority to exact match
    if (fileName.startsWith('nse')) {
      exchangeType = 'NSE';
      console.log(`✅ Exchange type detected from filename START: NSE`);
    } else if (fileName.startsWith('bse')) {
      exchangeType = 'BSE';
      console.log(`✅ Exchange type detected from filename START: BSE`);
    } else if (fileName.includes(' nse ') || fileName.includes('_nse_')) {
      exchangeType = 'NSE';
      console.log(`✅ Exchange type detected from filename CONTAINS: NSE`);
    } else if (fileName.includes(' bse ') || fileName.includes('_bse_')) {
      exchangeType = 'BSE';
      console.log(`✅ Exchange type detected from filename CONTAINS: BSE`);
    }
    
    console.log(`🔍 Final Exchange Type Before Parsing: ${exchangeType}`);

    // Parse based on file type - FORCE exchange type from filename, DON'T override
    if (fileExt === '.csv') {
      const parseResult = await parseCSVData(fileBuffer, exchangeType);
      rawData = parseResult.data;
      // ONLY use parsed exchange type if we couldn't detect from filename
      if (exchangeType === 'UNKNOWN') {
        exchangeType = parseResult.exchangeType;
        console.log(`⚠️ Exchange type from CSV content: ${exchangeType}`);
      } else {
        console.log(`✅ Keeping filename-detected exchange type: ${exchangeType}`);
      }
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      const parseResult = await parseExcelData(fileBuffer, exchangeType);
      rawData = parseResult.data;
      // ONLY use parsed exchange type if we couldn't detect from filename
      if (exchangeType === 'UNKNOWN') {
        exchangeType = parseResult.exchangeType;
        console.log(`⚠️ Exchange type from Excel content: ${exchangeType}`);
      } else {
        console.log(`✅ Keeping filename-detected exchange type: ${exchangeType}`);
      }
    } else {
      throw new Error('Unsupported file type');
    }

    console.log(`🎯 FINAL Exchange Type for Processing: ${exchangeType}`);

    // Validate and transform data
    const results = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const transaction = transformRowToUnifiedTransaction(row, i + 1, exchangeType);

      if (transaction) {
        results.push(transaction);
      }
    }

    await ensureMasterRatingsCache();
    await ensureHoldingRatingsCache();

    const now = new Date();
    const seenTransactions = new Set();
    const transactionsForResponse = [];
    const bulkOps = [];
    let duplicatesWithinFile = 0;

    for (const transaction of results) {
      const transactionKey = transaction.transactionId;
      if (!transactionKey) {
        console.log(`Skipping transaction without transactionId at row ${transaction.serialNo || 'unknown'}`);
        continue;
      }

      if (seenTransactions.has(transactionKey)) {
        duplicatesWithinFile++;
        continue;
      }
      seenTransactions.add(transactionKey);

      const transactionExchange = transaction.exchange || exchangeType;
      const normalizedIsin = normalizeIsin(transaction.isin);
      transaction.isin = normalizedIsin;

      const ratingDetails = getRatingDetailsForIsin(normalizedIsin);
      if (!transaction.rating && ratingDetails.rating) {
        transaction.rating = ratingDetails.rating;
      }
      transaction.ratingGroup = ratingDetails.ratingGroup;
      transaction.masterRatingId = ratingDetails.masterRatingId;

      const tradeDateValue = parseDateValue(transaction.tradeDate);
      const maturityDateValue = parseDateValue(transaction.maturityDate);
      const settlementDateValue = parseDateValue(transaction.settlementDate);
      let tradeAmountValue = parseNumericValue(transaction.tradeAmount);
      if (typeof tradeAmountValue === 'number' && Number.isFinite(tradeAmountValue)) {
        if (transactionExchange === 'NSE' && tradeAmountValue > 1000) {
          tradeAmountValue = tradeAmountValue / 100000;
        }
      } else {
        tradeAmountValue = null;
      }
      const tradePriceValue = parseNumericValue(transaction.tradePrice);
      const yieldValue = parseNumericValue(transaction.yield);

      const updatePayload = {
        exchange: transactionExchange,
        serialNo: transaction.serialNo || '',
        isin: normalizedIsin,
        symbol: transaction.symbol || '',
        issuerName: transaction.issuerName || ratingDetails.issuerName || '',
        coupon: transaction.coupon || '',
        maturityDate: maturityDateValue,
        tradeDate: tradeDateValue,
        settlementType: transaction.settlementType || '',
        tradeAmountRaw: transaction.tradeAmount || '',
        tradeAmountValue,
        tradePriceRaw: transaction.tradePrice || '',
        tradePriceValue,
        yieldRaw: transaction.yield || '',
        yieldValue,
        tradeTime: transaction.tradeTime || '',
        orderType: transaction.orderType || '',
        settlementStatus: transaction.settlementStatus || '',
        settlementDate: settlementDateValue,
        rating: transaction.rating || '',
        ratingGroup: transaction.ratingGroup || computeRatingGroup(transaction.rating),
        masterRatingId: ratingDetails.masterRatingId || null,
        source: {
          fileName: originalFileName,
          exchangeType,
        },
        raw: transaction,
        updatedAt: now,
      };

      bulkOps.push({
        updateOne: {
          filter: { transactionId: transaction.transactionId },
          update: {
            $set: updatePayload,
            $setOnInsert: {
              createdAt: now,
              transactionId: transaction.transactionId,
            },
          },
          upsert: true,
        },
      });

      transactionsForResponse.push(transaction);
    }

    let bulkResult = {
      upsertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
    };

    if (bulkOps.length > 0) {
      bulkResult = await TradingTransaction.bulkWrite(bulkOps, { ordered: false });
    }

    const matchedCount = bulkResult.matchedCount || 0;
    const modifiedCount = bulkResult.modifiedCount || 0;
    const upsertedCount = bulkResult.upsertedCount || 0;
    const duplicatesFromDatabase = Math.max(0, matchedCount - modifiedCount);
    duplicates = duplicatesWithinFile + duplicatesFromDatabase;

    res.json({
      success: true,
      imported: upsertedCount,
      updated: modifiedCount,
      duplicates,
      totalProcessed: results.length,
      exchangeType,
      message: `Stored ${upsertedCount} new trades from ${exchangeType}, updated ${modifiedCount}, ${duplicates} duplicates skipped`,
      transactions: transactionsForResponse
    });

  } catch (error) {
    console.error('Trading upload error:', error);

    res.status(500).json({
      error: error.message || 'Failed to process file'
    });
  }
});

// Parse CSV data from buffer and detect exchange type
async function parseCSVData(buffer, detectedExchange = 'UNKNOWN') {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvData = buffer.toString();

    // Simple CSV parser for trading data format
    const lines = csvData.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      resolve({ data: [], exchangeType: detectedExchange !== 'UNKNOWN' ? detectedExchange : 'UNKNOWN' });
      return;
    }

    // Detect exchange type from header (only if not already detected from filename)
    const firstLine = lines[0].toLowerCase();
    let exchangeType = detectedExchange;
    let startIndex = 0;

    // Enhanced BSE Detection Patterns (more comprehensive)
    const bsePatterns = [
      'sr no', 's.no', 'serial', 'no', 'number', 'sl no', 'srl no',
      'symbol', 'scrip', 'security', 'security code',
      'issuer name', 'issuer', 'company', 'name', 'company name',
      'coupon', 'rate', '%', 'coupon rate', 'interest rate',
      'maturity', 'maturity date', 'mat date',
      'deal date', 'date', 'trade date', 'transaction date',
      'settlement', 'settlement type', 'settlement mode',
      'amount', 'trade amount', 'value', 'amount (rs)', 'face value',
      'price', 'trade price', 'rate', 'price (rs)',
      'yield', 'traded yield', 'yield (%)', 'ytm',
      'time', 'trade time', 'transaction time',
      'order', 'order type', 'type', 'buy/sell'
    ];

    // Enhanced NSE Detection Patterns
    const nsePatterns = [
      'seller deal type', 'seller', 'seller type', 'seller deal',
      'buyer deal type', 'buyer', 'buyer type', 'buyer deal',
      'description', 'security description', 'security name', 'instrument',
      'deal size', 'size', 'quantity', 'qty', 'volume',
      'settlement status', 'status', 'settled', 'settlement',
      'settlement date', 'settle date', 'settlement dt'
    ];

    // Only detect from content if not already detected from filename
    if (exchangeType === 'UNKNOWN') {
      const bseScore = bsePatterns.reduce((score, pattern) => score + (firstLine.includes(pattern) ? 1 : 0), 0);
      const nseScore = nsePatterns.reduce((score, pattern) => score + (firstLine.includes(pattern) ? 1 : 0), 0);

      // Determine exchange type with improved logic
      if (bseScore >= 2) {
        exchangeType = 'BSE';
      } else if (nseScore >= 1) {
        exchangeType = 'NSE';
      } else {
        exchangeType = 'BSE';
        console.log(`Unclear exchange type for CSV, defaulting to BSE`);
        console.log(`Available patterns found: BSE=${bseScore}, NSE=${nseScore}`);
      }

      console.log(`CSV Exchange detection - BSE score: ${bseScore}, NSE score: ${nseScore}, Type: ${exchangeType}`);
    }

    // Detect if first line is header
    if (bsePatterns.some(pattern => firstLine.includes(pattern)) || nsePatterns.some(pattern => firstLine.includes(pattern))) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i] .trim();
      if (!line) continue;

      const columns = parseCSVLine(line);

      if (exchangeType === 'BSE') {
        // BSE format - flexible column mapping
        const bseData = {};

        // Map columns based on header patterns
        const headers = lines[0].toLowerCase().split(',');
        headers.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();

          if (lowerHeader.includes('sr no') || lowerHeader.includes('s.no') || lowerHeader.includes('serial') || lowerHeader.includes('no')) {
            bseData.serialNo = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('isin')) {
            bseData.isin = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('symbol') || lowerHeader.includes('scrip')) {
            bseData.symbol = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('issuer') || lowerHeader.includes('company') || lowerHeader.includes('name')) {
            bseData.issuerName = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('coupon') || lowerHeader.includes('%') || lowerHeader.includes('rate')) {
            bseData.coupon = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('maturity')) {
            bseData.maturityDate = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('deal date') || lowerHeader.includes('date') || lowerHeader.includes('trade date')) {
            bseData.dealDate = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('settlement')) {
            bseData.settlementType = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('amount') || lowerHeader.includes('value') || lowerHeader.includes('trade amount')) {
            bseData.tradeAmount = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('price') || lowerHeader.includes('trade price')) {
            bseData.tradePrice = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('yield') || lowerHeader.includes('traded yield')) {
            bseData.yield = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            bseData.tradeTime = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('order') || lowerHeader.includes('type')) {
            bseData.orderType = columns[index]?.trim() || '';
          }
        });

        // Only add if we have minimum required fields
        if (bseData.isin && (bseData.symbol || bseData.issuerName)) {
          results.push(bseData);
        } else {
          console.log(`Skipping BSE CSV row ${i + 1}: Missing required fields (ISIN and Symbol/Issuer)`);
        }
      } else if (exchangeType === 'NSE') {
        // NSE format - flexible column mapping
        const nseData = {};

        // Map columns based on header patterns
        const headers = lines[0].toLowerCase().split(',');
        headers.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();

          if (lowerHeader.includes('maturity')) {
            nseData.maturityDate = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('seller') && lowerHeader.includes('deal')) {
            nseData.sellerDealType = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('buyer') && lowerHeader.includes('deal')) {
            nseData.buyerDealType = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('isin')) {
            nseData.isin = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('description') || lowerHeader.includes('security') || lowerHeader.includes('name')) {
            nseData.description = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('price') || lowerHeader.includes('rate')) {
            nseData.price = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('deal size') || lowerHeader.includes('size') || lowerHeader.includes('quantity') || lowerHeader.includes('qty')) {
            nseData.dealSize = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('settlement status') || lowerHeader.includes('status')) {
            nseData.settlementStatus = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('yield')) {
            nseData.yield = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            nseData.tradeTime = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('settlement date') || lowerHeader.includes('settle date')) {
            nseData.settlementDate = columns[index]?.trim() || '';
          } else if (lowerHeader.includes('deal date') || lowerHeader.includes('trade date') || (lowerHeader.includes('date') && !lowerHeader.includes('settlement'))) {
            nseData.date = columns[index]?.trim() || '';
          }
        });

        // Only add if we have minimum required fields
        if (nseData.isin && nseData.description) {
          results.push(nseData);
        } else {
          console.log(`Skipping NSE CSV row ${i + 1}: Missing required fields (ISIN and Description)`);
        }
      }
    }

    resolve({ data: results, exchangeType });
  });
}

// Parse Excel data from buffer and detect exchange type
async function parseExcelData(buffer, detectedExchange = 'UNKNOWN') {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results = [];
  let exchangeType = detectedExchange;

  // Process all sheets
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) continue;

    // Detect exchange type from first row (only if not already detected from filename)
    const firstRow = jsonData[0].map(cell => String(cell || '').toLowerCase());
    let startIndex = 0;

    // Enhanced BSE Detection Patterns (more flexible)
    const bsePatterns = [
      'sr no', 's.no', 'serial', 'no', 'number',
      'symbol', 'scrip', 'security',
      'issuer name', 'issuer', 'company', 'name',
      'coupon', 'rate', '%',
      'maturity', 'maturity date',
      'deal date', 'date', 'trade date',
      'settlement', 'settlement type',
      'amount', 'trade amount', 'value',
      'price', 'trade price', 'rate',
      'yield', 'traded yield',
      'time', 'trade time',
      'order', 'order type', 'type'
    ];

    // Enhanced NSE Detection Patterns
    const nsePatterns = [
      'seller deal type', 'seller', 'seller type',
      'buyer deal type', 'buyer', 'buyer type',
      'description', 'security description', 'security name',
      'deal size', 'size', 'quantity', 'qty',
      'settlement status', 'status', 'settled',
      'settlement date', 'settle date'
    ];

    // Only detect from content if not already detected from filename
    if (exchangeType === 'UNKNOWN') {
      const bseScore = bsePatterns.reduce((score, pattern) => score + (firstRow.some(cell => cell.includes(pattern)) ? 1 : 0), 0);
      const nseScore = nsePatterns.reduce((score, pattern) => score + (firstRow.some(cell => cell.includes(pattern)) ? 1 : 0), 0);

      // Determine exchange type with fallback logic
      if (bseScore >= 3) {
        exchangeType = 'BSE';
      } else if (nseScore >= 2) {
        exchangeType = 'NSE';
      } else {
        exchangeType = 'BSE';
        console.log(`Unclear exchange type for sheet "${sheetName}", defaulting to BSE`);
      }

      console.log(`Excel Sheet "${sheetName}" - BSE score: ${bseScore}, NSE score: ${nseScore}, Type: ${exchangeType}`);
      console.log(`First row cells:`, firstRow);
    }

    // Detect if first row is header
    if (bsePatterns.some(pattern => firstRow.some(cell => cell.includes(pattern))) || 
        nsePatterns.some(pattern => firstRow.some(cell => cell.includes(pattern)))) {
      startIndex = 1;
    }

    for (let i = startIndex; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      if (exchangeType === 'BSE') {
        // BSE format - flexible column mapping
        const bseData = {};

        // Map columns based on header patterns (more flexible approach)
        firstRow.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();

          if (lowerHeader.includes('sr no') || lowerHeader.includes('s.no') || lowerHeader.includes('serial') || lowerHeader.includes('no')) {
            bseData.serialNo = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('isin')) {
            bseData.isin = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('symbol') || lowerHeader.includes('scrip')) {
            bseData.symbol = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('issuer') || lowerHeader.includes('company') || lowerHeader.includes('name')) {
            bseData.issuerName = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('coupon') || lowerHeader.includes('%') || lowerHeader.includes('rate')) {
            bseData.coupon = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('maturity')) {
            bseData.maturityDate = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('deal date') || lowerHeader.includes('date') || lowerHeader.includes('trade date')) {
            bseData.dealDate = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('settlement')) {
            bseData.settlementType = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('amount') || lowerHeader.includes('value') || lowerHeader.includes('trade amount')) {
            bseData.tradeAmount = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('price') || lowerHeader.includes('trade price')) {
            bseData.tradePrice = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('yield') || lowerHeader.includes('traded yield')) {
            bseData.yield = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            bseData.tradeTime = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('order') || lowerHeader.includes('type')) {
            bseData.orderType = String(row[index] || '') .trim();
          }
        });

        // Only add if we have minimum required fields
        if (bseData.isin && (bseData.symbol || bseData.issuerName)) {
          results.push(bseData);
        } else {
          console.log(`Skipping BSE row ${i + 1}: Missing required fields (ISIN and Symbol/Issuer)`);
        }
      } else if (exchangeType === 'NSE') {
        // NSE format - flexible column mapping
        const nseData = {};

        // Map columns based on header patterns
        firstRow.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();

          if (lowerHeader.includes('maturity')) {
            nseData.maturityDate = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('seller') && lowerHeader.includes('deal')) {
            nseData.sellerDealType = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('buyer') && lowerHeader.includes('deal')) {
            nseData.buyerDealType = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('isin')) {
            nseData.isin = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('description') || lowerHeader.includes('security') || lowerHeader.includes('name')) {
            nseData.description = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('price') || lowerHeader.includes('rate')) {
            nseData.price = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('deal size') || lowerHeader.includes('size') || lowerHeader.includes('quantity') || lowerHeader.includes('qty')) {
            nseData.dealSize = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('settlement status') || lowerHeader.includes('status')) {
            nseData.settlementStatus = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('yield')) {
            nseData.yield = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            nseData.tradeTime = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('settlement date') || lowerHeader.includes('settle date')) {
            nseData.settlementDate = String(row[index] || '') .trim();
          } else if (lowerHeader.includes('deal date') || lowerHeader.includes('trade date') || (lowerHeader.includes('date') && !lowerHeader.includes('settlement'))) {
            nseData.date = String(row[index] || '') .trim();
          }
        });

        // Only add if we have minimum required fields
        if (nseData.isin && nseData.description) {
          results.push(nseData);
        } else {
          console.log(`Skipping NSE row ${i + 1}: Missing required fields (ISIN and Description)`);
        }
      }
    }
  }

  return { data: results, exchangeType };
}

// Helper function to format trade time for BSE (convert decimal to HH:MM:SS)
function formatBSETradeTime(timeValue) {
  if (!timeValue) return '';
  
  // If it's a decimal (Excel time format)
  if (typeof timeValue === 'number' && timeValue < 1) {
    const totalSeconds = Math.round(timeValue * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  // If it's already a string in HH:MM or HH:MM:SS format
  const timeStr = String(timeValue) .trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    if (timeStr.split(':').length === 2) {
      return `${timeStr}:00`;
    }
    return timeStr;
  }
  
  return timeStr;
}

// Helper function to format maturity/trade date (convert to DD/MM/YYYY)
function formatMaturityDate(dateValue) {
  if (!dateValue && dateValue !== 0) return '';

  const convertExcel = (serial) => {
    const num = Number(serial);
    if (Number.isNaN(num)) return null;
    const whole = Math.floor(num);
    if (whole <= 59 || whole >= 2958465) return null;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + whole * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const directNumber = convertExcel(dateValue);
  if (directNumber) {
    const dd = String(directNumber.getUTCDate()).padStart(2, '0');
    const mm = String(directNumber.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = directNumber.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const dateStr = String(dateValue) .trim();
  if (!dateStr) return '';

  const normalized = dateStr.replace(/[-.]/g, '/');
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,5})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) {
      const shortYear = Number(y);
      y = String(shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear);
    }
    const dayNum = Number(d);
    const monthNum = Number(m);
    const yearNum = Number(y);

    if (!Number.isNaN(yearNum) && yearNum > 4000) {
      const serialDate = convertExcel(yearNum);
      if (serialDate) {
        const dd = String(serialDate.getUTCDate()).padStart(2, '0');
        const mm = String(serialDate.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = serialDate.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    }

    if (
      Number.isFinite(dayNum) &&
      Number.isFinite(monthNum) &&
      Number.isFinite(yearNum) &&
      monthNum >= 1 &&
      monthNum <= 12
    ) {
      return `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${String(yearNum).padStart(4, '0')}`;
    }
  }

  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const fallback = convertExcel(dateStr);
  if (fallback) {
    const dd = String(fallback.getUTCDate()).padStart(2, '0');
    const mm = String(fallback.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = fallback.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return dateStr;
}

// Helper function to format NSE trade time (remove date, keep only time)
function formatNSETradeTime(dateTimeValue) {
  if (!dateTimeValue) return '';
  
  const dateTimeStr = String(dateTimeValue) .trim();
  
  // Pattern: DD-MM-YYYY HH:MM:SS or similar
  const match = dateTimeStr.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\s+(\d{1,2}:\d{2}:\d{2})/);
  if (match) {
    return match[2]; // Return only the time part
  }
  
  // If it's already just time
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(dateTimeStr)) {
    return dateTimeStr;
  }
  
  return dateTimeStr;
}

// Transform row data to unified transaction object (16 columns)
function transformRowToUnifiedTransaction(row, rowNumber, exchangeType) {
  try {
    console.log(`🔄 Transforming row ${rowNumber} for exchange: ${exchangeType}`);
    console.log('Raw row data:', JSON.stringify(row, null, 2));
    
    let symbol = '';
    let tradeDate = '';
    let tradeTime = '';
    let isin = '';
    let issuerName = '';
    let coupon = '';
    let maturityDate = '';
    let settlementType = '';
    let tradeAmount = '';
    let tradePrice = '';
    let yieldValue = '';
    let orderType = '';
    let settlementStatus = '';
    let settlementDate = '';
    let rating = '';

    if (exchangeType === 'BSE') {
      // BSE format mapping
      symbol = String(row.symbol || '') .trim();
      isin = normalizeIsin(row.isin || '');
      issuerName = String(row.issuerName || '') .trim();
      coupon = String(row.coupon || '') .trim();
      maturityDate = formatMaturityDate(row.maturityDate || '');
      tradeDate = formatMaturityDate(row.dealDate || '');
      settlementType = String(row.settlementType || '') .trim();
      tradeAmount = String(row.tradeAmount || '') .trim();
      tradePrice = String(row.tradePrice || '') .trim();
      yieldValue = String(row.yield || '') .trim();
      tradeTime = formatBSETradeTime(row.tradeTime || '');
      orderType = String(row.orderType || '') .trim();
      
      // Get rating from master/holdings
      rating = masterRatings[isin] || holdingRatings[isin] || '';

      console.log(`BSE Data - Amount: ${tradeAmount}, Price: ${tradePrice}, Time: ${tradeTime}, Maturity: ${maturityDate}, Rating: ${rating}`);

      // For BSE, use provided serial number or calculate
      const serialNo = row.serialNo || rowNumber.toString();

      return {
        exchange: 'BSE',
        serialNo,
        isin,
        symbol,
        issuerName,
        coupon,
        maturityDate,
        tradeDate,
        settlementType,
        tradeAmount,
        tradePrice,
        yield: yieldValue,
        tradeTime,
        orderType,
        settlementStatus: '-',
        settlementDate: '-',
        rating,
        transactionId: `BSE-${symbol}_${tradeDate}_${orderType}_${tradeAmount}_${tradePrice}`
      };

    } else if (exchangeType === 'NSE') {
      // NSE format mapping
      isin = normalizeIsin(row.isin || '');
      issuerName = String(row.description || '') .trim();

      // Extract symbol from description for NSE
      if (issuerName) {
        // Look for patterns like "Company Name 7.25% 2025"
        const match = issuerName.match(/^(.+?)\s+\d+\.\d+%\s+\d{4}/);
        if (match) {
          const companyPart = match[1];
          // Extract symbol from company name
          const words = companyPart.split(/\s+/);
          symbol = words.find(word => word.length >= 3 && word.length <= 10 && !word.includes('LTD') && !word.includes('CORP')) || words[0] || '';
        } else {
          // Fallback: take first significant word
          const words = issuerName.split(/\s+/);
          symbol = words.find(word => word.length >= 3 && word.length <= 10) || words[0] || '';
        }
      }

      maturityDate = formatMaturityDate(row.maturityDate || '');
      tradeDate = formatMaturityDate(row.date || '');
      tradeAmount = String(row.dealSize || '') .trim();
      tradePrice = String(row.price || '') .trim();
      yieldValue = String(row.yield || '') .trim();
      tradeTime = formatNSETradeTime(row.tradeTime || '');
      settlementStatus = String(row.settlementStatus || '') .trim();
      settlementDate = formatMaturityDate(row.settlementDate || '');
      
      // Get rating from master/holdings
      rating = masterRatings[isin] || holdingRatings[isin] || '';

      console.log(`NSE Data - Amount: ${tradeAmount}, Price: ${tradePrice}, Time: ${tradeTime}, Maturity: ${maturityDate}, Rating: ${rating}`);

      // Determine order type from deal types
      const sellerDealType = row.sellerDealType?.toUpperCase() || '';
      const buyerDealType = row.buyerDealType?.toUpperCase() || '';

      if (buyerDealType.includes('BUY') || sellerDealType.includes('SELL')) {
        orderType = 'BUY';
      } else if (sellerDealType.includes('BUY') || buyerDealType.includes('SELL')) {
        orderType = 'SELL';
      } else {
        orderType = 'BUY'; // Default
      }

      // Settlement type from deal types
      settlementType = `${sellerDealType}-${buyerDealType}`;

      return {
        exchange: 'NSE',
        serialNo: rowNumber.toString(), // Calculated for NSE
        isin,
        symbol,
        issuerName,
        coupon: '-', // Not available in NSE format
        maturityDate,
        tradeDate,
        settlementType,
        tradeAmount,
        tradePrice,
        yield: yieldValue,
        tradeTime,
        orderType,
        settlementStatus,
        settlementDate,
        rating,
        transactionId: `NSE-${symbol}_${tradeDate}_${orderType}_${tradeAmount}_${tradePrice}`
      };

    } else {
      console.log(`Skipping row ${rowNumber}: Unknown exchange type ${exchangeType}`);
      return null;
    }

  } catch (error) {
    console.log(`Error processing row ${rowNumber}:`, error);
    return null;
  }
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

// POST /api/trading/upload-master - Upload master list for ratings
router.post('/upload-master', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const originalFileName = req.file.originalname;
    const fileExt = path.extname(originalFileName).toLowerCase();

    if (!['.xlsx', '.xls'].includes(fileExt)) {
      return res.status(400).json({ error: 'Only Excel files (.xlsx, .xls) are allowed for master list' });
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!jsonData || jsonData.length <= 1) {
      return res.status(400).json({ error: 'No data rows found in master list' });
    }

    const headerRow = (jsonData[0] || []).map((cell) => String(cell || '').trim());
    const normalizedHeaders = headerRow.map((header) =>
      header.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
    );

    const findColumnIndex = (keywords, fallback) => {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const header = normalizedHeaders[i];
        if (keywords.some((keyword) => header.includes(keyword))) {
          return i;
        }
      }
      return typeof fallback === 'number' ? fallback : -1;
    };

    const isinIdx = findColumnIndex(['isin'], 0);
    const ratingIdx = findColumnIndex(['rating', 'creditrating'], 1);
    const issuerIdx = findColumnIndex(['issuer', 'name'], -1);

    if (isinIdx === -1 || ratingIdx === -1) {
      return res.status(400).json({ error: 'Master list must include ISIN and Rating columns' });
    }

    const now = new Date();
    const preparedRecords = [];

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row) continue;

      const rawIsin = row[isinIdx];
      const normalizedIsin = normalizeIsin(rawIsin);
      if (!normalizedIsin) continue;

      const rawRating = row[ratingIdx];
      const ratingRaw = String(rawRating || '') .trim();
      const ratingFormatted = formatMasterRatingValue(ratingRaw);
      const ratingGroup = computeRatingGroup(ratingFormatted || ratingRaw);

      const issuerName =
        issuerIdx !== -1 ? String(row[issuerIdx] || '').trim() : '';

      preparedRecords.push({
        isin: normalizedIsin,
        issuerName,
        ratingRaw,
        rating: ratingFormatted,
        ratingGroup,
        rowNumber: i + 1,
        metadata: { sourceFile: originalFileName, sheetName }
      });
    }

    if (preparedRecords.length === 0) {
      return res.status(400).json({ error: 'No valid ISIN rows found in master list' });
    }

    const isins = preparedRecords.map((record) => record.isin);
    const existingDocs = await MasterRating.find({ isin: { $in: isins } }).lean();
    const existingMap = {};
    existingDocs.forEach((doc) => {
      existingMap[doc.isin] = doc;
    });

    const bulkOps = [];
    const changedIsins = new Set();
    let skipped = 0;

    for (const record of preparedRecords) {
      const existing = existingMap[record.isin];
      const metadata = {
        ...(existing?.metadata || {}),
        sourceFile: record.metadata.sourceFile,
        sheetName: record.metadata.sheetName,
        rowNumber: record.rowNumber,
        lastImportedAt: now,
      };

      if (existing) {
        const hasChanges =
          (existing.ratingRaw || '') !== record.ratingRaw ||
          (existing.rating || '') !== record.rating ||
          (existing.ratingGroup || '') !== record.ratingGroup ||
          (existing.issuerName || '') !== record.issuerName;

        if (!hasChanges) {
          skipped++;
          continue;
        }
      }

      bulkOps.push({
        updateOne: {
          filter: { isin: record.isin },
          update: {
            $set: {
              issuerName: record.issuerName,
              ratingRaw: record.ratingRaw,
              rating: record.rating,
              ratingGroup: record.ratingGroup,
              metadata,
              lastSeenAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              isin: record.isin,
              createdAt: now,
            },
          },
          upsert: true,
        },
      });

      changedIsins.add(record.isin);
    }

    let bulkResult = {
      upsertedCount: 0,
      modifiedCount: 0,
    };

    if (bulkOps.length > 0) {
      bulkResult = await MasterRating.bulkWrite(bulkOps, { ordered: false });
    }

    if (changedIsins.size > 0) {
      const changedArray = Array.from(changedIsins);
      const updatedRatings = await MasterRating.find({ isin: { $in: changedArray } }).lean();
      const tradeUpdateOps = updatedRatings.map((doc) => {
        const ratingValue = doc.rating || doc.ratingRaw || '';
        return {
          updateMany: {
            filter: { isin: doc.isin },
            update: {
              $set: {
                rating: ratingValue,
                ratingGroup: doc.ratingGroup || computeRatingGroup(ratingValue),
                masterRatingId: doc._id,
              },
            },
          },
        };
      });
      if (tradeUpdateOps.length > 0) {
        await TradingTransaction.bulkWrite(tradeUpdateOps, { ordered: false });
      }
    }

    await refreshMasterRatingsCache();
    await refreshHoldingRatingsCache();

    const processedCount = preparedRecords.length;
    const inserted = bulkResult.upsertedCount || 0;
    const updated = bulkResult.modifiedCount || 0;
    const unchanged = Math.max(0, processedCount - inserted - updated);

    res.json({
      success: true,
      message: `Processed ${processedCount} rows from ${sheetName}. Inserted ${inserted}, updated ${updated}, unchanged ${unchanged}${skipped ? `, skipped ${skipped}` : ''}.`,
      processedCount,
      inserted,
      updated,
      unchanged,
      skipped,
      ratings: masterRatings,
    });

  } catch (error) {
    console.error('Master list upload error:', error);
    res.status(500).json({
      error: error.message || 'Failed to process master list'
    });
  }
});

// GET /api/trading/transactions - Fetch stored trades with filters
router.get('/transactions', async (req, res) => {
  try {
    const {
      rating,
      ratingGroup,
      date,
      startDate,
      endDate,
      exchange,
      tradeTime: tradeTimeFilter,
      isin,
      issuer,
      maturity,
      dealType,
      status,
      yield: yieldFilter,
      minAmt,
      maxAmt,
      minPrice,
      maxPrice,
      limit = '100',
      page = '1',
      sort = 'tradeDate',
      order = 'desc',
    } = req.query;

    const filters = {};
    const applied = {};

    const selectedRating = (ratingGroup || rating || '').toString() .trim();
    if (selectedRating) {
      const normalizedRating = selectedRating.toUpperCase();
      filters.ratingGroup = normalizedRating;
      applied.ratingGroup = normalizedRating;
    }

    const applyDateFilter = (value, bound) => {
      const parsed = parseDateValue(value);
      if (!parsed) return null;
      const dateCopy = new Date(parsed);
      if (bound === 'start') {
        dateCopy.setHours(0, 0, 0, 0);
      } else {
        dateCopy.setHours(23, 59, 59, 999);
      }
      return dateCopy;
    };

    if (date) {
      const start = applyDateFilter(date, 'start');
      const finish = applyDateFilter(date, 'end');
      if (start && finish) {
        filters.tradeDate = { $gte: start, $lte: finish };
        applied.date = {
          start: start.toISOString(),
          end: finish.toISOString(),
        };
      }
    } else {
      const start = applyDateFilter(startDate, 'start');
      const finish = applyDateFilter(endDate, 'end');
      if (start || finish) {
        filters.tradeDate = {};
        if (start) {
          filters.tradeDate.$gte = start;
        }
        if (finish) {
          filters.tradeDate.$lte = finish;
        }
        applied.dateRange = {
          ...(start ? { start: start.toISOString() } : {}),
          ...(finish ? { end: finish.toISOString() } : {}),
        };
      }
    }

    if (exchange) {
      const normalizedExchange = exchange.toString().trim().toUpperCase();
      filters.exchange = normalizedExchange;
      applied.exchange = normalizedExchange;
    }

    if (tradeTimeFilter) {
      const trimmed = tradeTimeFilter.toString() .trim();
      if (trimmed) {
        filters.tradeTime = { $regex: makeRegex(trimmed) };
        applied.tradeTime = trimmed;
      }
    }

    if (isin) {
      const trimmed = isin.toString().trim().toUpperCase();
      if (trimmed) {
        filters.isin = { $regex: makeRegex(trimmed) };
        applied.isin = trimmed;
      }
    }

    if (issuer) {
      const trimmed = issuer.toString() .trim();
      if (trimmed) {
        filters.issuerName = { $regex: makeRegex(trimmed) };
        applied.issuer = trimmed;
      }
    }

    if (dealType) {
      const trimmed = dealType.toString() .trim();
      if (trimmed) {
        filters.orderType = { $regex: makeRegex(trimmed) };
        applied.dealType = trimmed;
      }
    }

    if (status) {
      const trimmed = status.toString() .trim();
      if (trimmed) {
        filters.settlementStatus = { $regex: makeRegex(trimmed) };
        applied.status = trimmed;
      }
    }

    if (maturity) {
      const parsedMaturity = parseDateValue(maturity);
      if (parsedMaturity) {
        const startMaturity = new Date(parsedMaturity);
        startMaturity.setHours(0, 0, 0, 0);
        const endMaturity = new Date(parsedMaturity);
        endMaturity.setHours(23, 59, 59, 999);
        filters.maturityDate = { $gte: startMaturity, $lte: endMaturity };
        applied.maturity = {
          start: startMaturity.toISOString(),
          end: endMaturity.toISOString(),
        };
      }
    }

    if (yieldFilter) {
      const trimmed = yieldFilter.toString() .trim();
      const numericYield = parseNumericValue(trimmed);
      if (numericYield !== null) {
        const tolerance = 0.0000001;
        filters.yieldValue = {
          $gte: numericYield - tolerance,
          $lte: numericYield + tolerance,
        };
        applied.yield = numericYield;
      } else {
        filters.yieldRaw = { $regex: makeRegex(trimmed) };
        applied.yield = trimmed;
      }
    }

    const amountRange = {};
    const minAmountNumber = parseNumericValue(minAmt);
    const maxAmountNumber = parseNumericValue(maxAmt);
    if (minAmountNumber !== null) {
      amountRange.$gte = minAmountNumber;
      applied.minAmt = minAmountNumber;
    }
    if (maxAmountNumber !== null) {
      amountRange.$lte = maxAmountNumber;
      applied.maxAmt = maxAmountNumber;
    }
    if (Object.keys(amountRange).length > 0) {
      filters.tradeAmountValue = {
        ...(filters.tradeAmountValue || {}),
        ...amountRange,
      };
    }

    const priceRange = {};
    const minPriceNumber = parseNumericValue(minPrice);
    const maxPriceNumber = parseNumericValue(maxPrice);
    if (minPriceNumber !== null) {
      priceRange.$gte = minPriceNumber;
      applied.minPrice = minPriceNumber;
    }
    if (maxPriceNumber !== null) {
      priceRange.$lte = maxPriceNumber;
      applied.maxPrice = maxPriceNumber;
    }
    if (Object.keys(priceRange).length > 0) {
      filters.tradePriceValue = {
        ...(filters.tradePriceValue || {}),
        ...priceRange,
      };
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const sortableFields = {
      tradedate: 'tradeDate',
      tradeamount: 'tradeAmountValue',
      tradeamountvalue: 'tradeAmountValue',
      yield: 'yieldValue',
      yieldvalue: 'yieldValue',
      createdat: 'createdAt',
      updatedat: 'updatedAt',
    };

    const normalizedSort = sort.toString().toLowerCase();
    const sortField = sortableFields[normalizedSort] || 'tradeDate';
    const sortOrder = order === 'asc' ? 1 : -1;

    const [items, total, aggregateStats] = await Promise.all([
      TradingTransaction.find(filters)
        .sort({ [sortField]: sortOrder, tradeTime: sortOrder })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      TradingTransaction.countDocuments(filters),
      TradingTransaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ['$tradeAmountValue', 0] } },
            avgYield: { $avg: { $ifNull: ['$yieldValue', null] } },
            tradeCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = aggregateStats[0] || {
      totalAmount: 0,
      avgYield: null,
      tradeCount: 0,
    };

    const sanitizedItems = items.map((item) => {
      const { raw, ...rest } = item;
      return {
        ...rest,
        tradeDate: rest.tradeDate,
        settlementDate: rest.settlementDate,
        maturityDate: rest.maturityDate,
        raw,
      };
    });

    if (Object.keys(filters).length === 0) {
      applied.mode = 'LATEST';
    }

    res.json({
      success: true,
      page: parsedPage,
      perPage: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
      filtersApplied: applied,
      summary: {
        totalAmount: summary.totalAmount,
        avgYield: summary.avgYield,
        tradeCount: summary.tradeCount,
      },
      data: sanitizedItems,
      availableRatings: RATING_GROUPS,
    });
  } catch (error) {
    console.error('Trading transactions fetch error:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch transactions',
    });
  }
});

// GET /api/trading/portfolio - Get current portfolio (mock data for now)
router.get('/portfolio', async (req, res) => {
  try {
    // In a real app, this would fetch from database
    const mockPortfolio = [
      {
        symbol: 'RELIANCE',
        quantity: 100,
        avgPrice: 2450.50,
        currentPrice: 2480.75,
        totalValue: 248075
      },
      {
        symbol: 'TCS',
        quantity: 50,
        avgPrice: 3200.00,
        currentPrice: 3180.25,
        totalValue: 159012.50
      }
    ];

    res.json({
      success: true,
      portfolio: mockPortfolio,
      totalValue: mockPortfolio.reduce((sum, pos) => sum + pos.totalValue, 0)
    });

  } catch (error) {
    console.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

module.exports = router;
