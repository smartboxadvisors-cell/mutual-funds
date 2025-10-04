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
    let imported = 0;
    let duplicates = 0;

    // Parse based on file type
    if (fileExt === '.csv') {
      rawData = await parseCSVData(fileBuffer);
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      rawData = await parseExcelData(fileBuffer);
    } else {
      throw new Error('Unsupported file type');
    }

    // Validate and transform data
    const results = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const transaction = transformRowToTransaction(row, i + 1);

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
      message: `Successfully imported ${imported} trades, ${duplicates} duplicates skipped`,
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

// Parse CSV data from buffer
async function parseCSVData(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvData = buffer.toString();

    // Simple CSV parser for trading data format
    const lines = csvData.split('\n').filter(line => line.trim());

    // Skip header row if present (check for common headers)
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    const headerPatterns = ['exchange', 'trade date', 'trade time', 'isin', 'issuer', 'maturity', 'amount', 'price', 'yield', 'status', 'deal type'];

    if (headerPatterns.some(pattern => firstLine.includes(pattern))) {
      startIndex = 1; // Skip header
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = parseCSVLine(line);
      if (columns.length >= 11) {
        results.push({
          exchange: columns[0]?.trim() || '',
          tradeDate: columns[1]?.trim() || '',
          tradeTime: columns[2]?.trim() || '',
          isin: columns[3]?.trim() || '',
          issuerDetails: columns[4]?.trim() || '',
          maturity: columns[5]?.trim() || '',
          amount: columns[6]?.trim() || '',
          price: columns[7]?.trim() || '',
          yield: columns[8]?.trim() || '',
          status: columns[9]?.trim() || '',
          dealType: columns[10]?.trim() || ''
        });
      }
    }

    resolve(results);
  });
}

// Parse Excel data from buffer
async function parseExcelData(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results = [];

  // Process all sheets
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) continue;

    // Skip header row if present
    let startIndex = 0;
    const firstRow = jsonData[0].map(cell => String(cell || '').toLowerCase());
    const headerPatterns = ['exchange', 'trade date', 'trade time', 'isin', 'issuer', 'maturity', 'amount', 'price', 'yield', 'status', 'deal type'];

    if (headerPatterns.some(pattern => firstRow.some(cell => cell.includes(pattern)))) {
      startIndex = 1; // Skip header
    }

    for (let i = startIndex; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length >= 11) {
        results.push({
          exchange: String(row[0] || '').trim(),
          tradeDate: String(row[1] || '').trim(),
          tradeTime: String(row[2] || '').trim(),
          isin: String(row[3] || '').trim(),
          issuerDetails: String(row[4] || '').trim(),
          maturity: String(row[5] || '').trim(),
          amount: String(row[6] || '').trim(),
          price: String(row[7] || '').trim(),
          yield: String(row[8] || '').trim(),
          status: String(row[9] || '').trim(),
          dealType: String(row[10] || '').trim()
        });
      }
    }
  }

  return results;
}

// Transform row data to transaction object
function transformRowToTransaction(row, rowNumber) {
  try {
    // Extract symbol from ISIN or issuer details
    let symbol = '';
    if (row.isin && row.isin.length >= 12) {
      // ISIN format: INE followed by 9 characters, last character is checksum
      symbol = row.isin.substring(3, 12); // Extract the 9-character company code
    } else if (row.issuerDetails) {
      // Fallback: extract from issuer details (take first word or common patterns)
      const issuer = row.issuerDetails.toUpperCase();
      // Look for common stock symbols in issuer name
      const words = issuer.split(/\s+/);
      symbol = words.find(word => word.length >= 3 && word.length <= 10 && !word.includes('LTD') && !word.includes('CORP')) || words[0];
    }

    if (!symbol) {
      console.log(`Skipping row ${rowNumber}: No symbol found`);
      return null;
    }

    // Parse amount (could be quantity or amount)
    const amountStr = row.amount.replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      console.log(`Skipping row ${rowNumber}: Invalid amount`);
      return null;
    }

    // Parse price
    const priceStr = row.price.replace(/,/g, '');
    const price = parseFloat(priceStr);

    if (isNaN(price) || price <= 0) {
      console.log(`Skipping row ${rowNumber}: Invalid price`);
      return null;
    }

    // Determine transaction type from deal type or status
    let type = 'BUY'; // Default
    const dealType = row.dealType?.toUpperCase() || '';
    const status = row.status?.toUpperCase() || '';

    if (dealType.includes('SELL') || status.includes('SELL')) {
      type = 'SELL';
    } else if (dealType.includes('BUY') || status.includes('BUY')) {
      type = 'BUY';
    }

    // Parse date
    const tradeDate = row.tradeDate || new Date().toISOString().split('T')[0];

    // Create unique transaction ID
    const transactionId = `${symbol}_${tradeDate}_${type}_${amount}_${price}`;

    return {
      date: tradeDate,
      symbol: symbol.trim(),
      type,
      quantity: Math.floor(amount), // Use amount as quantity for now
      price,
      amount: amount,
      isin: row.isin,
      issuerDetails: row.issuerDetails,
      maturity: row.maturity,
      yield: row.yield,
      status: row.status,
      dealType: row.dealType,
      transactionId
    };

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
