# Portfolio Setup Guide

## Quick Setup

### 1. Create Demo User with Portfolio Data

```bash
cd backend
npm run create:demo-user
```

This will:
- Create a demo user (email: demo@ppcapital.com)
- Add 7 different stock holdings
- Add realistic buy/sell transactions
- Set up price snapshots
- Auto-generate `Frontend/src/config.js` with the user ID

### 2. Start Backend Server

```bash
npm run dev
```

### 3. Start Frontend (in another terminal)

```bash
cd Frontend
npm run dev
```

### 4. Access Portfolio

1. Login to the application
2. Click on "Portfolio" in the navigation
3. The user ID will be automatically loaded from config.js
4. Or manually enter the user ID shown in the terminal

## Features Available

### ✅ View Portfolio
- Summary cards (Investment, Current Value, P&L, Total Shares)
- Holdings table with all positions
- Realized (sold) transactions
- Interest score for each holding

### ✅ Filters
- **Search**: Search by company name or ISIN
- **Sector Filter**: Filter holdings by sector
- **Refresh**: Reload data from server

### ✅ Add Transactions
1. Click "+ Add Transaction" button
2. Fill in the form:
   - Type: BUY or SELL
   - ISIN (e.g., INE467B01029)
   - Company Name
   - Quantity
   - Price per Share
   - Trade Date
3. Submit to add to portfolio

### ✅ View Details
- Click "View" on any holding to see detailed information
- Company description
- Market cap, 52-week high/low
- Rating, sector
- Trade count and holding period

### ✅ Change User
- Click "Change User" to view another user's portfolio
- Enter different user ID
- Saved in localStorage for next visit

## Sample ISINs to Try

When adding new transactions, use these ISINs:

| ISIN | Company |
|------|---------|
| INE467B01029 | Tata Motors Ltd |
| INE009A01021 | Infosys Ltd |
| INE040A01034 | HDFC Bank Ltd |
| INE002A01018 | Reliance Industries Ltd |
| INE155A01022 | Tata Consultancy Services Ltd |
| INE019A01038 | Asian Paints Ltd |
| INE397D01024 | Bajaj Finance Ltd |

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| GET /api/portfolio?userId={id} | Fetch complete portfolio |
| POST /api/portfolio/transactions | Add new buy/sell transaction |
| GET /api/portfolio/issuers/{isin} | Get issuer details |

## Troubleshooting

### "User ID required" error
- Run `npm run create:demo-user` in backend
- Copy the user ID from terminal output
- Paste it in the Portfolio page

### Empty portfolio
- Make sure backend server is running
- Check console for API errors
- Verify MongoDB connection

### Cannot add transaction
- Ensure ISIN exists in database
- For SELL transactions, verify you have enough shares
- Check backend console for validation errors

## Demo User Credentials

After running `npm run create:demo-user`:

```
Email: demo@ppcapital.com
Password: demo123
User ID: (shown in terminal)
```

The portfolio includes:
- 6 active holdings
- Mix of IT, Banking, Auto, NBFC sectors
- Realized P&L from sold positions
- ~16 transactions total

Enjoy exploring your portfolio! 📊

