// src/components/ResizableTable.jsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import styles from '../styles/table.module.css';

// Rating options for Indian mutual funds
const RATING_OPTIONS = [
  // Sovereign / G-Sec style
  'Sovereign', 'SOVEREIGN', 'SOV',
  // Long-term with common credit enhancements
  'AAA','AAA (CE)','AAA (SO)',
  'AA+','AA+ (CE)','AA+ (SO)',
  'AA','AA (CE)','AA (SO)',
  'AA-','AA- (CE)','AA- (SO)',
  'A+','A+ (CE)','A+ (SO)',
  'A','A (CE)','A (SO)',
  'A-','A- (CE)','A- (SO)',
  'BBB+','BBB+ (CE)','BBB+ (SO)',
  'BBB','BBB (CE)','BBB (SO)',
  'BBB-','BBB- (CE)','BBB- (SO)',
  'BB+','BB','BB-','B+','B','B-','C','D',
  // Short-term (commercial paper/CD etc.)
  'A1+','A1','A2+','A2','A3+','A3','A4+','A4',
  // Generic/agency-tagged and non-rated
  'Unrated','Not Rated','NR',
  'CRISIL AAA','[ICRA]AAA','IND AAA','CARE AAA', 'ICRA',
  'CRISIL A1+','[ICRA]A1+','IND A1+','CARE A1+',
];

