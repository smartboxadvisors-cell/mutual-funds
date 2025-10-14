# 🚀 Complete Portfolio Setup & Usage Guide

## Prerequisites

Before starting, ensure you have:
- ✅ MongoDB running (local or Atlas cloud)
- ✅ Backend server environment configured
- ✅ Frontend and Backend dependencies installed

## Step-by-Step Setup

### Step 1: Configure Database Connection

Make sure your `backend/.env` file has:
```env
MONGODB_URI=your_mongodb_connection_string
```

Or start local MongoDB:
```bash
mongod
```

### Step 2: Create Demo User & Portfolio Data

Run this command in the backend directory:

```bash
npm run create:demo-user
```

**This creates:**
- 1 Demo user (email: demo@ppcapital.com)
- 7 Stock issuers (Tata Motors, Infosys, HDFC, Reliance, TCS, Asian Paints, Bajaj Finance)
- 16 Realistic transactions (Buys and Sells)
- 7 Current price snapshots
- Auto-generates `Frontend/src/config.js` with user ID

**Example Output:**
```
✓ Connected to MongoDB
✓ Created demo user
User ID: 67341a2b3c4d5e6f7g8h9i0j
✓ Inserted 7 issuers
✓ Inserted 7 price snapshots
✓ Inserted 16 transactions
✅ Demo user and portfolio created successfully!

========================================
LOGIN CREDENTIALS:
========================================
Email: demo@ppcapital.com
Password: demo123
User ID: 67341a2b3c4d5e6f7g8h9i0j
========================================
```

**Copy the User ID** - you'll need it!

### Step 3: Start Backend Server

```bash
cd backend
npm run dev
```

Server will start on http://localhost:5000

### Step 4: Start Frontend

In a new terminal:
```bash
cd Frontend
npm run dev
```

Frontend will start on http://localhost:5173

### Step 5: Access Portfolio

1. Open http://localhost:5173
2. Login (if not already logged in)
3. Click **"Portfolio"** in the navigation
4. If `config.js` was created, user ID loads automatically
5. Otherwise, enter the User ID from Step 2

## 🎯 Features & Usage

### 1. View Portfolio Dashboard

**Summary Cards show:**
- Total Investment: Sum of all purchase costs
- Current Value: Current market value
- Total P&L: Profit/Loss (with percentage)
- Total Shares: Number of shares held

### 2. Holdings Tab

View all your current positions with:
- Company name & ISIN
- Sector classification
- Quantity held
- Average buy price
- Current market price (CMP)
- Investment & Current value
- P&L (amount & percentage)
- **Interest Score**: Visual bar showing position importance

**Calculations:**
```javascript
Interest Score = 50% × (Quantity/Total) + 
                 30% × (Trades/Total Trades) + 
                 20% × (Holding Days/Max Days)
```

### 3. Realized Tab

View completed (sold) transactions with:
- Sale quantity
- Buy and sell prices
- Purchase and sell dates
- Realized P&L

### 4. Search & Filter

**Search Bar:**
- Type company name (e.g., "Tata")
- Or ISIN code (e.g., "INE467B01029")
- Real-time filtering

**Sector Filter:**
- Filter by Auto, Banking, IT Services, etc.
- Shows unique sectors from your holdings

### 5. Add New Transaction

Click **"+ Add Transaction"** button:

**For BUY:**
```json
{
  "type": "BUY",
  "isin": "INE467B01029",
  "company": "Tata Motors Ltd",
  "share_count": 50,
  "price": 720.50,
  "trade_date": "2025-10-14"
}
```

**For SELL:**
```json
{
  "type": "SELL",
  "isin": "INE467B01029",
  "company": "Tata Motors Ltd",
  "share_count": 30,
  "price": 750.00,
  "trade_date": "2025-10-14"
}
```

**Validation:**
- SELL transactions check available quantity
- Won't allow overselling
- Validates all required fields

### 6. View Details

Click **"View"** button on any holding to see:
- Full company description
- Market cap
- 52-week high/low
- Rating
- Trade count
- Average holding days
- Purchase date

### 7. Change User

Click **"Change User"** button to:
- View another user's portfolio
- Enter different user ID
- Saved in browser localStorage

## 📊 Demo Data Details

The demo user portfolio includes:

| Company | ISIN | Sector | Holdings |
|---------|------|--------|----------|
| Tata Motors | INE467B01029 | Auto | 250 shares |
| HDFC Bank | INE040A01034 | Banking | 125 shares |
| Reliance | INE002A01018 | Conglomerate | 40 shares |
| TCS | INE155A01022 | IT Services | 65 shares |
| Infosys | INE009A01021 | IT Services | 80 shares |
| Asian Paints | INE019A01038 | Paints | 30 shares |
| Bajaj Finance | INE397D01024 | NBFC | 15 shares |

