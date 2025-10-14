/**
 * FIFO (First-In-First-Out) position matching utility
 * Computes open holdings and realized sold transactions from a stream of BUY/SELL transactions
 */

/**
 * @typedef {Object} Transaction
 * @property {string} isin
 * @property {string} company
 * @property {string} type - 'BUY' or 'SELL'
 * @property {number} share_count
 * @property {number} price
 * @property {Date} trade_date
 */

/**
 * @typedef {Object} OpenLot
 * @property {number} quantity - remaining shares
 * @property {number} price - buy price
 * @property {Date} date - purchase date
 */

/**
 * @typedef {Object} RealizedSale
 * @property {number} quantity
 * @property {number} buy_price
 * @property {number} sell_price
 * @property {Date} purchase_date
 * @property {Date} sell_date
 */

/**
 * Compute positions using FIFO matching
 * @param {Transaction[]} transactions - All transactions for a user, should be sorted by trade_date asc
 * @returns {Object} - { openLotsByIsin, realizedByIsin, tradeCountByIsin, avgHoldingDaysByIsin }
 */
function computePositions(transactions) {
  // Group transactions by ISIN
  const txByIsin = {};
  
  transactions.forEach(tx => {
    if (!txByIsin[tx.isin]) {
      txByIsin[tx.isin] = [];
    }
    txByIsin[tx.isin].push(tx);
  });

  const openLotsByIsin = {};        // { isin: [{ quantity, price, date }, ...] }
  const realizedByIsin = {};        // { isin: [{ quantity, buy_price, sell_price, purchase_date, sell_date }, ...] }
  const tradeCountByIsin = {};      // { isin: count }
  const avgHoldingDaysByIsin = {};  // { isin: avgDays }

  // Process each ISIN
  for (const isin in txByIsin) {
    const txList = txByIsin[isin];
    
    // Sort by trade_date ascending (FIFO)
    txList.sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
    
    const buyLots = [];  // Stack of open buy lots
    const realized = []; // Realized sales
    let tradeCount = txList.length;

    for (const tx of txList) {
      if (tx.type === 'BUY') {
        buyLots.push({
          quantity: tx.share_count,
          price: tx.price,
          date: tx.trade_date,
        });
      } else if (tx.type === 'SELL') {
        let remainingToSell = tx.share_count;
        
        // Match against buy lots FIFO
        while (remainingToSell > 0 && buyLots.length > 0) {
          const lot = buyLots[0];
          const soldQty = Math.min(lot.quantity, remainingToSell);
          
          // Record realized sale
          realized.push({
            quantity: soldQty,
            buy_price: lot.price,
            sell_price: tx.price,
            purchase_date: lot.date,
            sell_date: tx.trade_date,
          });
          
          lot.quantity -= soldQty;
          remainingToSell -= soldQty;
          
          if (lot.quantity === 0) {
            buyLots.shift(); // Remove exhausted lot
          }
        }
        
        // If remainingToSell > 0, it means overselling (shouldn't happen with validation)
        if (remainingToSell > 0) {
          console.warn(`Oversell detected for ISIN ${isin}: ${remainingToSell} shares without matching buy lots`);
        }
      }
    }

    openLotsByIsin[isin] = buyLots;
    realizedByIsin[isin] = realized;
    tradeCountByIsin[isin] = tradeCount;

    // Calculate average holding days for open lots
    if (buyLots.length > 0) {
      const now = new Date();
      let totalDays = 0;
      let totalQty = 0;
      
      buyLots.forEach(lot => {
        const days = Math.floor((now - new Date(lot.date)) / (1000 * 60 * 60 * 24));
        totalDays += days * lot.quantity; // Weight by quantity
        totalQty += lot.quantity;
      });
      
      avgHoldingDaysByIsin[isin] = totalQty > 0 ? totalDays / totalQty : 0;
    } else {
      avgHoldingDaysByIsin[isin] = 0;
    }
  }

  return {
    openLotsByIsin,
    realizedByIsin,
    tradeCountByIsin,
    avgHoldingDaysByIsin,
  };
}

/**
 * Calculate current open quantity for a given ISIN
 * @param {string} isin
 * @param {Transaction[]} transactions
 * @returns {number} - total open quantity
 */
function getCurrentOpenQuantity(isin, transactions) {
  const filtered = transactions.filter(tx => tx.isin === isin);
  filtered.sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
  
  let openQty = 0;
  filtered.forEach(tx => {
    if (tx.type === 'BUY') {
      openQty += tx.share_count;
    } else if (tx.type === 'SELL') {
      openQty -= tx.share_count;
    }
  });
  
  return Math.max(0, openQty);
}

module.exports = {
  computePositions,
  getCurrentOpenQuantity,
};

