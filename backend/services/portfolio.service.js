const Transaction = require('../models/transaction.model');
const Issuer = require('../models/issuer.model');
const PriceSnapshot = require('../models/priceSnapshot.model');
const { computePositions } = require('../utils/fifo');

class PortfolioService {
  /**
   * Build complete portfolio data for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - { holdings, sold, summary }
   */
  async buildPortfolio(userId) {
    // 1. Load all transactions for the user
    const transactions = await Transaction.find({ user_id: userId })
      .sort({ trade_date: 1 })
      .lean();

    if (transactions.length === 0) {
      return {
        summary: { investment: 0, current: 0, pnl: 0, totalQty: 0 },
        holdings: [],
        sold: [],
      };
    }

    // 2. Compute positions using FIFO
    const {
      openLotsByIsin,
      realizedByIsin,
      tradeCountByIsin,
      avgHoldingDaysByIsin,
    } = computePositions(transactions);

    // 3. Load all relevant ISINs
    const allIsins = [...new Set(transactions.map(tx => tx.isin))];
    
    // 4. Load Issuers and Price Snapshots
    const [issuers, priceSnapshots] = await Promise.all([
      Issuer.find({ isin: { $in: allIsins } }).lean(),
      PriceSnapshot.find({ isin: { $in: allIsins } }).lean(),
    ]);

    // Create lookup maps
    const issuerMap = {};
    issuers.forEach(iss => {
      issuerMap[iss.isin] = iss;
    });

    const priceMap = {};
    priceSnapshots.forEach(snap => {
      priceMap[snap.isin] = snap.current_price;
    });

    // 5. Build holdings array
    const holdings = [];
    let totalInvestment = 0;
    let totalCurrent = 0;
    let totalQty = 0;

    // Calculate global stats for interest score
    let maxHoldingDays = 0;
    let totalTrades = 0;
    for (const isin in tradeCountByIsin) {
      totalTrades += tradeCountByIsin[isin];
      if (avgHoldingDaysByIsin[isin] > maxHoldingDays) {
        maxHoldingDays = avgHoldingDaysByIsin[isin];
      }
    }
    // Prevent division by zero
    if (maxHoldingDays === 0) maxHoldingDays = 1;
    if (totalTrades === 0) totalTrades = 1;

    for (const isin in openLotsByIsin) {
      const lots = openLotsByIsin[isin];
      if (lots.length === 0) continue; // No open position

      // Aggregate open lots
      let totalQuantity = 0;
      let weightedBuyPrice = 0;
      let earliestPurchaseDate = null;

      lots.forEach(lot => {
        totalQuantity += lot.quantity;
        weightedBuyPrice += lot.price * lot.quantity;
        if (!earliestPurchaseDate || new Date(lot.date) < new Date(earliestPurchaseDate)) {
          earliestPurchaseDate = lot.date;
        }
      });

      const avgBuyPrice = weightedBuyPrice / totalQuantity;
      const currentPrice = priceMap[isin] || avgBuyPrice; // Fallback to buy price if no snapshot

      const investment = avgBuyPrice * totalQuantity;
      const currentValue = currentPrice * totalQuantity;

      totalInvestment += investment;
      totalCurrent += currentValue;
      totalQty += totalQuantity;

      // Get issuer metadata
      const issuer = issuerMap[isin] || {};

      // Calculate interest score
      const qtyScore = totalQuantity / (totalQty || 1);
      const tradeScore = tradeCountByIsin[isin] / totalTrades;
      const holdScore = avgHoldingDaysByIsin[isin] / maxHoldingDays;
      const interestScore = 0.5 * qtyScore + 0.3 * tradeScore + 0.2 * holdScore;

      holdings.push({
        isin,
        company: issuer.company || transactions.find(t => t.isin === isin)?.company || 'Unknown',
        sector: issuer.sector || '—',
        rating: issuer.rating || '—',
        marketCap: issuer.market_cap || '—',
        week52High: issuer.week52_high || null,
        week52Low: issuer.week52_low || null,
        description: issuer.description || '',
        quantity: totalQuantity,
        purchase_date: earliestPurchaseDate,
        buy_price: parseFloat(avgBuyPrice.toFixed(2)),
        current_price: parseFloat(currentPrice.toFixed(2)),
        trade_count: tradeCountByIsin[isin] || 0,
        avg_holding_days: Math.round(avgHoldingDaysByIsin[isin] || 0),
        interest_score: parseFloat(interestScore.toFixed(3)),
      });
    }

    // 6. Build sold array
    const sold = [];
    for (const isin in realizedByIsin) {
      const realizedList = realizedByIsin[isin];
      const company = issuerMap[isin]?.company || transactions.find(t => t.isin === isin)?.company || 'Unknown';

      realizedList.forEach(sale => {
        sold.push({
          isin,
          company,
          quantity: sale.quantity,
          buy_price: parseFloat(sale.buy_price.toFixed(2)),
          sell_price: parseFloat(sale.sell_price.toFixed(2)),
          purchase_date: sale.purchase_date,
          sell_date: sale.sell_date,
        });
      });
    }

    // 7. Build summary
    const summary = {
      investment: Math.round(totalInvestment),
      current: Math.round(totalCurrent),
      pnl: Math.round(totalCurrent - totalInvestment),
      totalQty: Math.round(totalQty),
    };

    return { holdings, sold, summary };
  }

  /**
   * Get only holdings
   */
  async getHoldings(userId) {
    const data = await this.buildPortfolio(userId);
    return data.holdings;
  }

  /**
   * Get only sold transactions
   */
  async getSold(userId) {
    const data = await this.buildPortfolio(userId);
    return data.sold;
  }

  /**
   * Add a new transaction (with validation against open quantity for SELL)
   */
  async addTransaction(userId, txData) {
    const { type, isin, company, share_count, price, trade_date, source } = txData;

    // If SELL, validate against current open quantity
    if (type === 'SELL') {
      const existingTx = await Transaction.find({ user_id: userId, isin }).lean();
      const { openLotsByIsin } = computePositions(existingTx);
      
      const openLots = openLotsByIsin[isin] || [];
      const currentOpenQty = openLots.reduce((sum, lot) => sum + lot.quantity, 0);

      if (share_count > currentOpenQty) {
        throw new Error(
          `Cannot sell ${share_count} shares of ${isin}. Only ${currentOpenQty} shares available.`
        );
      }
    }

    // Create transaction
    const transaction = new Transaction({
      user_id: userId,
      isin,
      company,
      type,
      share_count,
      price,
      trade_date: new Date(trade_date),
      source: source || 'manual',
    });

    await transaction.save();
    return transaction;
  }

  /**
   * Bulk upsert price snapshots (admin/util)
   */
  async bulkUpsertPrices(priceUpdates) {
    const operations = priceUpdates.map(p => ({
      updateOne: {
        filter: { isin: p.isin },
        update: {
          $set: {
            current_price: p.current_price,
            as_of: p.as_of ? new Date(p.as_of) : new Date(),
          },
        },
        upsert: true,
      },
    }));

    const result = await PriceSnapshot.bulkWrite(operations);
    return result;
  }

  /**
   * Get issuer by ISIN (for modal display)
   */
  async getIssuerByIsin(isin) {
    const issuer = await Issuer.findOne({ isin }).lean();
    if (!issuer) {
      throw new Error(`Issuer not found for ISIN: ${isin}`);
    }
    return issuer;
  }
}

module.exports = new PortfolioService();

