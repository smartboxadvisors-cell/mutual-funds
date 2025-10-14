# Portfolio Module Documentation

## Overview

The Portfolio module provides comprehensive equity portfolio management with FIFO (First-In-First-Out) position tracking, realized P/L calculation, and interest scoring for holdings.

## Features

- ✅ FIFO-based position matching for accurate buy/sell tracking
- ✅ Automatic calculation of realized and unrealized P/L
- ✅ Interest score calculation based on quantity, trade frequency, and holding period
- ✅ Price snapshot management for current market prices
- ✅ Issuer metadata enrichment
- ✅ Validation to prevent overselling
- ✅ Pagination support for large portfolios
- ✅ RESTful API with comprehensive error handling
- ✅ OpenAPI/Swagger documentation
- ✅ Full test coverage for FIFO logic

## Architecture

```
backend/
├── models/
│   ├── issuer.model.js           # Issuer metadata (company, sector, rating, etc.)
│   ├── transaction.model.js      # Buy/Sell transactions (source of truth)
│   └── priceSnapshot.model.js    # Current market prices cache
├── utils/
│   └── fifo.js                   # FIFO position matching algorithm
├── services/
│   └── portfolio.service.js      # Business logic & aggregations
├── controllers/
│   └── portfolio.controller.js   # Request handlers with Joi validation
├── routes/
│   └── portfolio.routes.js       # Express router
├── scripts/
│   └── seed-portfolio.js         # Sample data seeder
├── tests/
│   └── fifo.test.js             # Jest tests for FIFO logic
└── openapi/
    └── portfolio.yaml            # OpenAPI 3.0 specification
```

## Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

This will install:
- `joi` - Request validation
- `mongoose` - MongoDB ODM
- `jest` - Testing framework (dev)

### 2. Seed Sample Data

```bash
npm run seed:portfolio
```

This creates:
- 5 sample issuers (Tata Motors, Infosys, HDFC Bank, Reliance, TCS)
- Sample buy/sell transactions
- Current price snapshots

**Note:** Update the demo user ID in `scripts/seed-portfolio.js` with an actual user ID from your database.

### 3. Run Tests

```bash
npm test
```

Runs Jest tests for FIFO logic including:
- Simple buy and hold
- Complete and partial sells
- Multiple lot matching
- Oversell protection
- P/L calculation

## API Endpoints

### Base URL: `/api/portfolio`

#### 1. Get Complete Portfolio

```http
GET /api/portfolio?userId={userId}
```

**Response:**
```json
{
  "summary": {
    "investment": 2500000,
    "current": 3150000,
    "pnl": 650000,
    "totalQty": 520
  },
  "holdings": [
    {
      "isin": "INE467B01029",
      "company": "Tata Motors Ltd",
      "sector": "Auto",
      "rating": "BBB+",
      "marketCap": "₹3.5L cr",
      "week52High": 1150,
      "week52Low": 550,
      "description": "India's leading automotive OEM with PV & CV portfolio.",
      "quantity": 250,
      "purchase_date": "2023-02-14T00:00:00.000Z",
      "buy_price": 450.00,
      "current_price": 715.00,
      "trade_count": 8,
      "avg_holding_days": 320,
      "interest_score": 0.8
    }
  ],
  "sold": [
    {
      "isin": "INE009A01021",
      "company": "Infosys Ltd",
      "quantity": 100,
      "buy_price": 1350.00,
      "sell_price": 1580.00,
      "purchase_date": "2023-03-10T00:00:00.000Z",
      "sell_date": "2024-01-25T00:00:00.000Z"
    }
  ]
}
```

#### 2. Get Holdings (Paginated)

```http
GET /api/portfolio/holdings?userId={userId}&page=1&limit=50
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 250,
    "totalPages": 5
  }
}
```

#### 3. Get Sold Transactions (Paginated)

```http
GET /api/portfolio/sold?userId={userId}&page=1&limit=50
```

#### 4. Add Transaction

