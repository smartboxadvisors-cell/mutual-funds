#!/usr/bin/env node
// scripts/ingest.js - CLI ingestion script as per PROJECT_PROMPT

const path = require('path');
const mongoose = require('mongoose');
const { parseExcelFile } = require('../utils/parseExcel');
const Scheme = require('../models/Scheme');
const InstrumentHolding = require('../models/InstrumentHolding');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function connectWithRetry() {
  const maxRetries = 10;
  const retryDelay = 2000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ Connected to MongoDB');
      return;
    } catch (error) {
      console.log(`❌ MongoDB connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) {
        console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  console.error('💥 Failed to connect to MongoDB after', maxRetries, 'attempts');
  process.exit(1);
}

async function ingestExcelFile(filePath) {
  try {
    console.log('📁 Parsing Excel file:', filePath);
    
    // Parse Excel file
    const parseResult = parseExcelFile(filePath);
    console.log('📊 Parsed data:', {
      schemeName: parseResult.schemeName,
      reportDate: parseResult.reportDate,
      totalRecords: parseResult.data.length,
      sheetsProcessed: parseResult.sheets.length
    });
    
    // Create or update scheme
    const scheme = await Scheme.findOneAndUpdate(
      { 
        name: parseResult.schemeName,
        reportDate: parseResult.reportDate
      },
      {
        name: parseResult.schemeName,
        reportDate: parseResult.reportDate,
        originalFilename: path.basename(filePath)
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log('📋 Scheme created/updated:', scheme.name);
    
    // Delete previous holdings for same scheme
    const deleteResult = await InstrumentHolding.deleteMany({ schemeId: scheme._id });
    console.log('🗑️  Deleted previous holdings:', deleteResult.deletedCount);
    
    // Insert new holdings
    const holdings = parseResult.data.map(item => ({
      schemeId: scheme._id,
      instrumentName: item.instrumentName || '',
      instrumentType: item.instrumentType || '',
      isin: item.isin || null,
      quantity: item.quantity ? Number(item.quantity) : null,
      marketValue: item.marketValue ? Number(item.marketValue) : null,
      navPercent: item.navPercent ? Number(item.navPercent) : null,
      maturityDate: item.maturityDate ? new Date(item.maturityDate) : null,
      coupon: item.coupon ? Number(item.coupon) : null,
      rating: item.rating || null,
      sector: item.sector || null,
      issuer: item.issuer || null,
      other: {
        YTM: item.ytm || null,
        _sheetName: item._sheetName
      }
    }));
    
    let insertedCount = 0;
    if (holdings.length > 0) {
      const insertResult = await InstrumentHolding.insertMany(holdings);
      insertedCount = insertResult.length;
    }
    
    console.log('✅ Ingestion complete!');
    console.log(`📈 Ingested ${insertedCount} holdings into scheme '${scheme.name}' (${scheme.reportDate.toDateString()})`);
    
    // Show sheet breakdown
    parseResult.sheets.forEach(sheet => {
      console.log(`   📄 ${sheet.sheetName}: ${sheet.data ? sheet.data.length : 0} records (${sheet.status})`);
    });
    
    return {
      scheme,
      inserted: insertedCount,
      sheets: parseResult.sheets,
      totalSheets: parseResult.totalSheets
    };
    
  } catch (error) {
    console.error('💥 Ingestion failed:', error.message);
    throw error;
  }
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('❌ Usage: node scripts/ingest.js <path-to-excel>');
    process.exit(1);
  }
  
  if (!require('fs').existsSync(filePath)) {
    console.error('❌ File not found:', filePath);
    process.exit(1);
  }
  
  try {
    await connectWithRetry();
    await ingestExcelFile(filePath);
    console.log('🎉 All done!');
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { ingestExcelFile };
