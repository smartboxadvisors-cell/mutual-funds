// src/components/Trading.jsx
import { useState, useEffect } from 'react';
import TradingUploadSection from './TradingUploadSection';
import styles from '../styles/trading.module.css';

export default function Trading() {
  const [watchlist, setWatchlist] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [isBuy, setIsBuy] = useState(true);
  const [tradingTransactions, setTradingTransactions] = useState([]);

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

      {/* Portfolio Summary Cards */}
      <div className={styles.portfolioSummary}>
        <div className={styles.summaryCard}>
          <h3>Total Portfolio Value</h3>
          <p className={styles.value}>
            {formatCurrency(portfolio.reduce((sum, pos) => sum + pos.totalValue, 0))}
          </p>
        </div>
        <div className={styles.summaryCard}>
          <h3>Total P&L</h3>
          <p className={`${styles.value} ${portfolio.reduce((sum, pos) => sum + pos.pnl, 0) >= 0 ? styles.positive : styles.negative}`}>
            {formatCurrency(portfolio.reduce((sum, pos) => sum + pos.pnl, 0))}
          </p>
        </div>
        <div className={styles.summaryCard}>
          <h3>Total Positions</h3>
          <p className={styles.value}>{portfolio.length}</p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Market Watch */}
        <div className={styles.section}>
          <h2>Market Watch</h2>
          <div className={styles.watchlistControls}>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className={styles.symbolSelect}
            >
              <option value="">Select Symbol</option>
              {Object.keys(marketData).map(symbol => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
            </select>
            <button onClick={handleAddToWatchlist} className={styles.btn}>
              Add to Watchlist
            </button>
          </div>

          <div className={styles.marketData}>
            <div className={styles.marketGrid}>
              {watchlist.length > 0 ? watchlist.map(symbol => {
                const data = marketData[symbol];
                if (!data) return null;

                return (
                  <div key={symbol} className={styles.marketCard}>
                    <div className={styles.cardHeader}>
                      <h3>{symbol}</h3>
                      <button
                        onClick={() => handleRemoveFromWatchlist(symbol)}
                        className={styles.removeBtn}
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.cardContent}>
                      <p className={styles.price}>{formatCurrency(data.price)}</p>
                      <p className={`${styles.change} ${data.change >= 0 ? styles.positive : styles.negative}`}>
                        {data.change >= 0 ? '+' : ''}{data.change}%
                      </p>
                      <p className={styles.volume}>Vol: {formatNumber(data.volume)}</p>
                    </div>
                  </div>
                );
              }) : (
                <p className={styles.empty}>No symbols in watchlist. Add some symbols to track.</p>
              )}
            </div>
          </div>
        </div>

        {/* Trading Panel */}
        <div className={styles.section}>
          <h2>Quick Trade</h2>
          <div className={styles.tradingPanel}>
            <div className={styles.tradeType}>
              <button
                className={`${styles.tradeBtn} ${isBuy ? styles.active : ''}`}
                onClick={() => setIsBuy(true)}
              >
                Buy
              </button>
              <button
                className={`${styles.tradeBtn} ${!isBuy ? styles.active : ''}`}
                onClick={() => setIsBuy(false)}
              >
                Sell
              </button>
            </div>

            <div className={styles.tradeForm}>
              <div className={styles.formGroup}>
                <label>Symbol</label>
                <select className={styles.input}>
                  <option value="">Select Symbol</option>
                  {Object.keys(marketData).map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={styles.input}
                  placeholder="Enter quantity"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={styles.input}
                  placeholder="Enter price"
                />
              </div>

              <button
                className={`${styles.btn} ${styles.tradeBtn}`}
                onClick={() => {
                  const symbol = 'RELIANCE'; // In a real app, get from form
                  handleTrade(isBuy ? 'buy' : 'sell', symbol, quantity, price);
                }}
              >
                {isBuy ? 'Buy' : 'Sell'} Order
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Positions */}
        <div className={styles.section}>
          <h2>Portfolio Positions</h2>
          <div className={styles.portfolioTable}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Quantity</th>
                  <th>Avg Price</th>
                  <th>Current Price</th>
                  <th>Total Value</th>
                  <th>P&L</th>
                  <th>P&L %</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map(position => (
                  <tr key={position.id}>
                    <td className={styles.symbol}>{position.symbol}</td>
                    <td>{position.name}</td>
                    <td>{formatNumber(position.quantity)}</td>
                    <td>{formatCurrency(position.avgPrice)}</td>
                    <td>{formatCurrency(position.currentPrice)}</td>
                    <td>{formatCurrency(position.totalValue)}</td>
                    <td className={`${position.pnl >= 0 ? styles.positive : styles.negative}`}>
                      {formatCurrency(position.pnl)}
                    </td>
                    <td className={`${position.pnlPercent >= 0 ? styles.positive : styles.negative}`}>
                      {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                    </td>
                    <td>
                      <button className={`${styles.btn} ${styles.small}`}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portfolio.length === 0 && (
              <p className={styles.empty}>No positions yet. Start trading to see your portfolio here.</p>
            )}
          </div>
        </div>

        {/* Trading Transactions Table */}
        {tradingTransactions.length > 0 && (
          <div className={styles.section}>
            <h2>Trading Transactions</h2>
            <div className={styles.transactionsTable}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Exchange</th>
                    <th>Trade Date</th>
                    <th>Trade Time</th>
                    <th>ISIN</th>
                    <th>Issuer Details</th>
                    <th>Maturity</th>
                    <th>Amount</th>
                    <th>Price</th>
                    <th>Yield</th>
                    <th>Status</th>
                    <th>Deal Type</th>
                  </tr>
                </thead>
                <tbody>
                  {tradingTransactions.map((transaction, index) => (
                    <tr key={transaction.transactionId || index}>
                      <td>{transaction.exchange || '-'}</td>
                      <td>{transaction.date || '-'}</td>
                      <td>{transaction.tradeTime || '-'}</td>
                      <td className={styles.isin}>{transaction.isin || '-'}</td>
                      <td className={styles.issuer}>{transaction.issuerDetails || '-'}</td>
                      <td>{transaction.maturity || '-'}</td>
                      <td className={styles.amount}>{formatCurrency(transaction.amount || 0)}</td>
                      <td className={styles.price}>{formatCurrency(transaction.price || 0)}</td>
                      <td className={styles.yield}>{transaction.yield || '-'}</td>
                      <td className={`${styles.status} ${transaction.status?.toLowerCase() === 'executed' ? styles.executed : styles.pending}`}>
                        {transaction.status || '-'}
                      </td>
                      <td className={`${styles.dealType} ${transaction.type?.toLowerCase() === 'buy' ? styles.buy : styles.sell}`}>
                        {transaction.dealType || transaction.type || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
