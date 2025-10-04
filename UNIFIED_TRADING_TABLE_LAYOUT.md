# Unified Trading Data Table Layout

## Analysis of BSE vs NSE Sheet Headers

### BSE Header Structure:
```
Sr No | ISIN | Symbol | Issuer Name | Coupon(%) | Maturity Date | Deal Date | Settlement Type | Trade Amount (In Rs lacs) | Trade Price (Rs) | Traded Yield (%) | Trade Time (HH:MM) | Order Type
```

### NSE Header Structure:
```
Date | Seller Deal Type | Buyer Deal Type | ISIN | Description | Price | Deal size | Settlement status | Yield | Trade Time | Settlement Date | Maturity Date
```

## Unified Column Mapping

| Unified Column | BSE Source | NSE Source | Data Type | Description |
|----------------|------------|------------|-----------|-------------|
| **Exchange** | *(Auto-detected)* | *(Auto-detected)* | Text | NSE or BSE |
| **Serial No** | Sr No | *(Calculated)* | Number | Row number |
| **ISIN** | ISIN | ISIN | Text | International Securities ID |
| **Symbol** | Symbol | *(Extract from Description)* | Text | Stock symbol |
| **Issuer Name** | Issuer Name | Description | Text | Company/issuer name |
| **Coupon %** | Coupon(%) | *(Not available)* | Number | Bond coupon rate |
| **Maturity Date** | Maturity Date | Maturity Date | Date | Bond maturity date |
| **Trade Date** | Deal Date | Date | Date | Transaction date |
| **Settlement Type** | Settlement Type | *(From deal types)* | Text | Settlement method |
| **Trade Amount** | Trade Amount (In Rs lacs) | Deal size | Number | Transaction amount |
| **Trade Price** | Trade Price (Rs) | Price | Number | Transaction price |
| **Yield %** | Traded Yield (%) | Yield | Number | Yield percentage |
| **Trade Time** | Trade Time (HH:MM) | Trade Time | Time | Transaction time |
| **Order Type** | Order Type | *(From deal types)* | Text | Buy/Sell type |
| **Settlement Status** | *(Not available)* | Settlement status | Text | Settlement status |
| **Settlement Date** | *(Not available)* | Settlement Date | Date | Settlement date |

## Smart Detection Logic

### Exchange Detection:
- **BSE Detection**: Look for columns like "Sr No", "Symbol", "Issuer Name", "Coupon(%)"
- **NSE Detection**: Look for columns like "Seller Deal Type", "Buyer Deal Type", "Description", "Deal size"

### Field Mapping:
- **Symbol Extraction**: For NSE, extract symbol from "Description" field
- **Settlement Type**: For NSE, derive from "Seller Deal Type" and "Buyer Deal Type"
- **Order Type**: For NSE, determine from deal types (BUY if contains "BUY", SELL if contains "SELL")

## Unified Table Structure

```jsx
<thead>
  <tr>
    <th>Exchange</th>
    <th>Sr No</th>
    <th>ISIN</th>
    <th>Symbol</th>
    <th>Issuer Name</th>
    <th>Coupon %</th>
    <th>Maturity Date</th>
    <th>Trade Date</th>
    <th>Settlement Type</th>
    <th>Trade Amount</th>
    <th>Trade Price</th>
    <th>Yield %</th>
    <th>Trade Time</th>
    <th>Order Type</th>
    <th>Settlement Status</th>
    <th>Settlement Date</th>
  </tr>
</thead>
```

## Sample Data Mapping

### BSE Sample Row:
```
1 | INE002A01018 | RELIANCE | Reliance Industries Ltd | 7.25 | 2025-03-15 | 2024-01-15 | T+1 | 100.50 | 2450.50 | 7.25 | 09:30 | BUY
```

**Maps to:**
```
Exchange: BSE
Sr No: 1
ISIN: INE002A01018
Symbol: RELIANCE
Issuer Name: Reliance Industries Ltd
Coupon %: 7.25
Maturity Date: 2025-03-15
Trade Date: 2024-01-15
Settlement Type: T+1
Trade Amount: 100.50
Trade Price: 2450.50
Yield %: 7.25
Trade Time: 09:30
Order Type: BUY
Settlement Status: -
Settlement Date: -
```

### NSE Sample Row:
```
2024-01-15 | SELL | BUY | INE002A01018 | Reliance Industries Ltd 7.25% 2025 | 2450.50 | 100.50 | Settled | 7.25 | 09:30 | 2024-01-16 | 2025-03-15
```

**Maps to:**
```
Exchange: NSE
Sr No: (calculated)
ISIN: INE002A01018
Symbol: RELIANCE (extracted from description)
Issuer Name: Reliance Industries Ltd 7.25% 2025
Coupon %: -
Maturity Date: 2025-03-15
Trade Date: 2024-01-15
Settlement Type: SELL-BUY
Trade Amount: 100.50
Trade Price: 2450.50
Yield %: 7.25
Trade Time: 09:30
Order Type: BUY (from Buyer Deal Type)
Settlement Status: Settled
Settlement Date: 2024-01-16
```

## Implementation Strategy

1. **Exchange Detection**: Analyze headers to determine BSE vs NSE format
2. **Column Mapping**: Create mapping logic for each exchange type
3. **Data Transformation**: Convert both formats to unified structure
4. **Table Display**: Show all 16 columns in the unified table
5. **Smart Defaults**: Fill missing fields with "-" for unavailable data

## Benefits

- ✅ **Unified View**: Single table handles both BSE and NSE data
- ✅ **Complete Information**: All available fields from both exchanges
- ✅ **Smart Detection**: Automatic exchange identification
- ✅ **Flexible Parsing**: Handles variations in column names and positions
- ✅ **Data Preservation**: No data loss when mapping between formats
