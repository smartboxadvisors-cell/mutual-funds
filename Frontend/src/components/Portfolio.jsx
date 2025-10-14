import { useState, useEffect } from 'react';
import { getPortfolio, addTransaction } from '../api/portfolio';
import styles from '../styles/portfolio.module.css';

// Try to import demo user ID, fallback to prompt
let DEMO_USER_ID = null;
try {
  const config = await import('../config.js');
  DEMO_USER_ID = config.DEMO_USER_ID;
} catch {
  // Config file doesn't exist yet
}

export default function Portfolio() {
  const [portfolioData, setPortfolioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('holdings');
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [userId, setUserId] = useState(DEMO_USER_ID || '');
  const [userIdInput, setUserIdInput] = useState('');
  const [isUserIdSet, setIsUserIdSet] = useState(!!DEMO_USER_ID);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState(''); // BUY or SELL

  // Form states
  const [formData, setFormData] = useState({
    type: 'BUY',
    isin: '',
    company: '',
    share_count: '',
    price: '',
    trade_date: new Date().toISOString().split('T')[0],
    source: 'manual',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Fetch portfolio data
  const fetchPortfolio = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getPortfolio(userId);
      setPortfolioData(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isUserIdSet && userId) {
      fetchPortfolio();
    }
  }, [userId, isUserIdSet]);

  const handleSetUserId = () => {
    if (userIdInput.trim()) {
      setUserId(userIdInput.trim());
      setIsUserIdSet(true);
      localStorage.setItem('portfolioUserId', userIdInput.trim());
    }
  };

  // Load saved user ID from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('portfolioUserId');
    if (saved && !DEMO_USER_ID) {
      setUserId(saved);
      setUserIdInput(saved);
      setIsUserIdSet(true);
    }
  }, []);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculatePnL = (holding) => {
    return (holding.current_price - holding.buy_price) * holding.quantity;
  };

  const calculatePnLPercentage = (holding) => {
    return ((holding.current_price - holding.buy_price) / holding.buy_price * 100).toFixed(2);
  };

  const calculateSoldPnL = (sale) => {
    return (sale.sell_price - sale.buy_price) * sale.quantity;
  };

  // Filter holdings
  const getFilteredHoldings = () => {
    if (!portfolioData?.holdings) return [];
    
    return portfolioData.holdings.filter(holding => {
      const matchesSearch = !searchTerm || 
        holding.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holding.isin.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSector = !sectorFilter || holding.sector === sectorFilter;
      
      return matchesSearch && matchesSector;
    });
  };

  // Filter sold transactions
  const getFilteredSold = () => {
    if (!portfolioData?.sold) return [];
    
    return portfolioData.sold.filter(sale => {
      const matchesSearch = !searchTerm || 
        sale.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.isin.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  };

  // Get unique sectors
  const getUniqueSectors = () => {
    if (!portfolioData?.holdings) return [];
    return [...new Set(portfolioData.holdings.map(h => h.sector))].filter(Boolean).sort();
  };

  // Handle form submission
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await addTransaction(userId, {
        ...formData,
        share_count: parseInt(formData.share_count),
        price: parseFloat(formData.price),
      });

      // Reset form and refresh data
      setFormData({
        type: 'BUY',
        isin: '',
        company: '',
        share_count: '',
        price: '',
        trade_date: new Date().toISOString().split('T')[0],
        source: 'manual',
      });
      setShowAddForm(false);
      await fetchPortfolio();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // User ID Selection Screen
  if (!isUserIdSet) {
    return (
      <div className={styles.userIdPrompt}>
        <div className={styles.userIdCard}>
          <h2>Enter User ID</h2>
          <p>Please enter your user ID to view your portfolio</p>
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="Enter User ID"
            className={styles.userIdInput}
          />
          <button onClick={handleSetUserId} className={styles.userIdBtn}>
            View Portfolio
          </button>
          <p className={styles.helpText}>
            Don't have a user ID? Run: <code>npm run create:demo-user</code> in backend
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.portfolioContainer}>
        <div className={styles.loading}>Loading portfolio...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.portfolioContainer}>
        <div className={styles.error}>
          Error: {error}
          <button onClick={fetchPortfolio} className={styles.retryBtn}>Retry</button>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return null;
  }

  const filteredHoldings = getFilteredHoldings();
  const filteredSold = getFilteredSold();
  const sectors = getUniqueSectors();

  return (
    <div className={styles.portfolioContainer}>
      {/* User Info & Actions */}
      <div className={styles.headerSection}>
        <div className={styles.userInfo}>
          <span className={styles.userLabel}>User ID:</span>
          <span className={styles.userIdBadge}>{userId}</span>
          <button 
            onClick={() => {
              setIsUserIdSet(false);
              setUserId('');
              localStorage.removeItem('portfolioUserId');
            }}
            className={styles.changeUserBtn}
          >
            Change User
          </button>
        </div>
        <button 
          onClick={() => setShowAddForm(true)} 
          className={styles.addTransactionBtn}
        >
          + Add Transaction
        </button>
      </div>

      {/* Summary Cards */}
      <div className={styles.summarySection}>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>Total Investment</div>
          <div className={styles.cardValue}>{formatCurrency(portfolioData.summary.investment)}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>Current Value</div>
          <div className={styles.cardValue}>{formatCurrency(portfolioData.summary.current)}</div>
        </div>
        <div className={`${styles.summaryCard} ${styles.pnlCard}`}>
          <div className={styles.cardLabel}>Total P&L</div>
          <div className={`${styles.cardValue} ${portfolioData.summary.pnl >= 0 ? styles.profit : styles.loss}`}>
            {formatCurrency(portfolioData.summary.pnl)}
          </div>
          <div className={styles.cardSubtext}>
            {((portfolioData.summary.pnl / portfolioData.summary.investment) * 100).toFixed(2)}%
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>Total Shares</div>
          <div className={styles.cardValue}>{portfolioData.summary.totalQty}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersSection}>
        <input
          type="text"
          placeholder="Search by company or ISIN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        
        {activeTab === 'holdings' && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Sectors</option>
            {sectors.map(sector => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        )}

        <button onClick={fetchPortfolio} className={styles.refreshBtn}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tab} ${activeTab === 'holdings' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('holdings')}
        >
          Holdings ({filteredHoldings.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'sold' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('sold')}
        >
          Realized ({filteredSold.length})
        </button>
      </div>

      {/* Holdings Table */}
      {activeTab === 'holdings' && (
        <div className={styles.tableContainer}>
          {filteredHoldings.length === 0 ? (
            <div className={styles.noData}>No holdings found</div>
          ) : (
            <table className={styles.portfolioTable}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sector</th>
                  <th>Qty</th>
                  <th>Avg Buy</th>
                  <th>CMP</th>
                  <th>Investment</th>
                  <th>Current Value</th>
                  <th>P&L</th>
                  <th>P&L %</th>
                  <th>Interest Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHoldings.map((holding) => {
                  const pnl = calculatePnL(holding);
                  const pnlPercent = calculatePnLPercentage(holding);
                  const investment = holding.buy_price * holding.quantity;
                  const currentValue = holding.current_price * holding.quantity;

                  return (
                    <tr key={holding.isin} className={styles.tableRow}>
                      <td>
                        <div className={styles.companyCell}>
                          <div className={styles.companyName}>{holding.company}</div>
                          <div className={styles.isin}>{holding.isin}</div>
                        </div>
                      </td>
                      <td>{holding.sector}</td>
                      <td>{holding.quantity}</td>
                      <td>{formatCurrency(holding.buy_price)}</td>
                      <td>{formatCurrency(holding.current_price)}</td>
                      <td>{formatCurrency(investment)}</td>
                      <td>{formatCurrency(currentValue)}</td>
                      <td className={pnl >= 0 ? styles.profit : styles.loss}>
                        {formatCurrency(pnl)}
                      </td>
                      <td className={pnl >= 0 ? styles.profit : styles.loss}>
                        {pnlPercent}%
                      </td>
                      <td>
                        <div className={styles.scoreBar}>
                          <div
                            className={styles.scoreFill}
                            style={{ width: `${holding.interest_score * 100}%` }}
                          />
                          <span className={styles.scoreText}>
                            {(holding.interest_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          className={styles.detailsBtn}
                          onClick={() => setSelectedHolding(holding)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Sold Table */}
      {activeTab === 'sold' && (
        <div className={styles.tableContainer}>
          {filteredSold.length === 0 ? (
            <div className={styles.noData}>No realized transactions found</div>
          ) : (
            <table className={styles.portfolioTable}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Qty</th>
                  <th>Buy Price</th>
                  <th>Sell Price</th>
                  <th>Purchase Date</th>
                  <th>Sell Date</th>
                  <th>Realized P&L</th>
                  <th>P&L %</th>
                </tr>
              </thead>
              <tbody>
                {filteredSold.map((sale, idx) => {
                  const pnl = calculateSoldPnL(sale);
                  const pnlPercent = ((sale.sell_price - sale.buy_price) / sale.buy_price * 100).toFixed(2);

                  return (
                    <tr key={idx} className={styles.tableRow}>
                      <td>
                        <div className={styles.companyCell}>
                          <div className={styles.companyName}>{sale.company}</div>
                          <div className={styles.isin}>{sale.isin}</div>
                        </div>
                      </td>
                      <td>{sale.quantity}</td>
                      <td>{formatCurrency(sale.buy_price)}</td>
                      <td>{formatCurrency(sale.sell_price)}</td>
                      <td>{formatDate(sale.purchase_date)}</td>
                      <td>{formatDate(sale.sell_date)}</td>
                      <td className={pnl >= 0 ? styles.profit : styles.loss}>
                        {formatCurrency(pnl)}
                      </td>
                      <td className={pnl >= 0 ? styles.profit : styles.loss}>
                        {pnlPercent}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal for Holding Details */}
      {selectedHolding && (
        <div className={styles.modalOverlay} onClick={() => setSelectedHolding(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{selectedHolding.company}</h2>
              <button className={styles.closeBtn} onClick={() => setSelectedHolding(null)}>
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>ISIN:</span>
                <span>{selectedHolding.isin}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Sector:</span>
                <span>{selectedHolding.sector}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Rating:</span>
                <span>{selectedHolding.rating}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Market Cap:</span>
                <span>{selectedHolding.marketCap}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>52 Week High:</span>
                <span>{formatCurrency(selectedHolding.week52High)}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>52 Week Low:</span>
                <span>{formatCurrency(selectedHolding.week52Low)}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Purchase Date:</span>
                <span>{formatDate(selectedHolding.purchase_date)}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Trade Count:</span>
                <span>{selectedHolding.trade_count}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Avg Holding Days:</span>
                <span>{selectedHolding.avg_holding_days} days</span>
              </div>
              <div className={styles.modalDescription}>
                <p className={styles.modalLabel}>Description:</p>
                <p>{selectedHolding.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Form Modal */}
      {showAddForm && (
        <div className={styles.modalOverlay} onClick={() => setShowAddForm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Transaction</h2>
              <button className={styles.closeBtn} onClick={() => setShowAddForm(false)}>
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <form onSubmit={handleAddTransaction} className={styles.transactionForm}>
                {formError && <div className={styles.formError}>{formError}</div>}
                
                <div className={styles.formGroup}>
                  <label>Transaction Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    required
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>ISIN</label>
                  <input
                    type="text"
                    value={formData.isin}
                    onChange={(e) => setFormData({...formData, isin: e.target.value})}
                    placeholder="e.g., INE467B01029"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Company Name</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    placeholder="e.g., Tata Motors Ltd"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Quantity</label>
                  <input
                    type="number"
                    value={formData.share_count}
                    onChange={(e) => setFormData({...formData, share_count: e.target.value})}
                    placeholder="e.g., 100"
                    min="1"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Price per Share</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    placeholder="e.g., 450.50"
                    min="0"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Trade Date</label>
                  <input
                    type="date"
                    value={formData.trade_date}
                    onChange={(e) => setFormData({...formData, trade_date: e.target.value})}
                    required
                  />
                </div>

                <div className={styles.formActions}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    className={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className={styles.submitBtn}
                    disabled={formLoading}
                  >
                    {formLoading ? 'Adding...' : 'Add Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
