// routes/trading.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const router = express.Router();

// Configure multer for file uploads (use memory storage for Vercel)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept CSV and Excel files
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV (.csv) and Excel (.xlsx, .xls) files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// POST /api/trading/upload - Handle CSV and Excel file upload for trading data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileExt = path.extname(fileName).toLowerCase();

    let rawData = [];
    let exchangeType = 'UNKNOWN';
    let imported = 0;
    let duplicates = 0;

    // Parse based on file type
    if (fileExt === '.csv') {
      const parseResult = await parseCSVData(fileBuffer);
      rawData = parseResult.data;
      exchangeType = parseResult.exchangeType;
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      const parseResult = await parseExcelData(fileBuffer);
      rawData = parseResult.data;
      exchangeType = parseResult.exchangeType;
    } else {
      throw new Error('Unsupported file type');
    }

    console.log(`Detected exchange type: ${exchangeType}`);

    // Validate and transform data
    const results = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const transaction = transformRowToUnifiedTransaction(row, i + 1, exchangeType);

      if (transaction) {
        results.push(transaction);
      }
    }

    // Process transactions and update portfolio
    const portfolioUpdates = {};

    for (const transaction of results) {
      const { symbol, type, quantity, price } = transaction;

      if (!portfolioUpdates[symbol]) {
        portfolioUpdates[symbol] = {
          symbol,
          totalQuantity: 0,
          totalCost: 0,
          avgPrice: 0,
          transactions: []
        };
      }

      const position = portfolioUpdates[symbol];

      if (type === 'BUY') {
        // Add to position
        const newTotalQuantity = position.totalQuantity + quantity;
        const newTotalCost = position.totalCost + (quantity * price);

        position.totalQuantity = newTotalQuantity;
        position.totalCost = newTotalCost;
        position.avgPrice = newTotalQuantity > 0 ? newTotalCost / newTotalQuantity : 0;
      } else if (type === 'SELL') {
        // Reduce position
        position.totalQuantity = Math.max(0, position.totalQuantity - quantity);
        if (position.totalQuantity === 0) {
          position.totalCost = 0;
          position.avgPrice = 0;
        }
      }

      position.transactions.push(transaction);
      imported++;
    }

    // Count duplicates
    const seenTransactions = new Set();
    for (const transaction of results) {
      if (seenTransactions.has(transaction.transactionId)) {
        duplicates++;
      } else {
        seenTransactions.add(transaction.transactionId);
      }
    }

    res.json({
      success: true,
      imported,
      duplicates,
      totalProcessed: results.length,
      exchangeType,
      message: `Successfully imported ${imported} trades from ${exchangeType}, ${duplicates} duplicates skipped`,
      portfolioUpdates: Object.values(portfolioUpdates),
      transactions: results // Include transactions for display
    });

  } catch (error) {
    console.error('Trading upload error:', error);

    res.status(500).json({
      error: error.message || 'Failed to process file'
    });
  }
});

