/**
 * Create a demo user with portfolio data
 * Usage: node scripts/create-demo-user.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Issuer = require('../models/issuer.model');
const Transaction = require('../models/transaction.model');
const PriceSnapshot = require('../models/priceSnapshot.model');

// Sample issuers data
const issuers = [
  {
    isin: 'INE467B01029',
    company: 'Tata Motors Ltd',
    sector: 'Auto',
    rating: 'BBB+',
    market_cap: '₹3.5L cr',
    week52_high: 1150,
    week52_low: 550,
    description: "India's leading automotive OEM with PV & CV portfolio.",
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
    description: "India's largest private sector bank by assets.",
  },
  {
    isin: 'INE002A01018',
    company: 'Reliance Industries Ltd',
    sector: 'Conglomerate',
    rating: 'AAA',
    market_cap: '₹18.2L cr',
    week52_high: 2950,
    week52_low: 2150,
    description: "India's largest private sector company with interests in energy, retail, and telecom.",
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
  {
    isin: 'INE019A01038',
    company: 'Asian Paints Ltd',
    sector: 'Paints',
    rating: 'AAA',
    market_cap: '₹2.8L cr',
    week52_high: 3200,
    week52_low: 2650,
    description: 'Leading paint company in India with strong brand presence.',
  },
  {
    isin: 'INE397D01024',
    company: 'Bajaj Finance Ltd',
    sector: 'NBFC',
    rating: 'AAA',
    market_cap: '₹4.5L cr',
    week52_high: 7800,
    week52_low: 6200,
    description: 'Leading consumer finance company with diversified product portfolio.',
  },
];

const priceSnapshots = [
  { isin: 'INE467B01029', current_price: 715, as_of: new Date() },
  { isin: 'INE009A01021', current_price: 1580, as_of: new Date() },
  { isin: 'INE040A01034', current_price: 1650, as_of: new Date() },
  { isin: 'INE002A01018', current_price: 2750, as_of: new Date() },
  { isin: 'INE155A01022', current_price: 3950, as_of: new Date() },
  { isin: 'INE019A01038', current_price: 2950, as_of: new Date() },
  { isin: 'INE397D01024', current_price: 7250, as_of: new Date() },
];

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
    {
      user_id: userId,
      isin: 'INE009A01021',
      company: 'Infosys Ltd',
      type: 'BUY',
      share_count: 80,
      price: 1420,
      trade_date: new Date('2024-08-12'),
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
    {
      user_id: userId,
      isin: 'INE155A01022',
      company: 'Tata Consultancy Services Ltd',
      type: 'BUY',
      share_count: 25,
      price: 3650,
      trade_date: new Date('2024-09-05'),
      source: 'manual',
    },

    // Asian Paints
    {
      user_id: userId,
      isin: 'INE019A01038',
      company: 'Asian Paints Ltd',
      type: 'BUY',
      share_count: 30,
      price: 2750,
      trade_date: new Date('2023-09-15'),
      source: 'broker_upload',
    },

    // Bajaj Finance
    {
      user_id: userId,
      isin: 'INE397D01024',
      company: 'Bajaj Finance Ltd',
      type: 'BUY',
      share_count: 15,
      price: 6800,
      trade_date: new Date('2024-03-20'),
      source: 'manual',
    },
  ];
}

async function createDemoUser() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mutual_fund';
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Create or get demo user
    let user = await User.findOne({ email: 'demo@ppcapital.com' });
    
    if (user) {
      console.log('\n✓ Demo user already exists');
      console.log(`User ID: ${user._id}`);
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
    } else {
      user = new User({
        name: 'Demo User',
        email: 'demo@ppcapital.com',
        password: 'demo123', // In production, hash this!
        role: 'user',
      });
      await user.save();
      console.log('\n✓ Created demo user');
      console.log(`User ID: ${user._id}`);
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
    }

    // Clear existing portfolio data for this user (optional)
    console.log('\nClearing existing portfolio data for demo user...');
    await Transaction.deleteMany({ user_id: user._id });
    console.log('✓ Cleared existing transactions');

    // Insert/Update Issuers
    console.log('\nUpserting Issuers...');
    for (const issuer of issuers) {
      await Issuer.findOneAndUpdate(
        { isin: issuer.isin },
        issuer,
        { upsert: true, new: true }
      );
    }
    console.log(`✓ Upserted ${issuers.length} issuers`);

    // Insert/Update Price Snapshots
    console.log('\nUpserting Price Snapshots...');
    for (const snapshot of priceSnapshots) {
      await PriceSnapshot.findOneAndUpdate(
        { isin: snapshot.isin },
        snapshot,
        { upsert: true, new: true }
      );
    }
    console.log(`✓ Upserted ${priceSnapshots.length} price snapshots`);

    // Insert Transactions
    console.log('\nInserting Transactions...');
    const transactions = generateTransactions(user._id);
    const insertedTx = await Transaction.insertMany(transactions);
    console.log(`✓ Inserted ${insertedTx.length} transactions`);

    console.log('\n✅ Demo user and portfolio created successfully!');
    console.log('\n========================================');
    console.log('LOGIN CREDENTIALS:');
    console.log('========================================');
    console.log(`Email: demo@ppcapital.com`);
    console.log(`Password: demo123`);
    console.log(`User ID: ${user._id}`);
    console.log('========================================');
    console.log('\nAPI Test Commands:');
    console.log(`curl "http://localhost:5000/api/portfolio?userId=${user._id}"`);
    console.log(`curl "http://localhost:5000/api/portfolio/holdings?userId=${user._id}"`);
    console.log('========================================\n');

    // Store user ID in a file for frontend to use
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../Frontend/src/config.js');
    const configContent = `// Auto-generated demo user config
export const DEMO_USER_ID = '${user._id}';
export const DEMO_USER_EMAIL = 'demo@ppcapital.com';
`;
    fs.writeFileSync(configPath, configContent);
    console.log('✓ Created Frontend/src/config.js with demo user ID\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run
createDemoUser();