```http
POST /api/portfolio/transactions
Content-Type: application/json

{
  "type": "BUY",
  "isin": "INE467B01029",
  "company": "Tata Motors Ltd",
  "share_count": 100,
  "price": 450.50,
  "trade_date": "2024-03-10",
  "source": "manual"
}
```

**Validations:**
- `type`: Required, must be "BUY" or "SELL"
- `isin`: Required, string
- `company`: Required, string
- `share_count`: Required, integer ≥ 1
- `price`: Required, number ≥ 0
- `trade_date`: Required, ISO date
- For SELL: Validates against current open quantity

**Response:**
```json
{
  "message": "Transaction added successfully",
  "transaction": {...}
}
```

#### 5. Bulk Update Prices (Admin)

```http
POST /api/portfolio/prices
Content-Type: application/json

[
  {
    "isin": "INE467B01029",
    "current_price": 715.50,
    "as_of": "2025-10-14T00:00:00.000Z"
  },
  {
    "isin": "INE009A01021",
    "current_price": 1580.00
  }
]
```

**Response:**
```json
{
  "message": "Price snapshots updated successfully",
  "upsertedCount": 2,
  "modifiedCount": 0
}
```

#### 6. Get Issuer by ISIN

```http
GET /api/portfolio/issuers/INE467B01029
```

**Response:**
```json
{
  "_id": "...",
  "isin": "INE467B01029",
  "company": "Tata Motors Ltd",
  "sector": "Auto",
  "rating": "BBB+",
  "market_cap": "₹3.5L cr",
  "week52_high": 1150,
  "week52_low": 550,
  "description": "India's leading automotive OEM with PV & CV portfolio."
}
```

## Data Models

### Issuer

Reference data for securities.

```javascript
{
  isin: String (unique, indexed),
  company: String,
  sector: String,
  rating: String,
  market_cap: String,
  week52_high: Number,
  week52_low: Number,
  description: String
}
```

### Transaction

Ledger of all buy/sell transactions (source of truth).

```javascript
{
  user_id: ObjectId (indexed),
  isin: String (indexed),
  company: String,
  type: 'BUY' | 'SELL',
  share_count: Number,
  price: Number,
  trade_date: Date,
  source: String  // 'broker_upload' | 'manual' | 'sync'
}
```

**Indexes:**
- `{ user_id: 1, isin: 1, trade_date: 1 }` - Compound index for efficient queries

### PriceSnapshot

Cache of current market prices.

```javascript
{
  isin: String (unique, indexed),
  current_price: Number,
  as_of: Date
}
```

## FIFO Algorithm

The FIFO (First-In-First-Out) algorithm ensures accurate position tracking:

1. **Sorting**: Transactions are sorted by `trade_date` ascending
2. **Buy Lots**: Each BUY creates a new lot with `{ quantity, price, date }`
3. **Sell Matching**: Each SELL consumes the oldest buy lots first
4. **Partial Matching**: If a sell quantity exceeds a lot, it spans multiple lots
5. **Realized P/L**: For each matched lot, we calculate `(sell_price - buy_price) × quantity`

### Example

```
Transactions:
1. BUY  100 @ ₹50  on 2023-01-01
2. BUY  150 @ ₹60  on 2023-03-01
3. SELL 120 @ ₹80  on 2023-06-01

FIFO Processing:
- Sell matches first lot (100 @ ₹50) → Realized: 100 × (₹80 - ₹50) = ₹3,000 profit
- Sell matches second lot (20 @ ₹60) → Realized: 20 × (₹80 - ₹60) = ₹400 profit

Open Lots:
- 130 shares @ ₹60 (remaining from second lot)

Realized Sales:
- 100 shares: bought ₹50, sold ₹80, profit ₹3,000
- 20 shares: bought ₹60, sold ₹80, profit ₹400
```

## Interest Score Calculation

Interest score (0 to 1) indicates which holdings are most significant:

```javascript
qtyScore = holding.quantity / totalQuantity
tradeScore = trade_count / totalTrades
holdScore = avg_holding_days / maxHoldingDays

interest_score = 0.5 × qtyScore + 0.3 × tradeScore + 0.2 × holdScore
```

