// src/components/Filters.jsx
import styles from '../styles/filters.module.css';

// Broad ratings list used by Indian MFs (long/short term + variants + Sovereign)
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

export default function Filters({
  // Text filters
  schemeInput, setSchemeInput,
  instrumentInput, setInstrumentInput,   // plain input only
  isinInput, setIsinInput,

  // Rating (changed from single to multiple)
  ratings, setRatings,

  // Number ranges
  quantityMin, setQuantityMin,
  quantityMax, setQuantityMax,
  pctToNavMin, setPctToNavMin,
  pctToNavMax, setPctToNavMax,
  ytmMin, setYtmMin,
  ytmMax, setYtmMax,

  // 🔥 Market Value (₹) ranges
  mvMin, setMvMin,
  mvMax, setMvMax,

  // Dates
  fromInput, setFromInput,         // Report Date From
  toInput, setToInput,             // Report Date To
  modifiedFrom, setModifiedFrom,   // Modified From
  modifiedTo, setModifiedTo,       // Modified To

  // Paging / meta
  limit, setLimit,
  onReset,
  total, loading
}) {
  
  // Handle checkbox changes for ratings
  const handleRatingChange = (rating, checked) => {
    if (checked) {
      setRatings([...ratings, rating]);
    } else {
      setRatings(ratings.filter(r => r !== rating));
    }
  };

  // Clear all ratings
  const clearRatings = () => {
    setRatings([]);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.title}>Filters</div>
        <div className={styles.meta}>{loading ? 'Loading…' : `${total} results`}</div>
      </div>

      <div className={styles.grid}>
        {/* Scheme */}
        <div className={styles.field}>
          <label className={styles.label}>Scheme</label>
          <input
            className={styles.input}
            placeholder="e.g. Bandhan Liquid Fund"
            value={schemeInput}
            onChange={(e) => setSchemeInput(e.target.value)}
          />
        </div>

        {/* Instrument (plain search) */}
        <div className={styles.field}>
          <label className={styles.label}>Instrument</label>
          <input
            className={styles.input}
            placeholder="type to match: NCD, CP, Bond, G-Sec…"
            value={instrumentInput}
            onChange={(e) => setInstrumentInput(e.target.value)}
          />
        </div>

        {/* ISIN */}
        <div className={styles.field}>
          <label className={styles.label}>ISIN</label>
          <input
            className={styles.input}
            placeholder="e.g. INE123A01016"
            value={isinInput}
            onChange={(e) => setIsinInput(e.target.value)}
          />
        </div>

        {/* Rating - Multi-select checkboxes */}
        <div className={styles.field} style={{ gridColumn: 'span 3' }}>
          <div className={styles.ratingHeader}>
            <label className={styles.label}>Rating</label>
            {ratings.length > 0 && (
              <button 
                type="button" 
                onClick={clearRatings}
                className={styles.clearBtn}
                title="Clear all selected ratings"
              >
                Clear ratings ({ratings.length})
              </button>
            )}
          </div>
          <div className={styles.checkboxGrid}>
            {RATING_OPTIONS.map(rating => (
              <label key={rating} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={ratings.includes(rating)}
                  onChange={(e) => handleRatingChange(rating, e.target.checked)}
                />
                <span className={styles.checkboxText}>{rating}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Quantity (Min/Max) */}
        <div className={styles.field}>
          <label className={styles.label}>Quantity (Min)</label>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1000"
            value={quantityMin ?? ''}
            onChange={(e) => setQuantityMin(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Quantity (Max)</label>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="e.g. 50000"
            value={quantityMax ?? ''}
            onChange={(e) => setQuantityMax(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        {/* % to NAV (Min/Max) */}
        <div className={styles.field}>
          <label className={styles.label}>% to NAV (Min)</label>
          <input
            className={styles.input}
            type="number"
            step="0.0001"
            inputMode="decimal"
            placeholder="e.g. 0.10"
            value={pctToNavMin ?? ''}
            onChange={(e) => setPctToNavMin(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>% to NAV (Max)</label>
          <input
            className={styles.input}
            type="number"
            step="0.0001"
            inputMode="decimal"
            placeholder="e.g. 5"
            value={pctToNavMax ?? ''}
            onChange={(e) => setPctToNavMax(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        {/* YTM (Min/Max) */}
        <div className={styles.field}>
          <label className={styles.label}>YTM (Min)</label>
          <input
            className={styles.input}
            type="number"
            step="0.0001"
            inputMode="decimal"
            placeholder="e.g. 6.50"
            value={ytmMin ?? ''}
            onChange={(e) => setYtmMin(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>YTM (Max)</label>
          <input
            className={styles.input}
            type="number"
            step="0.0001"
            inputMode="decimal"
            placeholder="e.g. 12"
            value={ytmMax ?? ''}
            onChange={(e) => setYtmMax(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        {/* 🔥 Market Value (₹) Min/Max */}
        <div className={styles.field}>
          <label className={styles.label}>Market Value (₹) Min</label>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1000000"
            value={mvMin ?? ''}
            onChange={(e) => setMvMin(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Market Value (₹) Max</label>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="e.g. 50000000"
            value={mvMax ?? ''}
            onChange={(e) => setMvMax(e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        {/* Report Date (From/To) */}
        <div className={styles.field}>
          <label className={styles.label}>Report Date (From)</label>
          <input
            className={styles.input}
            type="date"
            value={fromInput || ''}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Report Date (To)</label>
          <input
            className={styles.input}
            type="date"
            value={toInput || ''}
            onChange={(e) => setToInput(e.target.value)}
          />
        </div>

        {/* Modified (From/To) */}
        <div className={styles.field}>
          <label className={styles.label}>Modified (From)</label>
          <input
            className={styles.input}
            type="date"
            value={modifiedFrom || ''}
            onChange={(e) => setModifiedFrom(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Modified (To)</label>
          <input
            className={styles.input}
            type="date"
            value={modifiedTo || ''}
            onChange={(e) => setModifiedTo(e.target.value)}
          />
        </div>

        {/* Footer row: page size + reset */}
        <div className={styles.rowEnd}>
          <select
            className={styles.select}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[25, 50, 100, 200].map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>

          <button type="button" onClick={onReset} className={styles.ghostBtn}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