// Parse CSV data from buffer and detect exchange type
async function parseCSVData(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvData = buffer.toString();

    // Simple CSV parser for trading data format
    const lines = csvData.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      resolve({ data: [], exchangeType: 'UNKNOWN' });
      return;
    }

    // Detect exchange type from header
    const firstLine = lines[0].toLowerCase();
    let exchangeType = 'UNKNOWN';
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

    const bseScore = bsePatterns.reduce((score, pattern) => score + (firstLine.includes(pattern) ? 1 : 0), 0);
    const nseScore = nsePatterns.reduce((score, pattern) => score + (firstLine.includes(pattern) ? 1 : 0), 0);

    // Determine exchange type with improved logic
    if (bseScore >= 2) { // Lower threshold for BSE
      exchangeType = 'BSE';
      if (bsePatterns.some(pattern => firstLine.includes(pattern))) {
        startIndex = 1;
      }
    } else if (nseScore >= 1) { // Lower threshold for NSE
      exchangeType = 'NSE';
      if (nsePatterns.some(pattern => firstLine.includes(pattern))) {
        startIndex = 1;
      }
    } else {
      // Default to BSE if unclear, but log for debugging
      exchangeType = 'BSE';
      console.log(`Unclear exchange type for CSV, defaulting to BSE`);
      console.log(`Available patterns found: BSE=${bseScore}, NSE=${nseScore}`);
    }

    console.log(`CSV Exchange detection - BSE score: ${bseScore}, NSE score: ${nseScore}, Type: ${exchangeType}`);

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
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

          if (lowerHeader.includes('date') || lowerHeader.includes('trade date')) {
            nseData.date = columns[index]?.trim() || '';
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
          } else if (lowerHeader.includes('maturity')) {
            nseData.maturityDate = columns[index]?.trim() || '';
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
async function parseExcelData(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results = [];
  let exchangeType = 'UNKNOWN';

  // Process all sheets
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) continue;

    // Detect exchange type from first row
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

    const bseScore = bsePatterns.reduce((score, pattern) => score + (firstRow.some(cell => cell.includes(pattern)) ? 1 : 0), 0);
    const nseScore = nsePatterns.reduce((score, pattern) => score + (firstRow.some(cell => cell.includes(pattern)) ? 1 : 0), 0);

    // Determine exchange type with fallback logic
    if (bseScore >= 3) { // Require at least 3 BSE patterns
      exchangeType = 'BSE';
      if (bsePatterns.some(pattern => firstRow.some(cell => cell.includes(pattern)))) {
        startIndex = 1;
      }
    } else if (nseScore >= 2) { // Require at least 2 NSE patterns
      exchangeType = 'NSE';
      if (nsePatterns.some(pattern => firstRow.some(cell => cell.includes(pattern)))) {
        startIndex = 1;
      }
    } else {
      // Default to BSE if unclear
      exchangeType = 'BSE';
      console.log(`Unclear exchange type for sheet "${sheetName}", defaulting to BSE`);
    }

    console.log(`Excel Sheet "${sheetName}" - BSE score: ${bseScore}, NSE score: ${nseScore}, Type: ${exchangeType}`);
    console.log(`First row cells:`, firstRow);

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
            bseData.serialNo = String(row[index] || '').trim();
          } else if (lowerHeader.includes('isin')) {
            bseData.isin = String(row[index] || '').trim();
          } else if (lowerHeader.includes('symbol') || lowerHeader.includes('scrip')) {
            bseData.symbol = String(row[index] || '').trim();
          } else if (lowerHeader.includes('issuer') || lowerHeader.includes('company') || lowerHeader.includes('name')) {
            bseData.issuerName = String(row[index] || '').trim();
          } else if (lowerHeader.includes('coupon') || lowerHeader.includes('%') || lowerHeader.includes('rate')) {
            bseData.coupon = String(row[index] || '').trim();
          } else if (lowerHeader.includes('maturity')) {
            bseData.maturityDate = String(row[index] || '').trim();
          } else if (lowerHeader.includes('deal date') || lowerHeader.includes('date') || lowerHeader.includes('trade date')) {
            bseData.dealDate = String(row[index] || '').trim();
          } else if (lowerHeader.includes('settlement')) {
            bseData.settlementType = String(row[index] || '').trim();
          } else if (lowerHeader.includes('amount') || lowerHeader.includes('value') || lowerHeader.includes('trade amount')) {
            bseData.tradeAmount = String(row[index] || '').trim();
          } else if (lowerHeader.includes('price') || lowerHeader.includes('trade price')) {
            bseData.tradePrice = String(row[index] || '').trim();
          } else if (lowerHeader.includes('yield') || lowerHeader.includes('traded yield')) {
            bseData.yield = String(row[index] || '').trim();
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            bseData.tradeTime = String(row[index] || '').trim();
          } else if (lowerHeader.includes('order') || lowerHeader.includes('type')) {
            bseData.orderType = String(row[index] || '').trim();
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

          if (lowerHeader.includes('date') || lowerHeader.includes('trade date')) {
            nseData.date = String(row[index] || '').trim();
          } else if (lowerHeader.includes('seller') && lowerHeader.includes('deal')) {
            nseData.sellerDealType = String(row[index] || '').trim();
          } else if (lowerHeader.includes('buyer') && lowerHeader.includes('deal')) {
            nseData.buyerDealType = String(row[index] || '').trim();
          } else if (lowerHeader.includes('isin')) {
            nseData.isin = String(row[index] || '').trim();
          } else if (lowerHeader.includes('description') || lowerHeader.includes('security') || lowerHeader.includes('name')) {
            nseData.description = String(row[index] || '').trim();
          } else if (lowerHeader.includes('price') || lowerHeader.includes('rate')) {
            nseData.price = String(row[index] || '').trim();
          } else if (lowerHeader.includes('deal size') || lowerHeader.includes('size') || lowerHeader.includes('quantity') || lowerHeader.includes('qty')) {
            nseData.dealSize = String(row[index] || '').trim();
          } else if (lowerHeader.includes('settlement status') || lowerHeader.includes('status')) {
            nseData.settlementStatus = String(row[index] || '').trim();
          } else if (lowerHeader.includes('yield')) {
            nseData.yield = String(row[index] || '').trim();
          } else if (lowerHeader.includes('time') || lowerHeader.includes('trade time')) {
            nseData.tradeTime = String(row[index] || '').trim();
          } else if (lowerHeader.includes('settlement date') || lowerHeader.includes('settle date')) {
            nseData.settlementDate = String(row[index] || '').trim();
          } else if (lowerHeader.includes('maturity')) {
            nseData.maturityDate = String(row[index] || '').trim();
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

// Transform row data to unified transaction object (16 columns)
function transformRowToUnifiedTransaction(row, rowNumber, exchangeType) {
  try {
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

    if (exchangeType === 'BSE') {
      // BSE format mapping
      symbol = row.symbol || '';
      isin = row.isin || '';
      issuerName = row.issuerName || '';
      coupon = row.coupon || '';
      maturityDate = row.maturityDate || '';
      tradeDate = row.dealDate || '';
      settlementType = row.settlementType || '';
      tradeAmount = row.tradeAmount || '';
      tradePrice = row.tradePrice || '';
      yieldValue = row.yield || '';
      tradeTime = row.tradeTime || '';
      orderType = row.orderType || '';

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
        transactionId: `${symbol}_${tradeDate}_${orderType}_${tradeAmount}_${tradePrice}`
      };

    } else if (exchangeType === 'NSE') {
      // NSE format mapping
      isin = row.isin || '';
      issuerName = row.description || '';

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

      maturityDate = row.maturityDate || '';
      tradeDate = row.date || '';
      tradeAmount = row.dealSize || '';
      tradePrice = row.price || '';
      yieldValue = row.yield || '';
      tradeTime = row.tradeTime || '';
      settlementStatus = row.settlementStatus || '';
      settlementDate = row.settlementDate || '';

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
        transactionId: `${symbol}_${tradeDate}_${orderType}_${tradeAmount}_${tradePrice}`
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
