import React, { useState, useMemo, useEffect } from 'react';
import styles from '../styles/unified-trades.module.css';

const cls = (...xs) => xs.filter(Boolean).join(' ');

const headers = [
  'Exchange',
  'Trade Date',
  'Trade Time',
  'ISIN',
  'Issuer details',
  'Maturity',
  'Amout (Rs lacs)',
  'Price (Rs)',
  'Yield',
  'Status',
  'Deal Type',
  'Rating'
];

const mockData = [
  {
    Exchange: 'BSE',
    'Trade Date': '15-01-2025',
    'Trade Time': '10:30:00',
    ISIN: 'INE002A08106',
    'Issuer details': 'Reliance Industries Ltd 7.50% 2027',
    Maturity: '15-06-2027',
    'Amout (Rs lacs)': 100.00,
    'Price (Rs)': 1025.50,
    Yield: 7.25,
    Status: 'Settled',
    'Deal Type': 'Direct',
    Rating: 'CRISIL AAA/Stable'
  },
  {
    Exchange: 'NSE',
    'Trade Date': '16-01-2025',
    'Trade Time': '14:15:00',
    ISIN: 'INE040A08042',
    'Issuer details': 'HDFC Bank Ltd 8.00% 2028',
    Maturity: '20-12-2028',
    'Amout (Rs lacs)': 5000000,
    'Price (Rs)': 1050.75,
    Yield: 7.80,
    Status: 'Pending',
    'Deal Type': 'Brokered',
    Rating: 'CARE AAA/Stable'
  },
  {
    Exchange: 'BSE',
    'Trade Date': '17-01-2025',
    'Trade Time': '11:45:00',
    ISIN: 'INE009A08113',
    'Issuer details': 'Infosys Ltd 6.75% 2026',
    Maturity: '10-03-2026',
    'Amout (Rs lacs)': 75.50,
    'Price (Rs)': 998.00,
    Yield: 6.90,
    Status: 'Settled',
    'Deal Type': 'Direct',
    Rating: 'ICRA AAA/Stable'
  }
];

export default function UnifiedTradesPreview({ data }) {
  const rows = data || mockData;

  const [filters, setFilters] = useState(
    Object.fromEntries(headers.map(h => [h, '']))
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  const handleFilterChange = (header, value) => {
    setFilters(prev => ({ ...prev, [header]: value }));
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    return rows.filter(row => {
      return headers.every(h => {
        const filterVal = (filters[h] || '').toLowerCase();
        if (!filterVal) return true;
        const cellVal = String(row[h] || '').toLowerCase();
        return cellVal.includes(filterVal);
      });
    });
  }, [rows, filters]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRows = filtered.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  return (
    <div className={styles.container}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.stickyHeader}>
            <tr>
              {headers.map(h => (
                <th key={h} className={styles.headerCell}>
                  {h}
                </th>
              ))}
            </tr>
            <tr>
              {headers.map(h => (
                <th key={h} className={styles.filterCell}>
                  <input
                    type="text"
                    placeholder="Filter…"
                    value={filters[h] || ''}
                    onChange={e => handleFilterChange(h, e.target.value)}
                    className={styles.filterInput}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentRows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className={styles.emptyRow}
                >
                  {filtered.length === 0 ? 'No rows match your filters.' : 'No data available.'}
                </td>
              </tr>
            ) : (
              currentRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={cls(
                    styles.dataRow,
                    idx % 2 === 0 ? styles.evenRow : styles.oddRow
                  )}
                >
                  {headers.map(h => (
                    <td
                      key={h}
                      className={styles.dataCell}
                    >
                      {row[h] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationContainer}>
          <div className={styles.paginationInfo}>
            Showing {startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length} transactions
          </div>
          <div className={styles.paginationControls}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className={styles.pageButton}
            >
              ««
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={styles.pageButton}
            >
              «
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={cls(
                    styles.pageButton,
                    currentPage === pageNum && styles.activePage
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={styles.pageButton}
            >
              »
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className={styles.pageButton}
            >
              »»
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