export default function ResizableTable({ rows, loading, filters, onFilterChange }) {
  // View mode state
  const [viewMode, setViewMode] = useState('compact'); // 'compact', 'expanded', 'auto', 'fit-window'
  
  // Multi-select rating filter
  const [selectedRatings, setSelectedRatings] = useState([]);
  const [isRatingDropdownOpen, setIsRatingDropdownOpen] = useState(false);
  
  // Group rows by instrumentType (no client-side filtering - all filtering is server-side now)
  const groupedRows = useMemo(() => {
    const groups = {};
    rows.forEach(row => {
      const category = row.instrumentType || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(row);
    });
    return groups;
  }, [rows]);
  
  // Column widths state
  const [columnWidths, setColumnWidths] = useState({
    instrument: 250,
    isin: 140,
    rating: 80,
    quantity: 100,
    marketValue: 180,
    pctToNav: 150,
    ytm: 80
  });

  // Row heights state
  const [rowHeights, setRowHeights] = useState({});
  
  // Auto-calculated dimensions based on content
  const [autoColumnWidths, setAutoColumnWidths] = useState({});
  const [autoRowHeights, setAutoRowHeights] = useState({});
  
  // Window-fit dimensions
  const [windowFitWidths, setWindowFitWidths] = useState({});
  const [availableWidth, setAvailableWidth] = useState(0);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeData, setResizeData] = useState(null);
  const tableRef = useRef(null);

  // Column definitions
  const columns = [
    { key: 'schemeName', label: 'Scheme Name', field: 'scheme_name' },
    { key: 'instrument', label: 'Name of the Instrument', field: 'instrument_name' },
    { key: 'isin', label: 'ISIN', field: 'isin' },
    { key: 'rating', label: 'Rating', field: 'rating' },
    { key: 'quantity', label: 'Quantity', field: 'quantity' },
    { key: 'marketValue', label: 'Market/Fair Value (Rs. in Lacs)', field: 'market_value' },
    { key: 'pctToNav', label: '% to Net Assets / AUM', field: 'pct_to_nav' },
    { key: 'ytm', label: 'YTM', field: 'ytm' }
  ];

  // Handle column resize start
  const handleColumnResizeStart = useCallback((e, columnKey) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeData({
      type: 'column',
      key: columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey]
    });
  }, [columnWidths]);

  // Handle row resize start
  const handleRowResizeStart = useCallback((e, rowIndex) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeData({
      type: 'row',
      key: rowIndex,
      startY: e.clientY,
      startHeight: rowHeights[rowIndex] || 40
    });
  }, [rowHeights]);

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !resizeData) return;

    if (resizeData.type === 'column') {
      const deltaX = e.clientX - resizeData.startX;
      const newWidth = Math.max(50, resizeData.startWidth + deltaX);
      
      setColumnWidths(prev => ({
        ...prev,
        [resizeData.key]: newWidth
      }));
    } else if (resizeData.type === 'row') {
      const deltaY = e.clientY - resizeData.startY;
      const newHeight = Math.max(30, resizeData.startHeight + deltaY);
      
      setRowHeights(prev => ({
        ...prev,
        [resizeData.key]: newHeight
      }));
    }
  }, [isResizing, resizeData]);

  // Handle mouse up (end resize)
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    setResizeData(null);
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = resizeData?.type === 'column' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp, resizeData]);

  // Calculate optimal dimensions based on content
  const calculateOptimalDimensions = useCallback(() => {
    if (!tableRef.current || !rows.length) return;
    
    const newAutoColumnWidths = {};
    const newAutoRowHeights = {};
    
    // Calculate column widths based on content
    columns.forEach(column => {
      const cells = tableRef.current.querySelectorAll(`[data-column="${column.key}"]`);
      let maxWidth = 80; // Minimum width
      
      cells.forEach(cell => {
        const content = cell.textContent || '';
        // Estimate width based on content length and font size
        const estimatedWidth = Math.max(
          content.length * 8 + 20, // 8px per character + padding
          column.label.length * 10 + 20 // Header width
        );
        maxWidth = Math.max(maxWidth, estimatedWidth);
      });
      
      newAutoColumnWidths[column.key] = Math.min(maxWidth, 500); // Cap at 500px
    });
    
    // Calculate row heights based on content
    rows.forEach((row, index) => {
      let maxHeight = 40; // Minimum height
      
      columns.forEach(column => {
        const content = formatCellValue(row, column);
        const contentLength = String(content).length;
        
        // Estimate height based on content length and column width
        const columnWidth = newAutoColumnWidths[column.key] || columnWidths[column.key];
        const estimatedLines = Math.ceil(contentLength * 8 / (columnWidth - 20));
        const estimatedHeight = Math.max(40, estimatedLines * 20 + 10);
        
        maxHeight = Math.max(maxHeight, estimatedHeight);
      });
      
      newAutoRowHeights[index] = Math.min(maxHeight, 200); // Cap at 200px
    });
    
    setAutoColumnWidths(newAutoColumnWidths);
    setAutoRowHeights(newAutoRowHeights);
  }, [rows, columns, columnWidths]);

  // Calculate window-fit dimensions
  const calculateWindowFitDimensions = useCallback(() => {
    if (!tableRef.current) return;
    
    const tableContainer = tableRef.current.closest(`.${styles.tableScroll}`);
    if (!tableContainer) return;
    
    const containerWidth = tableContainer.clientWidth;
    const scrollbarWidth = 20; // Account for potential scrollbar
    const padding = 40; // Account for padding and borders
    const usableWidth = containerWidth - scrollbarWidth - padding;
    
    setAvailableWidth(usableWidth);
    
    // Define column priorities and minimum widths
    const columnPriorities = {
      instrument: { priority: 1, minWidth: 150, idealRatio: 0.35 },
      marketValue: { priority: 2, minWidth: 120, idealRatio: 0.20 },
      pctToNav: { priority: 3, minWidth: 100, idealRatio: 0.15 },
      isin: { priority: 4, minWidth: 100, idealRatio: 0.12 },
      quantity: { priority: 5, minWidth: 80, idealRatio: 0.10 },
      rating: { priority: 6, minWidth: 60, idealRatio: 0.06 },
      ytm: { priority: 7, minWidth: 50, idealRatio: 0.05 }
    };
    
    // Calculate total minimum width needed
    const totalMinWidth = Object.values(columnPriorities).reduce((sum, col) => sum + col.minWidth, 0);
    
    const newWindowFitWidths = {};
    
    if (usableWidth >= totalMinWidth) {
      // We have enough space, distribute proportionally
      let remainingWidth = usableWidth;
      
      // First pass: assign minimum widths
      columns.forEach(column => {
        const colConfig = columnPriorities[column.key];
        newWindowFitWidths[column.key] = colConfig.minWidth;
        remainingWidth -= colConfig.minWidth;
      });
      
      // Second pass: distribute remaining width based on ideal ratios
      const totalIdealRatio = Object.values(columnPriorities).reduce((sum, col) => sum + col.idealRatio, 0);
      
      columns.forEach(column => {
        const colConfig = columnPriorities[column.key];
        const additionalWidth = Math.floor((remainingWidth * colConfig.idealRatio) / totalIdealRatio);
        newWindowFitWidths[column.key] += additionalWidth;
      });
      
      // Handle any remaining pixels due to rounding
      const totalAssigned = Object.values(newWindowFitWidths).reduce((sum, width) => sum + width, 0);
      const leftover = usableWidth - totalAssigned;
      if (leftover > 0) {
        // Give leftover pixels to the highest priority column
        newWindowFitWidths.instrument += leftover;
      }
    } else {
      // Not enough space, use minimum widths and let it scroll
      columns.forEach(column => {
        const colConfig = columnPriorities[column.key];
        newWindowFitWidths[column.key] = colConfig.minWidth;
      });
    }
    
    setWindowFitWidths(newWindowFitWidths);
  }, [columns]);

  // Handle window resize
  const handleWindowResize = useCallback(() => {
    if (viewMode === 'fit-window') {
      calculateWindowFitDimensions();
    }
  }, [viewMode, calculateWindowFitDimensions]);

  // Auto-fit column to content
  const autoFitColumn = useCallback((columnKey) => {
    if (!tableRef.current) return;
    
    const cells = tableRef.current.querySelectorAll(`[data-column="${columnKey}"]`);
    let maxWidth = 100;
    
    cells.forEach(cell => {
      const textWidth = cell.scrollWidth + 20; // Add padding
      maxWidth = Math.max(maxWidth, textWidth);
    });
    
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: Math.min(maxWidth, 400) // Cap at 400px
    }));
  }, []);

  // Auto-fit all columns
  const autoFitAllColumns = useCallback(() => {
    columns.forEach(column => {
      autoFitColumn(column.key);
    });
  }, [columns, autoFitColumn]);

  // Get effective dimensions based on view mode
  const getEffectiveColumnWidth = useCallback((columnKey) => {
    switch (viewMode) {
      case 'auto':
        return autoColumnWidths[columnKey] || columnWidths[columnKey];
      case 'expanded':
        return Math.max(columnWidths[columnKey], 200);
      case 'fit-window':
        return windowFitWidths[columnKey] || columnWidths[columnKey];
      default:
        return columnWidths[columnKey];
    }
  }, [viewMode, autoColumnWidths, columnWidths, windowFitWidths]);

  const getEffectiveRowHeight = useCallback((rowIndex) => {
    switch (viewMode) {
      case 'auto':
        return autoRowHeights[rowIndex] || rowHeights[rowIndex] || 'auto';
      case 'expanded':
        return Math.max(rowHeights[rowIndex] || 60, 60);
      default:
        return rowHeights[rowIndex] || 'auto';
    }
  }, [viewMode, autoRowHeights, rowHeights]);

  // Calculate dimensions when data changes
  useEffect(() => {
    if (viewMode === 'auto' && rows.length > 0) {
      // Delay calculation to ensure DOM is updated
      const timer = setTimeout(calculateOptimalDimensions, 100);
      return () => clearTimeout(timer);
    }
  }, [rows, viewMode, calculateOptimalDimensions]);

  // Calculate window-fit dimensions when needed
  useEffect(() => {
    if (viewMode === 'fit-window') {
      // Delay calculation to ensure DOM is updated
      const timer = setTimeout(calculateWindowFitDimensions, 100);
      return () => clearTimeout(timer);
    }
  }, [viewMode, calculateWindowFitDimensions]);

  // Add window resize listener
  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [handleWindowResize]);

  // Close rating dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isRatingDropdownOpen && !event.target.closest('.ratingDropdown')) {
        setIsRatingDropdownOpen(false);
      }
    };
    
    if (isRatingDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRatingDropdownOpen]);

  // Export all data to single CSV file with category grouping
  const exportAllToCSV = () => {
    // Create CSV headers
    const headers = [
      'Category',
      'Scheme Name',
      'Name of the Instrument',
      'ISIN',
      'Rating',
      'Quantity',
      'Market/Fair Value (Rs. in Lacs)',
      'Rounded % to Net Assets',
      'YTM'
    ];

    // Create CSV rows grouped by category
    const csvRows = [];
    
    Object.entries(groupedRows).forEach(([category, categoryRows]) => {
      categoryRows.forEach(row => {
        csvRows.push([
          category,
          row.scheme_name || '',
          row.instrument_name || '',
          row.isin || '',
          row.rating || '',
          row.quantity || '',
          row.market_value || '',
          row.pct_to_nav || row.pct_to_NAV || row.navPercent || '',
          row.ytm !== null && row.ytm !== undefined && row.ytm !== '' ? Number(row.ytm).toFixed(2) + '%' : ''
        ]);
      });
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => {
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
    link.setAttribute('download', `All_Instruments_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format cell value
  const formatCellValue = (row, column) => {
    const value = row[column.field];
    
    switch (column.key) {
      case 'schemeName':
        return value || '—';
      case 'instrument':
        return value || '—';
      case 'isin':
        return value || 'NA';
      case 'rating':
        return value || '—';
      case 'quantity':
        return value ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
      case 'pctToNav':
        const pctValue = row.pct_to_nav ?? row.pct_to_NAV ?? row.navPercent ?? row['% to NAV'];
        return pctValue ? `${Number(pctValue).toFixed(2)}%` : '—';
      case 'marketValue':
        const marketValue = row.market_value || (row.market_value_lacs ? row.market_value_lacs : null);
        return marketValue ? Number(marketValue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      case 'ytm':
        return value !== null && value !== undefined && value !== '' 
          ? `${Number(value).toFixed(2)}%`
          : '—';
      default:
        return value || '—';
    }
  };

  // Toggle rating selection
  const toggleRating = (rating) => {
    if (selectedRatings.includes(rating)) {
      setSelectedRatings(selectedRatings.filter(r => r !== rating));
    } else {
      setSelectedRatings([...selectedRatings, rating]);
    }
  };

  return (
    <div className={styles.card}>
      {/* View Mode Controls */}
      <div className={styles.tableControls}>
        <div className={styles.viewModeControls}>
          <label className={styles.controlLabel}>View Mode:</label>
          <div className={styles.buttonGroup}>
            <button
              className={`${styles.modeButton} ${viewMode === 'compact' ? styles.active : ''}`}
              onClick={() => setViewMode('compact')}
              title="Compact view - minimal space"
            >
              Compact
            </button>
            <button
              className={`${styles.modeButton} ${viewMode === 'expanded' ? styles.active : ''}`}
              onClick={() => setViewMode('expanded')}
              title="Expanded view - more space for content"
            >
              Expanded
            </button>
            <button
              className={`${styles.modeButton} ${viewMode === 'auto' ? styles.active : ''}`}
              onClick={() => setViewMode('auto')}
              title="Auto view - size based on content"
            >
              Auto-fit
            </button>
            <button
              className={`${styles.modeButton} ${viewMode === 'fit-window' ? styles.active : ''}`}
              onClick={() => setViewMode('fit-window')}
              title="Fit to window - all columns fit in viewport width"
            >
              Fit Window
            </button>
          </div>
        </div>
        <div className={styles.tableActions}>
          {/* Rating Filter Section */}
          <div style={{ display: 'inline-flex', alignItems: 'center', marginRight: '12px' }}>
            <label className={styles.controlLabel} style={{ marginRight: '8px', marginBottom: 0 }}>
              Rating Filter:
            </label>
            <div className="ratingDropdown" style={{ position: 'relative', display: 'inline-block' }}>
              <button
                className={styles.actionButton}
                onClick={() => setIsRatingDropdownOpen(!isRatingDropdownOpen)}
                title="Filter by ratings"
                style={{
                  background: selectedRatings.length > 0 ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '',
                  color: selectedRatings.length > 0 ? 'white' : '',
                  fontWeight: selectedRatings.length > 0 ? '600' : 'normal'
                }}
              >
                ⭐ Select Ratings {selectedRatings.length > 0 ? `(${selectedRatings.length})` : ''}
              </button>
            {isRatingDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 1000,
                minWidth: '250px',
                maxHeight: '400px',
                overflowY: 'auto',
                padding: '8px'
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px',
                  borderBottom: '1px solid #dee2e6',
                  marginBottom: '8px'
                }}>
                  <strong style={{ fontSize: '14px' }}>Select Ratings</strong>
                  {selectedRatings.length > 0 && (
                    <button
                      onClick={() => setSelectedRatings([])}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc3545',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '4px',
                  padding: '4px'
                }}>
                  {RATING_OPTIONS.map(rating => (
                    <label
                      key={rating}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 8px',
                        cursor: 'pointer',
                        borderRadius: '3px',
                        fontSize: '13px',
                        background: selectedRatings.includes(rating) ? '#f0f0ff' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedRatings.includes(rating)) {
                          e.currentTarget.style.background = '#f8f9fa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedRatings.includes(rating)) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRatings.includes(rating)}
                        onChange={() => toggleRating(rating)}
                        style={{
                          marginRight: '8px',
                          cursor: 'pointer',
                          width: '16px',
                          height: '16px'
                        }}
                      />
                      <span style={{ fontSize: '13px' }}>{rating}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
          
          <button
            className={styles.actionButton}
            onClick={autoFitAllColumns}
            title="Auto-fit all columns to content"
          >
            Auto-fit All
          </button>
          <button
            className={styles.actionButton}
            onClick={() => exportAllToCSV()}
            title="Export all instruments to CSV file"
            disabled={loading || rows.length === 0}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              marginLeft: '8px'
            }}
          >
            📥 Export All
          </button>
          <button
            className={styles.actionButton}
            onClick={() => {
              // Clear all filters by calling onFilterChange with empty values
              Object.keys(filters || {}).forEach(key => {
                onFilterChange?.(key, '');
              });
              setSelectedRatings([]);
            }}
            title="Clear all filters"
            disabled={loading}
            style={{
              marginLeft: '8px'
            }}
          >
            🔄 Clear Filters
          </button>
        </div>
      </div>
      
      <div className={styles.tableScroll}>
        <table ref={tableRef} className={`${styles.table} ${styles.resizableTable} ${
          viewMode === 'fit-window' ? styles.fitWindowMode : 
          viewMode === 'expanded' ? styles.expandedMode :
          viewMode === 'auto' ? styles.autoMode : ''
        }`}>
          <thead className={styles.thead}>
            {/* Header Row */}
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  className={`${styles.th} ${styles.resizableTh}`}
                  style={{ 
                    width: getEffectiveColumnWidth(column.key), 
                    position: 'sticky', 
                    top: 0, 
                    zIndex: 12, 
                    backgroundColor: '#3c4f64' 
                  }}
                  data-column={column.key}
                >
                  <div className={styles.thContent}>
                    <span 
                      onDoubleClick={() => autoFitColumn(column.key)}
                      title="Double-click to auto-fit"
                    >
                      {column.label}
                    </span>
                    {index < columns.length - 1 && (
                      <div
                        className={styles.columnResizer}
                        onMouseDown={(e) => handleColumnResizeStart(e, column.key)}
                        title="Drag to resize column"
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
            {/* Filter Row */}
            <tr className={styles.filterRow}>
              {columns.map((column) => (
                <th
                  key={`filter-${column.key}`}
                  className={styles.filterTh}
                  style={{ 
                    width: getEffectiveColumnWidth(column.key), 
                    position: 'sticky', 
                    top: '47px', 
                    zIndex: 11, 
                    backgroundColor: '#f8f9fa' 
                  }}
                >
                  <input
                    type="text"
                    placeholder="Filter..."
                    className={styles.filterInput}
                    value={filters?.[column.key] || ''}
                    onChange={(e) => onFilterChange?.(column.key, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr 
                  key={`sk-${i}`} 
                  className={`${styles.tr} ${i % 2 ? styles.trOdd : ''}`}
                  style={{ height: getEffectiveRowHeight(i) }}
                >
                    {columns.map((column, colIndex) => (
                      <td 
                        key={column.key} 
                        className={`${styles.td} ${viewMode !== 'compact' ? styles.tdExpanded : ''}`}
                        style={{ 
                          width: getEffectiveColumnWidth(column.key),
                          position: colIndex === columns.length - 1 ? 'relative' : 'static'
                        }}
                        data-column={column.key}
                      >
                        <div className={styles.skeleton} />
                        {colIndex === columns.length - 1 && (
                          <div
                            className={styles.rowResizer}
                            onMouseDown={(e) => handleRowResizeStart(e, i)}
                            title="Drag to resize row"
                          />
                        )}
                      </td>
                    ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr className={styles.tr}>
                <td 
                  className={styles.td} 
                  colSpan={columns.length} 
                  style={{ textAlign: 'center', padding: '24px 8px', opacity: 0.7 }}
                >
                  No results found.
                </td>
              </tr>
            ) : (
              Object.entries(groupedRows).flatMap(([category, categoryRows], catIdx) => [
                // Category Header Row
                <tr 
                  key={`cat-${category}`}
                  style={{ 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    position: 'sticky',
                    top: '93px',
                    zIndex: 10
                  }}
                >
                  <td 
                    colSpan={columns.length} 
                    style={{ 
                      padding: '10px 16px',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: '14px',
                      borderLeft: '1px solid #dee2e6',
                      borderRight: '1px solid #dee2e6',
                      borderBottom: '2px solid #dee2e6'
                    }}
                  >
                    📁 {category} ({categoryRows.length} items)
                  </td>
                </tr>,
                // Data Rows
                ...categoryRows.map((row, i) => {
                  const rowHeight = rowHeights[i] || 'auto';
                  
                  return (
                    <tr
                      key={row._id}
                      className={`${styles.tr} ${i % 2 ? styles.trOdd : ''} ${styles.rowHover} ${styles.resizableRow}`}
                      style={{ height: getEffectiveRowHeight(i) }}
                      title={
                        `Instrument: ${row.instrument_name || '—'}\n` +
                        `ISIN: ${row.isin || 'NA'}\n` +
                        `Rating: ${row.rating || '—'}\n` +
                        `Quantity: ${row.quantity ?? '—'}\n` +
                        `Market Value: ${formatCellValue(row, { key: 'marketValue', field: 'market_value' })}\n` +
                        `% to NAV: ${row.pct_to_nav ?? row.pct_to_NAV ?? row.navPercent ?? '—'}\n` +
                        `YTM: ${row.ytm !== null && row.ytm !== undefined && row.ytm !== '' ? Number(row.ytm).toFixed(2) + '%' : '—'}`
                      }
                    >
                    {columns.map((column, colIndex) => (
                      <td
                        key={column.key}
                        className={`${styles.td} ${
                          viewMode === 'compact' && (column.key === 'instrument' || column.key === 'isin') 
                            ? styles.tdClamp 
                            : styles.tdExpanded
                        }`}
                        style={{ 
                          width: getEffectiveColumnWidth(column.key),
                          maxWidth: getEffectiveColumnWidth(column.key),
                          position: colIndex === columns.length - 1 ? 'relative' : 'static'
                        }}
                        data-column={column.key}
                        title={viewMode === 'compact' ? formatCellValue(row, column) : ''}
                      >
                        <div className={`${styles.cellContent} ${viewMode !== 'compact' ? styles.cellContentExpanded : ''}`}>
                          {column.key === 'instrument' ? (
                            <strong>{formatCellValue(row, column)}</strong>
                          ) : (
                            formatCellValue(row, column)
                          )}
                        </div>
                        {colIndex === columns.length - 1 && (
                          <div
                            className={styles.rowResizer}
                            onMouseDown={(e) => handleRowResizeStart(e, i)}
                            title="Drag to resize row"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
              ])
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
