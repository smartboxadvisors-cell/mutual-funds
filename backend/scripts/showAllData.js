// scripts/showAllData.js
// Run this script to see all data in MongoDB

require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/Scheme');
const InstrumentHolding = require('../models/InstrumentHolding');

async function showAllData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all schemes
    const schemes = await Scheme.find({})
      .sort({ reportDate: -1, name: 1 })
      .lean();

    console.log('📊 SCHEMES IN DATABASE:');
    console.log('=' .repeat(80));
    
    for (const scheme of schemes) {
      const holdingsCount = await InstrumentHolding.countDocuments({ schemeId: scheme._id });
      
      console.log(`\n📁 Scheme: ${scheme.name}`);
      console.log(`   Report Date: ${scheme.reportDate ? new Date(scheme.reportDate).toLocaleDateString() : 'N/A'}`);
      console.log(`   File: ${scheme.originalFilename || 'N/A'}`);
      console.log(`   Holdings: ${holdingsCount} instruments`);
      console.log(`   Created: ${new Date(scheme.createdAt).toLocaleString()}`);
      console.log(`   ID: ${scheme._id}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n📈 TOTAL: ${schemes.length} schemes\n`);

    // Get total holdings count
    const totalHoldings = await InstrumentHolding.countDocuments({});
    console.log(`💼 TOTAL HOLDINGS: ${totalHoldings} instruments across all schemes\n`);

    // Show breakdown by instrument type
    const pipeline = [
      {
        $group: {
          _id: '$instrumentType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];

    const breakdown = await InstrumentHolding.aggregate(pipeline);
    
    console.log('📊 BREAKDOWN BY INSTRUMENT TYPE:');
    console.log('=' .repeat(80));
    breakdown.forEach(item => {
      console.log(`   ${item._id || 'Uncategorized'}: ${item.count} instruments`);
    });

    console.log('\n' + '='.repeat(80));
    
    // Sample data
    console.log('\n📝 SAMPLE DATA (First 5 instruments):');
    console.log('=' .repeat(80));
    
    const sampleHoldings = await InstrumentHolding.find({})
      .limit(5)
      .populate('schemeId', 'name reportDate')
      .lean();

    sampleHoldings.forEach((holding, idx) => {
      console.log(`\n${idx + 1}. ${holding.instrumentName}`);
      console.log(`   Scheme: ${holding.schemeId?.name || 'N/A'}`);
      console.log(`   ISIN: ${holding.isin || 'N/A'}`);
      console.log(`   Type: ${holding.instrumentType || 'N/A'}`);
      console.log(`   Rating: ${holding.rating || 'N/A'}`);
      console.log(`   Quantity: ${holding.quantity || 'N/A'}`);
      console.log(`   Market Value: ${holding.marketValue || 'N/A'}`);
      console.log(`   % to NAV: ${holding.navPercent || 'N/A'}`);
      console.log(`   YTM: ${holding.other?.YTM || 'N/A'}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  }
}

showAllData();

