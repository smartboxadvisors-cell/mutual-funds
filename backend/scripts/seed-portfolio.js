/**
 * Seed script for Portfolio module
 * Creates sample Issuers, Transactions, and PriceSnapshots
 * 
 * Usage: node scripts/seed-portfolio.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Issuer = require('../models/issuer.model');
const Transaction = require('../models/transaction.model');
const PriceSnapshot = require('../models/priceSnapshot.model');

// Sample data
const issuers = [
  {
    isin: 'INE467B01029',
    company: 'Tata Motors Ltd',
    sector: 'Auto',
    rating: 'BBB+',
    market_cap: '₹3.5L cr',
    week52_high: 1150,
    week52_low: 550,
    description: 'India\'s leading automotive OEM with PV & CV portfolio.',
  },
  {
    isin: 'INE009A01021',
    company: 'Infosys Ltd',
    sector: 'IT Services',
    rating: 'AAA',
    market_cap: '₹6.2L cr',
    week52_high: 1620,
    week52_low: 1280,
    description: 'Global leader in next-generation digital services and consulting.',
  },
  {
    isin: 'INE040A01034',
    company: 'HDFC Bank Ltd',
    sector: 'Banking',
    rating: 'AAA',
    market_cap: '₹12.5L cr',
    week52_high: 1780,
    week52_low: 1450,
    description: 'India\'s largest private sector bank by assets.',
  },
  {
    isin: 'INE002A01018',
    company: 'Reliance Industries Ltd',
    sector: 'Conglomerate',
    rating: 'AAA',
    market_cap: '₹18.2L cr',
    week52_high: 2950,
    week52_low: 2150,
    description: 'India\'s largest private sector company with interests in energy, retail, and telecom.',
  },
  {
    isin: 'INE155A01022',
    company: 'Tata Consultancy Services Ltd',
    sector: 'IT Services',
    rating: 'AAA',
    market_cap: '₹14.1L cr',
    week52_high: 4150,
    week52_low: 3200,
    description: 'Leading global IT services, consulting and business solutions organization.',
  },
];

const priceSnapshots = [
  { isin: 'INE467B01029', current_price: 715, as_of: new Date('2025-10-14') },
  { isin: 'INE009A01021', current_price: 1580, as_of: new Date('2025-10-14') },
  { isin: 'INE040A01034', current_price: 1650, as_of: new Date('2025-10-14') },
  { isin: 'INE002A01018', current_price: 2750, as_of: new Date('2025-10-14') },
  { isin: 'INE155A01022', current_price: 3950, as_of: new Date('2025-10-14') },
];

// Sample transactions for a demo user
// Replace 'DEMO_USER_ID' with an actual user ID from your database
function generateTransactions(userId) {
  return [
    // Tata Motors - Multiple buys and partial sell
    {
      user_id: userId,
      isin: 'INE467B01029',
      company: 'Tata Motors Ltd',
      type: 'BUY',
      share_count: 100,
      price: 450,
      trade_date: new Date('2023-02-14'),
      source: 'broker_upload',
    },
    {
      user_id: userId,
      isin: 'INE467B01029',
      company: 'Tata Motors Ltd',
      type: 'BUY',
      share_count: 150,
      price: 520,
      trade_date: new Date('2023-06-20'),
      source: 'broker_upload',
    },
    {
      user_id: userId,
      isin: 'INE467B01029',
      company: 'Tata Motors Ltd',
      type: 'BUY',
      share_count: 80,
      price: 580,
      trade_date: new Date('2024-01-15'),
      source: 'manual',
    },
    {
      user_id: userId,
      isin: 'INE467B01029',
      company: 'Tata Motors Ltd',
      type: 'SELL',
      share_count: 80,
      price: 680,
      trade_date: new Date('2024-08-10'),
      source: 'manual',
    },

    // Infosys - Buy and complete sell (realized)
    {
      user_id: userId,
      isin: 'INE009A01021',
      company: 'Infosys Ltd',
      type: 'BUY',
      share_count: 100,
      price: 1350,
      trade_date: new Date('2023-03-10'),
      source: 'broker_upload',
    },
    {
      user_id: userId,
      isin: 'INE009A01021',
      company: 'Infosys Ltd',
      type: 'SELL',
      share_count: 100,
      price: 1580,
      trade_date: new Date('2024-01-25'),
      source: 'manual',
    },

    // HDFC Bank - Buy and hold
    {
      user_id: userId,
      isin: 'INE040A01034',
      company: 'HDFC Bank Ltd',
      type: 'BUY',
      share_count: 75,
      price: 1520,
      trade_date: new Date('2023-05-18'),
      source: 'broker_upload',
    },
    {
      user_id: userId,
      isin: 'INE040A01034',
      company: 'HDFC Bank Ltd',
      type: 'BUY',
      share_count: 50,
      price: 1600,
      trade_date: new Date('2024-02-12'),
      source: 'manual',
    },

    // Reliance - Single buy
    {
      user_id: userId,
      isin: 'INE002A01018',
      company: 'Reliance Industries Ltd',
      type: 'BUY',
      share_count: 40,
      price: 2450,
      trade_date: new Date('2023-07-22'),
      source: 'broker_upload',
    },

    // TCS - Buy and partial sell
    {
      user_id: userId,
      isin: 'INE155A01022',
      company: 'Tata Consultancy Services Ltd',
      type: 'BUY',
      share_count: 60,
      price: 3400,
      trade_date: new Date('2023-04-05'),
      source: 'broker_upload',
    },
    {
      user_id: userId,
      isin: 'INE155A01022',
      company: 'Tata Consultancy Services Ltd',
      type: 'SELL',
      share_count: 20,
      price: 3850,
      trade_date: new Date('2024-05-18'),
      source: 'manual',
    },
  ];
}

async function seed() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mutual_fund';
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Clear existing portfolio data (optional - comment out if you want to preserve data)
    console.log('\nClearing existing portfolio data...');
    await Issuer.deleteMany({});
    await Transaction.deleteMany({});
    await PriceSnapshot.deleteMany({});
    console.log('✓ Cleared existing data');

    // Insert Issuers
    console.log('\nInserting Issuers...');
    const insertedIssuers = await Issuer.insertMany(issuers);
    console.log(`✓ Inserted ${insertedIssuers.length} issuers`);

    // Insert Price Snapshots
    console.log('\nInserting Price Snapshots...');
    const insertedPrices = await PriceSnapshot.insertMany(priceSnapshots);
    console.log(`✓ Inserted ${insertedPrices.length} price snapshots`);

    // Create a demo user ID (replace with actual user ID or create a user)
    // For now, we'll use a placeholder ObjectId
    const demoUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    console.log(`\nUsing demo user ID: ${demoUserId}`);

    // Insert Transactions
    console.log('\nInserting Transactions...');
    const transactions = generateTransactions(demoUserId);
    const insertedTx = await Transaction.insertMany(transactions);
    console.log(`✓ Inserted ${insertedTx.length} transactions`);

    console.log('\n✅ Portfolio seed completed successfully!');
    console.log('\nTo test the API:');
    console.log(`GET /api/portfolio?userId=${demoUserId}`);
    console.log(`GET /api/portfolio/holdings?userId=${demoUserId}`);
    console.log(`GET /api/portfolio/sold?userId=${demoUserId}`);
    console.log(`GET /api/portfolio/issuers/INE467B01029`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run seed
seed();

