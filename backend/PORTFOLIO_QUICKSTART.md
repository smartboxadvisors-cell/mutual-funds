# Portfolio Module - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

This installs `joi` for validation and `jest` for testing.

### Step 2: Update User ID in Seed Script

Edit `scripts/seed-portfolio.js` line 142 and replace the demo user ID with an actual user ID from your database:

```javascript
// Replace this line:
const demoUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

// With your actual user ID:
const demoUserId = new mongoose.Types.ObjectId('YOUR_ACTUAL_USER_ID');
```

### Step 3: Seed Sample Data

```bash
npm run seed:portfolio
```

You should see:
```
✓ Connected to MongoDB
✓ Cleared existing data
✓ Inserted 5 issuers
✓ Inserted 5 price snapshots
✓ Inserted 12 transactions
✅ Portfolio seed completed successfully!
```

### Step 4: Start the Server

```bash
npm run dev
```

### Step 5: Test the API

Replace `{userId}` with the user ID you used in step 2:

```bash
# Get complete portfolio
curl "http://localhost:5000/api/portfolio?userId={userId}"

# Get holdings only
curl "http://localhost:5000/api/portfolio/holdings?userId={userId}"

# Get sold transactions
curl "http://localhost:5000/api/portfolio/sold?userId={userId}"

# Get issuer info
curl "http://localhost:5000/api/portfolio/issuers/INE467B01029"
```

## 📊 Expected Response

When you call `/api/portfolio?userId={userId}`, you should see:

```json
{
  "summary": {
    "investment": 700000,
    "current": 850000,
    "pnl": 150000,
    "totalQty": 405
  },
  "holdings": [
    {
      "isin": "INE467B01029",
      "company": "Tata Motors Ltd",
      "quantity": 250,
      "buy_price": 500.00,
      "current_price": 715.00,
      "interest_score": 0.625
    },
    // ... more holdings
  ],
  "sold": [
    {
      "isin": "INE009A01021",
      "company": "Infosys Ltd",
      "quantity": 100,
      "buy_price": 1350.00,
      "sell_price": 1580.00
    }
  ]
}
```

## ✅ Test FIFO Logic

```bash
npm test
```

You should see all tests passing:
```
PASS  tests/fifo.test.js
  FIFO Position Matching
    computePositions
      ✓ should handle simple buy and hold
      ✓ should handle complete sell of single lot
      ✓ should handle partial sell from single lot
      ✓ should handle partial sales from multiple lots (FIFO order)
      ✓ should handle multiple buy and sell cycles
      ✓ should handle multiple ISINs independently
      ✓ should handle oversell scenario
      ✓ should calculate trade count correctly
      ✓ should calculate average holding days
      ✓ should correctly calculate realized P/L
    getCurrentOpenQuantity
      ✓ should return correct open quantity
      ✓ should return 0 for non-existent ISIN
      ✓ should return 0 when all shares are sold

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
```

## 🔧 Add a Transaction via API

```bash
curl -X POST http://localhost:5000/api/portfolio/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "type": "BUY",
    "isin": "INE040A01034",
    "company": "HDFC Bank Ltd",
    "share_count": 50,
    "price": 1650,
    "trade_date": "2025-10-14"
  }'
```

Expected response:
```json
{
  "message": "Transaction added successfully",
  "transaction": {
    "_id": "...",
    "user_id": "...",
    "isin": "INE040A01034",
    "company": "HDFC Bank Ltd",
    "type": "BUY",
    "share_count": 50,
    "price": 1650,
    "trade_date": "2025-10-14T00:00:00.000Z",
    "source": "manual"
  }
}
```

## 🎯 Update Prices (Admin)

```bash
curl -X POST http://localhost:5000/api/portfolio/prices \
  -H "Content-Type: application/json" \
  -d '[
    {"isin": "INE467B01029", "current_price": 725.50},
    {"isin": "INE009A01021", "current_price": 1595.00}
  ]'
```

## 🚨 Common Issues

### Issue 1: "userId required"
**Solution:** Make sure you pass `userId` as a query parameter or in the request body.

### Issue 2: "Cannot sell X shares"
**Solution:** This means you're trying to sell more shares than you own. Check your current holdings first.

### Issue 3: Port 5000 already in use
**Solution:** Change the PORT in `.env` or stop the conflicting process.

## 📚 Next Steps

1. Read the full documentation: `PORTFOLIO_README.md`
2. Review the API spec: `openapi/portfolio.yaml`
3. Integrate with your frontend
4. Set up authentication middleware (optional)
5. Configure a cron job for daily price updates

## 🔗 Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio` | Get complete portfolio |
| GET | `/api/portfolio/holdings` | Get holdings with pagination |
| GET | `/api/portfolio/sold` | Get sold transactions |
| POST | `/api/portfolio/transactions` | Add buy/sell transaction |
| POST | `/api/portfolio/prices` | Bulk update prices (admin) |
| GET | `/api/portfolio/issuers/:isin` | Get issuer metadata |

## 💡 Pro Tips

1. **Use pagination** for large portfolios to avoid performance issues
2. **Update prices regularly** via `/api/portfolio/prices` endpoint
3. **Enable authentication** by uncommenting `requireAuth` in `routes/portfolio.routes.js`
4. **Monitor interest_score** to identify your most significant holdings

Happy trading! 📈