**Weights:**
- 50% based on quantity (larger positions rank higher)
- 30% based on trade frequency (actively traded positions rank higher)
- 20% based on holding period (long-term holdings rank higher)

## Field Naming Convention

All API responses use **snake_case** to match frontend expectations:

- ✅ `purchase_date`, `buy_price`, `current_price`
- ✅ `share_count`, `trade_count`, `avg_holding_days`
- ✅ `interest_score`, `week52_high`, `week52_low`

## Error Handling

### Common Errors

**400 Bad Request:**
- Missing userId
- Invalid request body (Joi validation)
- Attempting to sell more shares than available

**404 Not Found:**
- Issuer not found for given ISIN

**500 Internal Server Error:**
- Database connection issues
- Unexpected errors (logged and passed to error middleware)

### Example Error Response

```json
{
  "error": "Cannot sell 100 shares of INE467B01029. Only 50 shares available."
}
```

## Testing

Run all tests:
```bash
npm test
```

Run specific test file:
```bash
npx jest tests/fifo.test.js
```

Watch mode:
```bash
npx jest --watch
```

### Test Coverage

The test suite covers:
- ✅ Simple buy and hold scenarios
- ✅ Complete sell of single lot
- ✅ Partial sell from single lot
- ✅ Partial sells from multiple lots (FIFO order)
- ✅ Multiple buy/sell cycles
- ✅ Multiple ISINs independently
- ✅ Oversell protection
- ✅ Trade count calculation
- ✅ Average holding days calculation
- ✅ Realized P/L correctness

## Integration with Existing System

### Authentication

The portfolio routes support two authentication modes:

1. **JWT Middleware** (recommended):
   ```javascript
   // Uncomment in portfolio.routes.js
   const requireAuth = require('../middleware/requireAuth');
   router.use(requireAuth);
   ```
   
   Then access user ID via `req.user.id`

2. **Query Parameter Fallback**:
   ```
   GET /api/portfolio?userId=507f1f77bcf86cd799439011
   ```
   
   Useful for development/testing

### CORS

The portfolio module inherits CORS settings from `server.js`. No additional configuration needed.

### Database

Uses the existing MongoDB connection configured in `config/db.js`.

## Performance Considerations

### Indexes

Critical indexes for performance:

```javascript
// Transaction
{ user_id: 1, isin: 1, trade_date: 1 }

// Issuer
{ isin: 1 } (unique)

// PriceSnapshot
{ isin: 1 } (unique)
```

### Optimization Tips

1. **Price Updates**: Run a nightly cron job to bulk update `PriceSnapshot` from your market data feed
2. **Caching**: Consider caching portfolio data for 5-15 minutes in Redis for frequent queries
3. **Pagination**: Always use pagination for holdings/sold endpoints in production
4. **Lean Queries**: The service uses `.lean()` for faster read-only queries

## OpenAPI Documentation

View the complete API specification in `backend/openapi/portfolio.yaml`.

To use with Swagger UI:
1. Install Swagger UI Express: `npm install swagger-ui-express`
2. Add to `server.js`:
   ```javascript
   const swaggerUi = require('swagger-ui-express');
   const YAML = require('yamljs');
   const swaggerDocument = YAML.load('./openapi/portfolio.yaml');
   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
   ```
3. Visit `http://localhost:5000/api-docs`

## Future Enhancements

Potential features for future versions:

- [ ] Dividend tracking
- [ ] Corporate actions (splits, bonuses)
- [ ] Tax harvesting suggestions
- [ ] Benchmark comparison (Nifty 50, Sensex)
- [ ] Export to Excel/PDF
- [ ] Real-time price updates via WebSocket
- [ ] Portfolio rebalancing recommendations
- [ ] Sector allocation visualization data
- [ ] Historical portfolio value chart

## Support

For issues or questions:
1. Check the OpenAPI spec in `openapi/portfolio.yaml`
2. Review test cases in `tests/fifo.test.js`
3. Run the seed script to see sample data: `npm run seed:portfolio`

## License

Same as the main project.

