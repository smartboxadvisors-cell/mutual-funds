// src/components/Trading.jsx
import React, { useState, useEffect } from 'react';
import TradingUploadSection from './TradingUploadSection';
import Pagination from './Pagination';
import styles from '../styles/trading.module.css';

export default function Trading() {
  const [watchlist, setWatchlist] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [isBuy, setIsBuy] = useState(true);
  const [tradingTransactions, setTradingTransactions] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Show 50 transactions per page

  // Sample trading data - in a real app, this would come from an API
  const [portfolio, setPortfolio] = useState([
    {
      id: 1,
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd.',
      quantity: 100,
      avgPrice: 2450.50,
      currentPrice: 2480.75,
      totalValue: 248075,
      pnl: 3025,
      pnlPercent: 1.23
    },
    {
      id: 2,
      symbol: 'TCS',
      name: 'Tata Consultancy Services Ltd.',
      quantity: 50,
      avgPrice: 3200.00,
      currentPrice: 3180.25,
      totalValue: 159012.50,
      pnl: -987.50,
      pnlPercent: -0.62
    },
    {
      id: 3,
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Ltd.',
      quantity: 75,
      avgPrice: 1650.80,
      currentPrice: 1680.40,
      totalValue: 126030,
      pnl: 2220,
      pnlPercent: 1.79
    }
  ]);

  const [marketData] = useState({
    'RELIANCE': { price: 2480.75, change: 1.23, volume: 1245678 },
    'TCS': { price: 3180.25, change: -0.62, volume: 876543 },
    'HDFCBANK': { price: 1680.40, change: 1.79, volume: 987654 },
    'INFY': { price: 1456.80, change: 0.85, volume: 654321 },
    'ICICIBANK': { price: 1056.90, change: -1.15, volume: 1456789 },
    'KOTAKBANK': { price: 1789.45, change: 2.34, volume: 567890 },
    'LT': { price: 2345.60, change: 1.78, volume: 789012 },
    'AXISBANK': { price: 1123.45, change: -0.45, volume: 934567 }
  });

  const handleAddToWatchlist = () => {
    if (selectedSymbol && !watchlist.includes(selectedSymbol)) {
      setWatchlist([...watchlist, selectedSymbol]);
    }
  };

  const handleRemoveFromWatchlist = (symbol) => {
    setWatchlist(watchlist.filter(item => item !== symbol));
  };

  const handleTrade = (type, symbol, qty, px) => {
    if (!qty || !px) {
      alert('Please enter quantity and price');
      return;
    }

    const newPosition = {
      id: Date.now(),
      symbol,
      name: `${symbol} Corporation`,
      quantity: parseInt(qty),
      avgPrice: parseFloat(px),
      currentPrice: parseFloat(px),
      totalValue: parseInt(qty) * parseFloat(px),
      pnl: 0,
      pnlPercent: 0
    };

    if (type === 'buy') {
      // Add or update position
      setPortfolio(prev => {
        const existing = prev.find(p => p.symbol === symbol);
        if (existing) {
          const totalQty = existing.quantity + parseInt(qty);
          const totalCost = (existing.quantity * existing.avgPrice) + (parseInt(qty) * parseFloat(px));
          const newAvgPrice = totalCost / totalQty;

          return prev.map(p =>
            p.symbol === symbol
              ? { ...p, quantity: totalQty, avgPrice: newAvgPrice, totalValue: totalQty * newAvgPrice }
              : p
          );
        }
        return [...prev, newPosition];
      });
    } else {
      // Sell - reduce quantity or remove position
      setPortfolio(prev => {
        const existing = prev.find(p => p.symbol === symbol);
        if (!existing) return prev;

        const newQty = existing.quantity - parseInt(qty);
        if (newQty <= 0) {
          return prev.filter(p => p.symbol !== symbol);
        }

        return prev.map(p =>
          p.symbol === symbol
            ? { ...p, quantity: newQty, totalValue: newQty * p.avgPrice }
            : p
        );
      });
    }

    setQuantity('');
    setPrice('');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  // Pagination logic
  const totalPages = Math.ceil(tradingTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTransactions = tradingTransactions.slice(startIndex, endIndex);

  // Reset to page 1 when transactions change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [tradingTransactions.length, totalPages, currentPage]);

  return (
    <div className={styles.container}>
      {/* Trading Data Upload */}
      <TradingUploadSection
        onUploadSuccess={(result) => {
          console.log('Trading data uploaded:', result);

          // Store uploaded transactions for display
          if (result.transactions && result.transactions.length > 0) {
            setTradingTransactions(prev => [...prev, ...result.transactions]);
          }

          // Update portfolio with uploaded data
          if (result.portfolioUpdates && result.portfolioUpdates.length > 0) {
            const updatedPortfolio = result.portfolioUpdates.map(update => ({
              id: Date.now() + Math.random(),
              symbol: update.symbol,
              name: `${update.symbol} Corporation`,
              quantity: update.totalQuantity,
              avgPrice: update.avgPrice,
              currentPrice: update.avgPrice, // Use avg price as current for now
              totalValue: update.totalQuantity * update.avgPrice,
              pnl: 0,
              pnlPercent: 0
            }));

            // Merge with existing portfolio
            setPortfolio(prev => {
              const merged = [...prev];
              updatedPortfolio.forEach(newPos => {
                const existingIndex = merged.findIndex(p => p.symbol === newPos.symbol);
                if (existingIndex >= 0) {
                  merged[existingIndex] = newPos;
                } else {
                  merged.push(newPos);
                }
              });
              return merged;
            });
          }
        }}
      />

      {/* Trading Transactions Table */}
      {tradingTransactions.length > 0 && (
        <div className={styles.section}>
          <h2>Trading Transactions</h2>
          <div className={styles.transactionsTable}>
            <table className={styles.table}>
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
              <tbody>
                {currentTransactions.map((transaction, index) => (
                  <tr key={transaction.transactionId || index}>
                    <td className={styles.exchange}>{transaction.exchange || '-'}</td>
                    <td>{transaction.serialNo || '-'}</td>
                    <td className={styles.isin}>{transaction.isin || '-'}</td>
                    <td className={styles.symbol}>{transaction.symbol || '-'}</td>
                    <td className={styles.issuer}>{transaction.issuerName || '-'}</td>
                    <td className={styles.coupon}>{transaction.coupon || '-'}</td>
                    <td>{transaction.maturityDate || '-'}</td>
                    <td>{transaction.tradeDate || '-'}</td>
                    <td className={styles.settlementType}>{transaction.settlementType || '-'}</td>
                    <td className={styles.tradeAmount}>{formatCurrency(transaction.tradeAmount || 0)}</td>
                    <td className={styles.tradePrice}>{formatCurrency(transaction.tradePrice || 0)}</td>
                    <td className={styles.yield}>{transaction.yield || '-'}</td>
                    <td>{transaction.tradeTime || '-'}</td>
                    <td className={`${styles.orderType} ${transaction.orderType?.toLowerCase() === 'buy' ? styles.buy : styles.sell}`}>
                      {transaction.orderType || '-'}
                    </td>
                    <td className={`${styles.settlementStatus} ${transaction.settlementStatus?.toLowerCase() === 'settled' ? styles.settled : styles.pending}`}>
                      {transaction.settlementStatus || '-'}
                    </td>
                    <td>{transaction.settlementDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.paginationWrapper}>
              <Pagination
                page={currentPage}
                setPage={setCurrentPage}
                totalPages={totalPages}
                disabled={false}
              />
              <div className={styles.paginationInfo}>
                Showing {startIndex + 1}-{Math.min(endIndex, tradingTransactions.length)} of {tradingTransactions.length} transactions
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
