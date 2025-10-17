// Script to add reportDate to existing InstrumentHolding documents
// Run this once to update old data: node backend/scripts/migrateReportDate.js

const mongoose = require('mongoose');
const InstrumentHolding = require('../models/InstrumentHolding');
require('dotenv').config();

async function migrateReportDate() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mutual-funds';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find all documents without reportDate
    const docsWithoutDate = await InstrumentHolding.countDocuments({
      $or: [
        { reportDate: { $exists: false } },
        { reportDate: null }
      ]
    });

    console.log(`📊 Found ${docsWithoutDate} documents without reportDate\n`);

    if (docsWithoutDate === 0) {
      console.log('✅ All documents already have reportDate. Nothing to migrate.');
      await mongoose.disconnect();
      return;
    }

    // Ask user for confirmation
    console.log('⚠️  This will update documents with reportDate from their scheme or set to null.');
    console.log('   Press Ctrl+C to cancel or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Strategy: Use the scheme's reportDate or set to null
    console.log('🔄 Starting migration...\n');

    // Get all holdings without reportDate
    const holdings = await InstrumentHolding.find({
      $or: [
        { reportDate: { $exists: false } },
        { reportDate: null }
      ]
    }).populate('schemeId', 'reportDate').limit(1000); // Process in batches

    let updated = 0;
    let nullDates = 0;

    for (const holding of holdings) {
      const schemeReportDate = holding.schemeId?.reportDate;
      
      if (schemeReportDate) {
        // Update with scheme's reportDate
        await InstrumentHolding.updateOne(
          { _id: holding._id },
          { $set: { reportDate: schemeReportDate } }
        );
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`   Processed ${updated} documents...`);
        }
      } else {
        // No scheme reportDate available, set to null
        await InstrumentHolding.updateOne(
          { _id: holding._id },
          { $set: { reportDate: null } }
        );
        nullDates++;
      }
    }

    console.log('\n✅ Migration completed!');
    console.log(`   📅 Updated with scheme date: ${updated}`);
    console.log(`   ⚠️  Set to null (no scheme date): ${nullDates}`);
    console.log(`   Total processed: ${updated + nullDates}\n`);

    // Verify results
    const remainingWithoutDate = await InstrumentHolding.countDocuments({
      $or: [
        { reportDate: { $exists: false } }
      ]
    });

    const withNullDate = await InstrumentHolding.countDocuments({
      reportDate: null
    });

    console.log('📊 Final counts:');
    console.log(`   Documents without reportDate field: ${remainingWithoutDate}`);
    console.log(`   Documents with null reportDate: ${withNullDate}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateReportDate();

