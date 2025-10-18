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
  
  // Track if we're in ISIN mode (clicked from ISIN)
  const [searchMode, setSearchMode] = useState('issuer'); // 'issuer' or 'isin'
  
  // View mode: 'list' or 'pivot'
  const [viewMode, setViewMode] = useState('pivot');
  
  // Pivot table data
  const [pivotData, setPivotData] = useState(null);
  
  const suggestionRef = useRef(null);
  const debouncedIssuerSearch = useDebounce(issuerSearch, 300);

  // Transform data to pivot table format
  const transformToPivotData = (items) => {
    if (!items || items.length === 0) return null;

    // Group by ISIN/Issuer + Instrument
    const grouped = {};
    const allDates = new Set();

    items.forEach(item => {
      const key = searchMode === 'issuer' 
        ? `${item.isin}__${item.instrument_name}`
        : `${item.issuer}__${item.instrument_name}`;
      
      const reportDate = item.report_date || 'N/A';
      allDates.add(reportDate);

      if (!grouped[key]) {
        grouped[key] = {
          identifier: searchMode === 'issuer' ? item.isin : item.issuer,
          instrumentName: item.instrument_name,
          dates: {}
        };
      }

      if (!grouped[key].dates[reportDate]) {
        grouped[key].dates[reportDate] = {
          quantity: 0,
          marketValue: 0,
          schemes: []
        };
      }

      grouped[key].dates[reportDate].quantity += item.quantity || 0;
      grouped[key].dates[reportDate].marketValue += item.market_value || 0;
      grouped[key].dates[reportDate].schemes.push(item.scheme_name);
    });

    // Convert to array and sort dates
    const sortedDates = Array.from(allDates).sort((a, b) => {
      if (a === 'N/A') return 1;
      if (b === 'N/A') return -1;
      // Convert dd/mm/yyyy to Date for comparison
      const [dayA, monthA, yearA] = a.split('/');
      const [dayB, monthB, yearB] = b.split('/');
      return new Date(yearB, monthB - 1, dayB) - new Date(yearA, monthA - 1, dayA);
    });

    const rows = Object.values(grouped);

    return {
      rows,
      dates: sortedDates
    };
  };

  // Load data
  const loadData = async (currentPage = page, searchTerm = issuerSearch) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchInvestorData({
        page: currentPage,
        limit: viewMode === 'pivot' ? 1000 : limit, // Load more data for pivot view
        issuer: searchTerm,
      });
      
      setData(response.items || []);
      setTotalPages(response.totalPages || 1);
      setTotal(response.total || 0);
      
      // Transform to pivot if in pivot mode
      if (viewMode === 'pivot' && response.items && response.items.length > 0) {
        const pivotTransformed = transformToPivotData(response.items);
        setPivotData(pivotTransformed);
      } else {
        setPivotData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
      setData([]);
      setPivotData(null);
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
    setSearchMode('issuer');
  };

  const handleSuggestionClick = (issuer) => {
    setIssuerSearch(issuer);
    setShowSuggestions(false);
    setPage(1);
    setSearchMode('issuer');
    loadData(1, issuer);
  };

  const handleIsinClick = (isin) => {
    if (!isin || isin === 'N/A') return;
    setIssuerSearch(isin);
    setShowSuggestions(false);
    setPage(1);
    setSearchMode('isin');
    loadData(1, isin);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleIssuerClick = (issuer) => {
    if (!issuer || issuer === 'N/A') return;
    setIssuerSearch(issuer);
    setShowSuggestions(false);
    setPage(1);
    setSearchMode('issuer');
    loadData(1, issuer);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          Search and view issuer information including ISIN, scheme, quantity, market value, and ratings. Click any ISIN to see all holdings across schemes.
        </p>
      </div>

      {/* Search Section */}
      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <div className={styles.searchFieldWrapper} ref={suggestionRef}>
            <div className={styles.searchField}>
              <label className={styles.searchLabel}>
                {searchMode === 'isin' ? 'Viewing by ISIN' : 'Search by Issuer Name or ISIN'}
              </label>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={searchMode === 'isin' ? "ISIN: Click ISIN below to change" : "e.g., Aditya Birla or IN0020240126"}
                value={issuerSearch}
                onChange={(e) => {
                  setIssuerSearch(e.target.value);
                  setShowSuggestions(true);
                  setSearchMode('issuer');
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

        {/* View Mode Toggle */}
        {issuerSearch && data.length > 0 && (
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewButton} ${viewMode === 'pivot' ? styles.active : ''}`}
              onClick={() => {
                setViewMode('pivot');
                loadData(1, issuerSearch);
              }}
            >
              📊 Date Timeline View
            </button>
            <button
              className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
              onClick={() => {
                setViewMode('list');
                loadData(1, issuerSearch);
              }}
            >
              📋 Detailed List View
            </button>
          </div>
        )}
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

      {/* Pivot Table View */}
      {!loading && !error && viewMode === 'pivot' && pivotData && pivotData.rows.length > 0 && (
        <div className={styles.tableSection}>
          <div className={styles.pivotTableHeader}>
            <h3>📊 Holdings Timeline - Grouped by {searchMode === 'issuer' ? 'ISIN' : 'Issuer'}</h3>
            <p>Showing quantity and market value across different report dates</p>
          </div>
          
          <div className={styles.pivotTableWrapper}>
            <table className={styles.pivotTable}>
              <thead>
                <tr>
                  <th className={styles.stickyCol} style={{ minWidth: '150px' }}>
                    {searchMode === 'issuer' ? 'ISIN' : 'Issuer'}
                  </th>
                  <th className={styles.stickyCol2} style={{ minWidth: '200px' }}>
                    Instrument Name
                  </th>
                  {pivotData.dates.map((date, idx) => (
                    <th key={idx} className={styles.dateHeader} colSpan={2}>
                      📅 {date}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className={styles.stickyCol}></th>
                  <th className={styles.stickyCol2}></th>
                  {pivotData.dates.map((date, idx) => (
                    <>
                      <th key={`${idx}-qty`} className={styles.subHeader}>Quantity</th>
                      <th key={`${idx}-mv`} className={styles.subHeader}>Market Value (₹ L)</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivotData.rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td 
                      className={styles.stickyCol}
                      style={{ 
                        cursor: 'pointer', 
                        color: '#4c51bf',
                        fontFamily: 'monospace',
                        fontWeight: 600
                      }}
                      onClick={() => {
                        if (searchMode === 'issuer') {
                          handleIsinClick(row.identifier);
                        } else {
                          handleIssuerClick(row.identifier);
                        }
                      }}
                      title={`Click to view ${searchMode === 'issuer' ? 'all schemes with this ISIN' : 'all holdings from this issuer'}`}
                    >
                      {row.identifier}
                    </td>
                    <td className={styles.stickyCol2} style={{ fontSize: '0.9rem' }}>
                      {row.instrumentName}
                    </td>
                    {pivotData.dates.map((date, dateIdx) => {
                      const dateData = row.dates[date];
                      return (
                        <>
                          <td key={`${rowIdx}-${dateIdx}-qty`} className={styles.dataCell}>
                            {dateData ? (
                              <div>
                                <strong>{dateData.quantity.toLocaleString()}</strong>
                                {dateData.schemes.length > 1 && (
                                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                                    {dateData.schemes.length} schemes
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#CBD5E0' }}>—</span>
                            )}
                          </td>
                          <td key={`${rowIdx}-${dateIdx}-mv`} className={styles.dataCell}>
                            {dateData ? (
                              <strong style={{ color: '#2D3748' }}>
                                ₹{dateData.marketValue.toLocaleString()}
                              </strong>
                            ) : (
                              <span style={{ color: '#CBD5E0' }}>—</span>
                            )}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: '#F7FAFC', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.875rem', color: '#4A5568', margin: 0 }}>
              💡 <strong>Tip:</strong> Click on any {searchMode === 'issuer' ? 'ISIN' : 'Issuer'} to filter and view detailed information
            </p>
          </div>
        </div>
      )}

      {/* List Table View */}
      {!loading && !error && viewMode === 'list' && data.length > 0 && (
        <div className={styles.tableSection}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {searchMode === 'issuer' && <th>ISIN</th>}
                  {searchMode === 'isin' && <th>Issuer</th>}
                  <th>Scheme Name</th>
                  <th>Instrument Name</th>
                  <th>Quantity</th>
                  <th>Market Value (₹ L)</th>
                  <th>% to NAV</th>
                  <th>Coupon</th>
                  <th>Rating</th>
                  <th>Sector</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item._id}>
                    {searchMode === 'issuer' && (
                      <td 
                        style={{ 
                          cursor: 'pointer', 
                          color: '#4c51bf',
                          fontFamily: 'monospace',
                          fontWeight: 500
                        }}
                        onClick={() => handleIsinClick(item.isin)}
                        title="Click to see all schemes with this ISIN"
                      >
                        {item.isin}
                      </td>
                    )}
                    {searchMode === 'isin' && (
                      <td 
                        style={{ 
                          cursor: 'pointer', 
                          color: '#4c51bf',
                          fontWeight: 600
                        }}
                        onClick={() => handleIssuerClick(item.issuer)}
                        title="Click to see all holdings from this Issuer"
                      >
                        {item.issuer}
                      </td>
                    )}
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

