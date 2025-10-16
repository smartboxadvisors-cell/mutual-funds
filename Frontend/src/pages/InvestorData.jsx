import { useState, useEffect, useRef } from 'react';
import { fetchInvestorData, fetchIssuers } from '../api/investorData';
import useDebounce from '../hooks/useDebounce';
import styles from '../styles/investor-data.module.css';

export default function InvestorData() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  
  const [issuerSearch, setIssuerSearch] = useState('');
  const [issuerSuggestions, setIssuerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const suggestionRef = useRef(null);
  const debouncedIssuerSearch = useDebounce(issuerSearch, 300);

  // Load data
  const loadData = async (currentPage = page, searchTerm = issuerSearch) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchInvestorData({
        page: currentPage,
        limit,
        issuer: searchTerm,
      });
      
      setData(response.items || []);
      setTotalPages(response.totalPages || 1);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Load issuer suggestions
  const loadSuggestions = async (search) => {
    if (!search || search.length < 2) {
      setIssuerSuggestions([]);
      return;
    }
    
    try {
      const response = await fetchIssuers(search);
      setIssuerSuggestions(response.issuers || []);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
      setIssuerSuggestions([]);
    }
  };

  // Load data on mount and when debounced search changes
  useEffect(() => {
    if (debouncedIssuerSearch || debouncedIssuerSearch === '') {
      setPage(1);
      loadData(1, debouncedIssuerSearch);
    }
  }, [debouncedIssuerSearch]);

  // Load suggestions when user types
  useEffect(() => {
    if (issuerSearch.length >= 2) {
      loadSuggestions(issuerSearch);
    } else {
      setIssuerSuggestions([]);
    }
  }, [issuerSearch]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = () => {
    setPage(1);
    loadData(1, issuerSearch);
  };

  const handleClear = () => {
    setIssuerSearch('');
    setPage(1);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (issuer) => {
    setIssuerSearch(issuer);
    setShowSuggestions(false);
    setPage(1);
    loadData(1, issuer);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadData(newPage, issuerSearch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Calculate totals
  const totalMarketValue = data.reduce((sum, item) => sum + (item.market_value || 0), 0);
  const totalQuantity = data.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Investor Data</h1>
        <p className={styles.subtitle}>
          Search and view issuer information including ISIN, scheme, quantity, market value, and maturity dates
        </p>
      </div>

      {/* Search Section */}
      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <div className={styles.searchFieldWrapper} ref={suggestionRef}>
            <div className={styles.searchField}>
              <label className={styles.searchLabel}>Search by Issuer Name</label>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="e.g., Aditya Birla"
                value={issuerSearch}
                onChange={(e) => {
                  setIssuerSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyPress={handleKeyPress}
                onFocus={() => setShowSuggestions(true)}
              />
            </div>
            
            {/* Suggestions Dropdown */}
            {showSuggestions && issuerSuggestions.length > 0 && (
              <div className={styles.suggestions}>
                {issuerSuggestions.map((issuer, index) => (
                  <div
                    key={index}
                    className={styles.suggestionItem}
                    onClick={() => handleSuggestionClick(issuer)}
                  >
                    {issuer}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button
            className={styles.searchButton}
            onClick={handleSearch}
            disabled={loading}
          >
            Search
          </button>
          
          {issuerSearch && (
            <button
              className={styles.clearButton}
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats Section */}
      {!loading && data.length > 0 && (
        <div className={styles.statsSection}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Records</div>
            <div className={styles.statValue}>{total.toLocaleString()}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Market Value</div>
            <div className={styles.statValue}>₹{totalMarketValue.toLocaleString()} L</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Quantity</div>
            <div className={styles.statValue}>{totalQuantity.toLocaleString()}</div>
          </div>
          {issuerSearch && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Searching For</div>
              <div className={styles.statValue} style={{ fontSize: '1.2rem' }}>
                {issuerSearch}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={styles.loading}>
          Loading investor data...
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && data.length > 0 && (
        <div className={styles.tableSection}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Issuer</th>
                  <th>ISIN</th>
                  <th>Scheme Name</th>
                  <th>Instrument Name</th>
                  <th>Quantity</th>
                  <th>Market Value (₹ L)</th>
                  <th>% to NAV</th>
                  <th>Coupon</th>
                  <th>Maturity Date</th>
                  <th>Report Date</th>
                  <th>Rating</th>
                  <th>Sector</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.issuer}</strong>
                    </td>
                    <td>{item.isin}</td>
                    <td>{item.scheme_name}</td>
                    <td>{item.instrument_name}</td>
                    <td>{item.quantity ? item.quantity.toLocaleString() : '0'}</td>
                    <td>
                      <strong>
                        {item.market_value ? item.market_value.toLocaleString() : '0'}
                      </strong>
                    </td>
                    <td>
                      {item.pct_to_nav ? item.pct_to_nav.toFixed(2) + '%' : '-'}
                    </td>
                    <td>
                      {item.coupon ? item.coupon.toFixed(2) + '%' : '-'}
                    </td>
                    <td>{item.maturity_date}</td>
                    <td>{item.report_date}</td>
                    <td>
                      {item.rating !== 'N/A' && (
                        <div>
                          <span className={styles.badge}>{item.rating}</span>
                          {item.ratingGroup && (
                            <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                              ({item.ratingGroup})
                            </div>
                          )}
                        </div>
                      )}
                      {item.rating === 'N/A' && '-'}
                    </td>
                    <td>{item.sector !== 'N/A' ? item.sector : '-'}</td>
                    <td>{item.instrumentType !== 'N/A' ? item.instrumentType : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <div className={styles.paginationInfo}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} records
            </div>
            <div className={styles.paginationControls}>
              <button
                className={styles.paginationButton}
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span style={{ padding: '0.5rem 1rem', color: '#718096' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className={styles.paginationButton}
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!loading && !error && data.length === 0 && (
        <div className={styles.noData}>
          <div className={styles.noDataIcon}>📊</div>
          <div className={styles.noDataText}>
            {issuerSearch
              ? `No data found for "${issuerSearch}"`
              : 'Enter an issuer name to search'}
          </div>
        </div>
      )}
    </div>
  );
}

