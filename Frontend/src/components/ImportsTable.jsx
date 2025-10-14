// src/components/ImportsTable.jsx
import { useEffect, useMemo, useState } from 'react';
import { fetchImports } from '../api/imports';
import useDebounce from '../hooks/useDebounce';
import Pagination from './Pagination';
import ResizableTable from './ResizableTable';
import UploadSection from './UploadSection';
import styles from '../styles/table.module.css';

// Helper function to reclassify REIT/InvIT instruments
function reclassifyInstrument(instrument) {
  // Check if instrument name contains REIT/InvIT keywords
  const name = (instrument.instrument_name || '').toLowerCase();
  const isREIT = name.includes('reit') || 
                 name.includes('invit') || 
                 name.includes('real estate investment trust') ||
                 name.includes('infrastructure investment trust');
  
  // If it's a REIT/InvIT and currently categorized as Equity, reclassify it
  if (isREIT && instrument.instrumentType === 'Equity Instruments') {
    return {
      ...instrument,
      instrumentType: 'REIT/InvIT Instruments'
    };
  }
  
  return instrument;
}

export default function ImportsTable() {
  // Paging
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100); // Items per page for pagination

  // ----- Table filter states (server-side filtering) -----
  const [tableFilters, setTableFilters] = useState({
    schemeName: '',
    instrument: '',
    isin: '',
    rating: '',
    quantity: '',
    marketValue: '',
    pctToNav: '',
    ytm: ''
  });

  // ----- Controlled inputs (all fields) -----
  const [schemeInput, setSchemeInput] = useState('');
  const [instrumentInput, setInstrumentInput] = useState('');
  const [ratings, setRatings] = useState([]); // Changed from ratingInput to ratings array
  const [isinInput, setIsinInput] = useState('');
  const [fromInput, setFromInput] = useState(''); // report date from (yyyy-mm-dd)
  const [toInput, setToInput] = useState('');     // report date to   (yyyy-mm-dd)

  // Ranges
  const [quantityMin, setQuantityMin] = useState(null);
  const [quantityMax, setQuantityMax] = useState(null);
  const [pctToNavMin, setPctToNavMin] = useState(null);
  const [pctToNavMax, setPctToNavMax] = useState(null);
  const [ytmMin, setYtmMin] = useState(null);
  const [ytmMax, setYtmMax] = useState(null);
  const [mvMin, setMvMin] = useState(null);   // rupees
  const [mvMax, setMvMax] = useState(null);

  // Modified window
  const [modifiedFrom, setModifiedFrom] = useState('');
  const [modifiedTo, setModifiedTo] = useState('');

  // ----- Debounced values (to avoid refetch every keystroke) -----
  const scheme = useDebounce(schemeInput);
  const instrument = useDebounce(instrumentInput);
  const ratingsDebounced = useDebounce(ratings); // Debounce the ratings array
  const isin = useDebounce(isinInput);
  const from = useDebounce(fromInput);
  const to = useDebounce(toInput);

  const quantityMinD = useDebounce(quantityMin);
  const quantityMaxD = useDebounce(quantityMax);
  const pctToNavMinD = useDebounce(pctToNavMin);
  const pctToNavMaxD = useDebounce(pctToNavMax);
  const ytmMinD = useDebounce(ytmMin);
  const ytmMaxD = useDebounce(ytmMax);
  const mvMinD = useDebounce(mvMin);
  const mvMaxD = useDebounce(mvMax);

  const modifiedFromD = useDebounce(modifiedFrom);
  const modifiedToD = useDebounce(modifiedTo);

  // Debounce table filters for server-side search
  const tableFiltersDebounced = useDebounce(tableFilters);

  // Data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reset page to 1 when ANY filter changes
  useEffect(() => {
    setPage(1);
  }, [
    scheme, instrument, ratingsDebounced, isin,
    from, to,
    quantityMinD, quantityMaxD,
    pctToNavMinD, pctToNavMaxD,
    ytmMinD, ytmMaxD,
    modifiedFromD, modifiedToD,
    limit, mvMinD, mvMaxD,
    tableFiltersDebounced // Reset page when table filters change
  ]);

  const ratingFilterValue = (tableFiltersDebounced.rating || '').trim();

  const params = useMemo(() => ({
    page,
    limit,
    scheme: tableFiltersDebounced.schemeName || scheme,         // Use table filter if present
    instrument: tableFiltersDebounced.instrument || instrument, // Use table filter if present
    isin: tableFiltersDebounced.isin || isin,                   // Use table filter if present
    rating: tableFiltersDebounced.rating,                        // Use table filter
    ratingContains: tableFiltersDebounced.rating,                // Enable substring search
    ratings: ratingsDebounced,                                   // Pass ratings array
    from,
    to,
    quantityMin: quantityMinD,
    quantityMax: quantityMaxD,
    pctToNavMin: pctToNavMinD,
    pctToNavMax: pctToNavMaxD,
    ytmMin: ytmMinD,
    ytmMax: ytmMaxD,
    modifiedFrom: modifiedFromD,
    modifiedTo: modifiedToD,
    mvMin: mvMinD,          
    mvMax: mvMaxD,
    // hideIncomplete: false, // keep false unless your DB is clean
  }), [
    page, limit,
    scheme, instrument, isin, ratingsDebounced,
    from, to,
    quantityMinD, quantityMaxD,
    pctToNavMinD, pctToNavMaxD,
    ytmMinD, ytmMaxD,
    modifiedFromD, modifiedToD,
    mvMinD, mvMaxD,
    tableFiltersDebounced
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchImports(params);
        if (cancelled || !result) return;

        const {
          items: initialItems = [],
          total: initialTotal = 0,
          totalPages: initialTotalPages = 1,
        } = result;

        const limitNumber = Number(params.limit ?? limit) || limit;
        const searchTerm = ratingFilterValue.toLowerCase();
        const matchesRating = (entry) =>
          !searchTerm || String(entry.rating || '').toLowerCase().includes(searchTerm);

        let workingItems = initialItems;
        let workingTotal = initialTotal;
        let workingTotalPages = initialTotalPages;

        if (searchTerm) {
          const filtered = workingItems.filter(matchesRating);

          if (filtered.length === 0) {
            const fallbackParams = {
              ...params,
              page: 1,
              rating: '',
              ratingContains: '',
              limit: Math.max(limitNumber, 500),
            };

            const fallbackResult = await fetchImports(fallbackParams);
            if (!cancelled && fallbackResult) {
              const fallbackFiltered = (fallbackResult.items || []).filter(matchesRating);
              workingItems = fallbackFiltered;
              workingTotal = fallbackFiltered.length;
              workingTotalPages = Math.max(
                1,
                Math.ceil((fallbackFiltered.length || 0) / limitNumber)
              );
            } else {
              workingItems = filtered;
              workingTotal = filtered.length;
              workingTotalPages = Math.max(1, Math.ceil(filtered.length / limitNumber));
            }
          } else {
            const serverAppliedFilter =
              filtered.length === workingItems.length &&
              filtered.every(matchesRating);

            if (!serverAppliedFilter) {
              workingItems = filtered;
              workingTotal = filtered.length;
              workingTotalPages = Math.max(1, Math.ceil(filtered.length / limitNumber));
            }
          }
        }

        const reclassifiedItems = workingItems.map(reclassifyInstrument);
        if (!cancelled) {
          setRows(reclassifiedItems);
          setTotal(workingTotal);
          setTotalPages(workingTotalPages);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, ratingFilterValue, limit]);

  const onReset = () => {
    setSchemeInput('');
    setInstrumentInput('');
    setRatings([]); // Reset ratings array
    setIsinInput('');
    setFromInput('');
    setToInput('');
    setQuantityMin(null);
    setQuantityMax(null);
    setPctToNavMin(null);
    setPctToNavMax(null);
    setYtmMin(null);
    setYtmMax(null);
    setModifiedFrom('');
    setModifiedTo('');
    setMvMin(null);
    setMvMax(null);
  };

  const handleUploadSuccess = (scheme) => {
    console.log('Upload successful:', scheme);
    // You can add logic here to refresh data or switch to the new scheme
  };

  // Handle table filter changes (server-side filtering)
  const handleTableFilterChange = (filterKey, value) => {
    setTableFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  return (
    <div className={styles.wrapper}>
      <UploadSection onUploadSuccess={handleUploadSuccess} />
      
      {/* Database Stats Banner */}
      {!loading && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          margin: '16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
              📊 Database Overview
            </h3>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>
              Showing instruments from all schemes in MongoDB
            </div>
          </div>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>
                {rows.length}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
                Displayed
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>
                {total}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
                Total in DB
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', lineHeight: 1 }}>
                {totalPages}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
                Pages
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      <ResizableTable 
        rows={rows} 
        loading={loading} 
        filters={tableFilters}
        onFilterChange={handleTableFilterChange}
      />

      <div style={{ 
        padding: '16px', 
        background: '#f8f9fa', 
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Records info */}
        <div style={{ fontSize: '14px', color: '#495057', fontWeight: '500' }}>
          Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} instruments
        </div>

        {/* Pagination controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Page size selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#495057' }}>Items per page:</label>
            <select 
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1); // Reset to first page when changing limit
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #ced4da',
                fontSize: '14px',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>

          {/* Page navigation */}
          <Pagination page={page} setPage={setPage} totalPages={totalPages} disabled={loading} />
        </div>
      </div>
    </div>
  );
}
