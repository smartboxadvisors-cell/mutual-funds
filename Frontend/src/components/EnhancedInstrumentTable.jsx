// src/components/EnhancedInstrumentTable.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { fetchInstruments } from '../api/instruments';
import useDebounce from '../hooks/useDebounce';
import UploadSection from './UploadSection';
import SchemeSelector from './SchemeSelector';
import styles from '../styles/enhanced-table.module.css';

export default function EnhancedInstrumentTable() {
  // Scheme selection
  const [selectedSchemeId, setSelectedSchemeId] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  
  // Search and filters
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [filters, setFilters] = useState({
    instrumentName: '',
    isin: '',
    rating: '',
    ytm: '',
    quantityMin: '',
    quantityMax: '',
    marketValueMin: '',
    marketValueMax: '',
    navPercentMin: '',
    navPercentMax: ''
  });

  // Data state
  const [instruments, setInstruments] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounced values
  const searchDebounced = useDebounce(search, 300);
  const filtersDebounced = useDebounce(filters, 300);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedSchemeId, searchDebounced, filtersDebounced, sort]);

  // Fetch instruments when parameters change
  useEffect(() => {
    if (selectedSchemeId) {
      fetchInstrumentsData();
    } else {
      setInstruments([]);
      setTotal(0);
      setTotalPages(1);
    }
  }, [selectedSchemeId, page, limit, searchDebounced, filtersDebounced, sort]);

  const fetchInstrumentsData = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await fetchInstruments({
        schemeId: selectedSchemeId,
        page,
        limit,
        search: searchDebounced,
        sort,
        filters: filtersDebounced
      });

      setInstruments(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);

    } catch (err) {
      console.error('Error fetching instruments:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Group instruments by category with filtering as per PROJECT_PROMPT
  const groupedInstruments = useMemo(() => {
    const groups = {};
    
    instruments.forEach((inst) => {
      // Filter irrelevant instruments (PROJECT_PROMPT logic)
      const irrelevantPatterns = [
        /^\([a-z]\)/i, /^#/, /^\*+/,
        /listed.*awaiting/i, /privately.*placed/i, /unlisted.*security/i,
        /thinly.*traded/i, /investors.*should/i, /disclosure/i
      ];
      
      if (irrelevantPatterns.some(p => p.test(inst.instrumentName || ''))) return;
      
      // Check required fields
      if (!inst.quantity || !inst.marketValue || !inst.navPercent) return;
      if (!inst.instrumentType) return;
      
      // Invalid instrument names
      const name = inst.instrumentName || '';
      if (!name || name === '-' || /^[#*\(\)]/.test(name)) return;
      
      // Reclassify REITs as per PROJECT_PROMPT
      let category = inst.instrumentType;
      const nameLC = name.toLowerCase();
      if (nameLC.includes('reit') || nameLC.includes('invit') || 
          nameLC.includes('real estate trust') || nameLC.includes('infrastructure trust')) {
        category = 'REIT/InvIT Instruments';
      }
      
      if (!groups[category]) groups[category] = [];
      groups[category].push(inst);
    });
    
    return groups;
  }, [instruments]);

  // Indian number formatting as per PROJECT_PROMPT
  const formatIndianNumber = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return Number(num).toLocaleString('en-IN', { 
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals 
    });
  };

  const handleSort = (field) => {
    const currentDirection = sort === `${field}:asc` ? 'desc' : 'asc';
    setSort(`${field}:${currentDirection}`);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearFilters = () => {
    setSearch('');
    setSort('');
    setFilters({
      instrumentName: '',
      isin: '',
      rating: '',
      ytm: '',
      quantityMin: '',
      quantityMax: '',
      marketValueMin: '',
      marketValueMax: '',
      navPercentMin: '',
      navPercentMax: ''
    });
  };

  const handleUploadSuccess = (scheme) => {
    setSelectedSchemeId(scheme._id);
    // Refresh data
    if (scheme._id) {
      fetchInstrumentsData();
    }
  };

  // Export category to CSV
  const exportCategoryToCSV = (category, categoryInstruments) => {
    // Create CSV headers
    const headers = [
      'Name of the Instrument',
      'ISIN',
      'Rating',
      'Quantity',
      'Market/Fair Value (Rs. in Lacs)',
      'Rounded % to Net Assets',
      'YTM'
    ];

    // Create CSV rows
    const rows = categoryInstruments.map(inst => [
      inst.instrumentName || '',
      inst.isin || '',
      inst.rating || '',
      inst.quantity || '',
      inst.marketValue || '',
      inst.navPercent || '',
      inst.other?.YTM || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape commas and quotes in cell values
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${category.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export all categories
  const exportAllCategories = () => {
    Object.entries(groupedInstruments).forEach(([category, categoryInstruments]) => {
      setTimeout(() => exportCategoryToCSV(category, categoryInstruments), 100);
    });
  };

  return (
    <div className={styles.wrapper}>
      <UploadSection onUploadSuccess={handleUploadSuccess} />
      
      {/* Control Panel */}
      <div className={styles.controlPanel}>
        <div className={styles.controlGrid}>
          <SchemeSelector 
            selectedSchemeId={selectedSchemeId}
            onSchemeChange={setSelectedSchemeId}
          />
          
          <div className={styles.controlGroup}>
            <label className={styles.label}>Global Search</label>
            <input
              className={styles.input}
              placeholder="Search instrument names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className={styles.controlGroup}>
            <label className={styles.label}>Page Size</label>
            <select
              className={styles.select}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {selectedSchemeId && (
        <div className={styles.tableCard}>
          {/* Sticky Headers */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              {/* Header Row 1 - Column Labels */}
              <thead className={styles.stickyHeader}>
                <tr className={styles.headerRow}>
                  <th 
                    className={`${styles.th} ${styles.thName}`}
                    onClick={() => handleSort('instrumentName')}
                    title="Name of the Instrument - Click to sort"
                  >
                    Name of the Instrument {sort.includes('instrumentName') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thIsin}`}
                    onClick={() => handleSort('isin')}
                    title="ISIN - Click to sort"
                  >
                    ISIN {sort.includes('isin') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thRating}`}
                    onClick={() => handleSort('rating')}
                    title="Rating - Click to sort"
                  >
                    Rating {sort.includes('rating') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thQuantity}`}
                    onClick={() => handleSort('quantity')}
                    title="Quantity - Click to sort"
                  >
                    Quantity {sort.includes('quantity') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thMarketValue}`}
                    onClick={() => handleSort('marketValue')}
                    title="Market/Fair Value (Rs. in Lacs) - Click to sort"
                  >
                    Market/Fair Value (Rs. in Lacs) {sort.includes('marketValue') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thNavPercent}`}
                    onClick={() => handleSort('navPercent')}
                    title="Rounded % to Net Assets - Click to sort"
                  >
                    Rounded % to Net Assets {sort.includes('navPercent') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`${styles.th} ${styles.thYtm}`}
                    onClick={() => handleSort('other.YTM')}
                    title="YTM - Click to sort"
                  >
                    YTM {sort.includes('YTM') && (sort.includes('asc') ? '↑' : '↓')}
                  </th>
                </tr>
                
                {/* Header Row 2 - Filter Inputs */}
                <tr className={styles.filterRow}>
                  <th className={styles.filterCell}>
                    <input
                      className={styles.filterInput}
                      placeholder="Filter name..."
                      value={filters.instrumentName}
                      onChange={(e) => handleFilterChange('instrumentName', e.target.value)}
                    />
                  </th>
                  <th className={styles.filterCell}>
                    <input
                      className={styles.filterInput}
                      placeholder="Filter ISIN..."
                      value={filters.isin}
                      onChange={(e) => handleFilterChange('isin', e.target.value)}
                    />
                  </th>
                  <th className={styles.filterCell}>
                    <input
                      className={styles.filterInput}
                      placeholder="Filter rating..."
                      value={filters.rating}
                      onChange={(e) => handleFilterChange('rating', e.target.value)}
                    />
                  </th>
                  <th className={styles.filterCell}>
                    <div className={styles.rangeInputs}>
                      <input
                        className={styles.rangeInput}
                        placeholder="Min"
                        type="number"
                        value={filters.quantityMin}
                        onChange={(e) => handleFilterChange('quantityMin', e.target.value)}
                      />
                      <input
                        className={styles.rangeInput}
                        placeholder="Max"
                        type="number"
                        value={filters.quantityMax}
                        onChange={(e) => handleFilterChange('quantityMax', e.target.value)}
                      />
                    </div>
                  </th>
                  <th className={styles.filterCell}>
                    <div className={styles.rangeInputs}>
                      <input
                        className={styles.rangeInput}
                        placeholder="Min"
                        type="number"
                        step="0.01"
                        value={filters.marketValueMin}
                        onChange={(e) => handleFilterChange('marketValueMin', e.target.value)}
                      />
                      <input
                        className={styles.rangeInput}
                        placeholder="Max"
                        type="number"
                        step="0.01"
                        value={filters.marketValueMax}
                        onChange={(e) => handleFilterChange('marketValueMax', e.target.value)}
                      />
                    </div>
                  </th>
                  <th className={styles.filterCell}>
                    <div className={styles.rangeInputs}>
                      <input
                        className={styles.rangeInput}
                        placeholder="Min %"
                        type="number"
                        step="0.01"
                        value={filters.navPercentMin}
                        onChange={(e) => handleFilterChange('navPercentMin', e.target.value)}
                      />
                      <input
                        className={styles.rangeInput}
                        placeholder="Max %"
                        type="number"
                        step="0.01"
                        value={filters.navPercentMax}
                        onChange={(e) => handleFilterChange('navPercentMax', e.target.value)}
                      />
                    </div>
                  </th>
                  <th className={styles.filterCell}>
                    <input
                      className={styles.filterInput}
                      placeholder="Filter YTM..."
                      value={filters.ytm}
                      onChange={(e) => handleFilterChange('ytm', e.target.value)}
                    />
                  </th>
                </tr>
              </thead>

              {/* Table Body with Category Grouping */}
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className={styles.dataRow}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className={styles.td}>
                          <div className={styles.skeleton} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : Object.keys(groupedInstruments).length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.noData}>
                      {selectedSchemeId ? 'No instruments found.' : 'Please select a scheme to view data.'}
                    </td>
                  </tr>
                ) : (
                  Object.entries(groupedInstruments).map(([category, categoryInstruments]) => (
                    <React.Fragment key={category}>
                      {/* Category Header Row */}
                      <tr className={styles.categoryRow}>
                        <td colSpan={7} className={styles.categoryHeader}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>📁 {category} ({categoryInstruments.length} items)</span>
                            <button
                              onClick={() => exportCategoryToCSV(category, categoryInstruments)}
                              className={styles.exportButton}
                              title={`Export ${category} to CSV`}
                            >
                              📥 Export
                            </button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Data Rows for this category */}
                      {categoryInstruments.map((instrument, index) => (
                        <tr 
                          key={instrument._id} 
                          className={`${styles.dataRow} ${index % 2 ? styles.oddRow : ''}`}
                        >
                          <td className={`${styles.td} ${styles.tdName}`}>
                            <div className={styles.instrumentName}>
                              {instrument.instrumentName || '—'}
                            </div>
                          </td>
                          <td className={`${styles.td} ${styles.tdIsin}`}>
                            <code className={styles.isinCode}>
                              {instrument.isin || '—'}
                            </code>
                          </td>
                          <td className={`${styles.td} ${styles.tdRating}`}>
                            <strong className={styles.rating}>
                              {instrument.rating || '—'}
                            </strong>
                          </td>
                          <td className={`${styles.td} ${styles.tdQuantity}`}>
                            <span className={styles.number}>
                              {formatIndianNumber(instrument.quantity, 0)}
                            </span>
                          </td>
                          <td className={`${styles.td} ${styles.tdMarketValue}`}>
                            <strong className={styles.marketValue}>
                              {formatIndianNumber(instrument.marketValue, 2)}
                            </strong>
                          </td>
                          <td className={`${styles.td} ${styles.tdNavPercent}`}>
                            <strong className={styles.percentage}>
                              {instrument.navPercent ? `${formatIndianNumber(instrument.navPercent, 2)}%` : '—'}
                            </strong>
                          </td>
                          <td className={`${styles.td} ${styles.tdYtm}`}>
                            <span className={styles.number}>
                              {instrument.other?.YTM || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className={styles.paginationControls}>
            <button
              className={styles.paginationButton}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              ← Prev
            </button>
            
            <div className={styles.paginationInfo}>
              Page {page} / {totalPages} ({total} items)
            </div>
            
            <button
              className={styles.paginationButton}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next →
            </button>
            
            <button
              className={styles.clearButton}
              onClick={clearFilters}
              title="Clear all filters, search, and sort"
            >
              Clear Filters
            </button>
            
            <button
              className={styles.exportAllButton}
              onClick={exportAllCategories}
              disabled={Object.keys(groupedInstruments).length === 0}
              title="Export all categories as separate CSV files"
            >
              📥 Export All Categories
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
