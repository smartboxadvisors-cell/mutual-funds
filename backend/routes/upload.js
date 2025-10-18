// routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { parseExcelFile } = require('../utils/parseExcel');
const Scheme = require('../models/Scheme');
const InstrumentHolding = require('../models/InstrumentHolding');

// Configure multer for file uploads (use memory storage for Vercel)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept Excel files including XLSM (Excel with macros)
    const allowedTypes = ['.xlsx', '.xls', '.xlsm'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls, .xlsm) are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// POST /api/upload - Handle Excel file upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if reportDate is provided (MANDATORY)
    if (!req.body.reportDate || req.body.reportDate.trim() === '') {
      return res.status(400).json({ 
        error: 'Portfolio Report Date is required. Please select a date before uploading.' 
      });
    }

    // Use buffer from memory storage (Vercel-compatible)
    const fileBuffer = req.file.buffer;
    
    // Parse Excel file from buffer
    const parseResult = parseExcelFile(fileBuffer);
    
    // Use reportDate from form (MANDATORY - validated above)
    let finalReportDate;
    try {
      finalReportDate = new Date(req.body.reportDate);
      if (isNaN(finalReportDate.getTime())) {
        return res.status(400).json({ 
          error: 'Invalid date format. Please provide a valid date.' 
        });
      }
      console.log(`📅 Using user-provided report date: ${finalReportDate.toISOString()}`);
    } catch (e) {
      return res.status(400).json({ 
        error: 'Invalid date format. Please provide a valid date.' 
      });
    }
    
    // Create or update scheme (upsert by name + reportDate)
    const scheme = await Scheme.findOneAndUpdate(
      { 
        name: parseResult.schemeName,
        reportDate: finalReportDate
      },
      {
        name: parseResult.schemeName,
        reportDate: finalReportDate,
        originalFilename: req.file.originalname
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Delete previous holdings for same scheme (as per PROJECT_PROMPT)
    await InstrumentHolding.deleteMany({ schemeId: scheme._id });

    // Helper function to safely convert to number or null
    const safeNumber = (val) => {
      if (val === null || val === undefined || val === '') return null;
      
      // Handle string values with special characters
      if (typeof val === 'string') {
        // Remove percentage signs, commas, and whitespace
        const cleaned = val.trim().replace(/[%,\s]/g, '');
        if (cleaned === '' || cleaned === '-') return null;
        const num = Number(cleaned);
        return isNaN(num) ? null : num;
      }
      
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    // Helper function to convert Excel serial date to JavaScript Date
    const excelDateToJSDate = (excelSerial) => {
      if (!excelSerial) return null;
      
      // If it's already a Date object, return it
      if (excelSerial instanceof Date) {
        return isNaN(excelSerial.getTime()) ? null : excelSerial;
      }
      
      // If it's a string, try to parse it
      if (typeof excelSerial === 'string') {
        const parsed = new Date(excelSerial);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      
      // If it's a number, assume it's an Excel serial date
      if (typeof excelSerial === 'number') {
        // Excel stores dates as days since January 1, 1900
        // JavaScript Date uses milliseconds since January 1, 1970
        // Excel's epoch is December 30, 1899 (not Jan 1, 1900 due to a bug)
        const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
        const msPerDay = 24 * 60 * 60 * 1000;
        const jsDate = new Date(excelEpoch.getTime() + (excelSerial * msPerDay));
        return isNaN(jsDate.getTime()) ? null : jsDate;
      }
      
      return null;
    };

    // Insert all parsed holdings
    const holdings = parseResult.data.map(item => ({
      schemeId: scheme._id,
      instrumentName: item.instrumentName || '',
      instrumentType: item.instrumentType || '',
      isin: item.isin || null,
      quantity: safeNumber(item.quantity),
      marketValue: safeNumber(item.marketValue),
      navPercent: safeNumber(item.navPercent),
      maturityDate: excelDateToJSDate(item.maturityDate),
      coupon: safeNumber(item.coupon),
      rating: item.rating || null,
      sector: item.sector || null,
      issuer: item.issuer || null,
      reportDate: finalReportDate, // Store report date with each holding
      other: {
        YTM: safeNumber(item.ytm),
        YTC: safeNumber(item.ytc), // Yield to Call (for AT1/Tier 2 bonds)
        _sheetName: item._sheetName
      }
    }));

    // Log first 3 holdings with YTM data for ICICI verification
    console.log('\n📊 SAVING TO DATABASE - First 3 holdings with YTM and Report Date:');
    holdings.slice(0, 3).forEach((holding, idx) => {
      console.log(`\n${idx + 1}. Instrument: ${holding.instrumentName}`);
      console.log(`   ISIN: ${holding.isin}`);
      console.log(`   Report Date: ${holding.reportDate ? holding.reportDate.toISOString().split('T')[0] : 'N/A'}`);
      console.log(`   YTM from Excel: ${parseResult.data[idx]?.ytm || 'N/A'}`);
      console.log(`   YTM after safeNumber: ${holding.other.YTM || 'N/A'}`);
      console.log(`   Will be stored as: other.YTM = ${holding.other.YTM}`);
    });

    let insertedCount = 0;
    if (holdings.length > 0) {
      const insertResult = await InstrumentHolding.insertMany(holdings);
      insertedCount = insertResult.length;
      console.log(`\n✅ Successfully inserted ${insertedCount} holdings to database`);
    }

    // No need to clean up file (using memory storage)

    res.json({
      scheme: {
        _id: scheme._id,
        name: scheme.name,
        reportDate: scheme.reportDate,
        originalFilename: scheme.originalFilename
      },
      inserted: insertedCount,
      sheets: parseResult.sheets.map(s => ({
        name: s.sheetName,
        status: s.status,
        dataCount: s.data ? s.data.length : 0
      })),
      totalSheets: parseResult.totalSheets
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // No need to clean up file (using memory storage)
    
    res.status(500).json({ 
      error: error.message || 'Failed to process Excel file' 
    });
  }
});

module.exports = router;