**Realized Transactions:**
- Infosys: 100 shares (₹1,350 → ₹1,580)
- Tata Motors: 80 shares (₹520 → ₹680)
- TCS: 20 shares (₹3,300 → ₹3,850)

## 🧪 Testing Guide

### Test 1: Add a BUY transaction
1. Click "+ Add Transaction"
2. Type: BUY
3. ISIN: INE467B01029 (Tata Motors)
4. Company: Tata Motors Ltd
5. Quantity: 50
6. Price: 720
7. Date: Today
8. Submit
9. **Expected:** Holdings refresh, quantity increases

### Test 2: Add a SELL transaction
1. Click "+ Add Transaction"
2. Type: SELL
3. ISIN: INE467B01029
4. Company: Tata Motors Ltd
5. Quantity: 20
6. Price: 750
7. Date: Today
8. Submit
9. **Expected:** Holdings refresh, new realized sale added

### Test 3: Try to oversell
1. Click "+ Add Transaction"
2. Type: SELL
3. Enter ISIN with low holdings
4. Quantity: 999 (more than you own)
5. Submit
6. **Expected:** Error message "Cannot sell X shares"

### Test 4: Search functionality
1. Type "Tata" in search box
2. **Expected:** Only Tata companies shown
3. Type "INE009A" 
4. **Expected:** Only Infosys shown

### Test 5: Sector filter
1. Select "IT Services" from dropdown
2. **Expected:** Only Infosys and TCS shown
3. Select "Auto"
4. **Expected:** Only Tata Motors shown

## 🔧 API Endpoints Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/portfolio?userId={id}` | Get full portfolio |
| GET | `/api/portfolio/holdings?userId={id}` | Get holdings only |
| GET | `/api/portfolio/sold?userId={id}` | Get realized sales |
| POST | `/api/portfolio/transactions` | Add BUY/SELL |
| GET | `/api/portfolio/issuers/{isin}` | Get company details |
| POST | `/api/portfolio/prices` | Bulk update prices (admin) |

### Example cURL Commands

**Get Portfolio:**
```bash
curl "http://localhost:5000/api/portfolio?userId=YOUR_USER_ID"
```

**Add Transaction:**
```bash
curl -X POST http://localhost:5000/api/portfolio/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "type": "BUY",
    "isin": "INE467B01029",
    "company": "Tata Motors Ltd",
    "share_count": 50,
    "price": 720,
    "trade_date": "2025-10-14"
  }'
```

## ❓ Troubleshooting

### Issue: "MongoDB connection failed"
**Solution:**
- Check if MongoDB is running
- Verify MONGODB_URI in .env
- Test connection: `mongosh` or MongoDB Compass

### Issue: "User ID required"
**Solution:**
- Run `npm run create:demo-user` again
- Copy the user ID from terminal
- Paste it on the Portfolio page

### Issue: "Cannot fetch portfolio"
**Solution:**
- Check backend is running on port 5000
- Check browser console for errors
- Verify CORS is configured
- Test API directly: `curl http://localhost:5000/api/portfolio?userId=YOUR_ID`

### Issue: "Cannot add transaction - ISIN not found"
**Solution:**
- Use ISINs from the demo data
- Or add new issuers via MongoDB:
```javascript
db.issuers.insertOne({
  isin: "INE123A01234",
  company: "New Company Ltd",
  sector: "Technology",
  // ... other fields
})
```

### Issue: Empty portfolio
**Solution:**
- Verify demo user script ran successfully
- Check MongoDB collections:
  - `users` - should have demo user
  - `issuers` - should have 7 companies
  - `transactions` - should have 16 records
  - `pricesnapshots` - should have 7 records

## 🎨 UI Features

- **Gradient Cards**: Beautiful summary cards with gradients
- **Color-Coded P&L**: Green for profit, red for loss
- **Interest Score Bars**: Visual representation of position importance
- **Responsive Design**: Works on mobile, tablet, and desktop
- **Smooth Animations**: Hover effects and transitions
- **Modal Dialogs**: For adding transactions and viewing details
- **Real-time Filters**: Instant search and filter results

## 📈 Next Steps

1. **Connect to real price API** - Update prices automatically
2. **Add more issuers** - Expand your portfolio
3. **Import from broker** - Upload CSV files
4. **Export reports** - Generate PDF/Excel reports
5. **Set alerts** - Price targets and stop losses
6. **Tax calculation** - FIFO-based capital gains

## 🎉 You're All Set!

Your portfolio management system is now ready to use. Add more transactions, explore the features, and manage your investments effectively!

**Demo Credentials:**
- Email: demo@ppcapital.com
- Password: demo123

Happy investing! 📊💰

