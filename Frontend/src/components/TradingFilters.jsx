// src/components/TradingFilters.jsx
import { useState } from 'react';
import styles from '../styles/trading-filters.module.css';

export default function TradingFilters({ filters, onFilterChange, exchangeType }) {
  const [localFilters, setLocalFilters] = useState({
    exchange: filters.exchange || '',
    symbol: filters.symbol || '',
    isin: filters.isin || '',
    issuerName: filters.issuerName || '',
    orderType: filters.orderType || '',
    settlementStatus: filters.settlementStatus || '',
    tradeDateFrom: filters.tradeDateFrom || '',
    tradeDateTo: filters.tradeDateTo || '',
    amountMin: filters.amountMin || '',
    amountMax: filters.amountMax || '',
    priceMin: filters.priceMin || '',
    priceMax: filters.priceMax || ''
  });

  const handleInputChange = (field, value) => {
    const updatedFilters = { ...localFilters, [field]: value };
    setLocalFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      exchange: '',
      symbol: '',
      isin: '',
      issuerName: '',
      orderType: '',
      settlementStatus: '',
      tradeDateFrom: '',
      tradeDateTo: '',
      amountMin: '',
      amountMax: '',
      priceMin: '',
      priceMax: ''
    };
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const hasActiveFilters = Object.values(localFilters).some(value =>
    value !== '' && value !== null && value !== undefined
  );

  return (
    <div className={styles.filtersContainer}>
      <div className={styles.filtersHeader}>
        <h3 className={styles.filtersTitle}>🔍 Filter Trading Data</h3>
        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearButton}>
            🗑️ Clear All
          </button>
        )}
      </div>

      <div className={styles.filtersGrid}>
        {/* Exchange Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>🏛️ Exchange</label>
          <select
            className={styles.filterSelect}
            value={localFilters.exchange}
            onChange={(e) => handleInputChange('exchange', e.target.value)}
          >
            <option value="">All Exchanges</option>
            <option value="BSE">BSE</option>
            <option value="NSE">NSE</option>
          </select>
        </div>

        {/* Symbol Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>🔍 Symbol</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Enter symbol (e.g., RELIANCE)"
            value={localFilters.symbol}
            onChange={(e) => handleInputChange('symbol', e.target.value)}
          />
        </div>

        {/* ISIN Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>🔍 ISIN</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Enter ISIN code"
            value={localFilters.isin}
            onChange={(e) => handleInputChange('isin', e.target.value)}
          />
        </div>

        {/* Issuer Name Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>🏢 Issuer Name</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Enter issuer or company name"
            value={localFilters.issuerName}
            onChange={(e) => handleInputChange('issuerName', e.target.value)}
          />
        </div>

        {/* Order Type Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>📋 Order Type</label>
          <select
            className={styles.filterSelect}
            value={localFilters.orderType}
            onChange={(e) => handleInputChange('orderType', e.target.value)}
          >
            <option value="">All Types</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>

        {/* Settlement Status Filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>📊 Settlement Status</label>
          <select
            className={styles.filterSelect}
            value={localFilters.settlementStatus}
            onChange={(e) => handleInputChange('settlementStatus', e.target.value)}
          >
            <option value="">All Status</option>
            <option value="Settled">Settled</option>
            <option value="Pending">Pending</option>
            <option value="Executed">Executed</option>
          </select>
        </div>

        {/* Trade Date Range */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>📅 Trade Date From</label>
          <input
            type="date"
            className={styles.filterInput}
            value={localFilters.tradeDateFrom}
            onChange={(e) => handleInputChange('tradeDateFrom', e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>📅 Trade Date To</label>
          <input
            type="date"
            className={styles.filterInput}
            value={localFilters.tradeDateTo}
            onChange={(e) => handleInputChange('tradeDateTo', e.target.value)}
          />
        </div>

        {/* Amount Range */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>💰 Amount Min (₹)</label>
          <input
            type="number"
            className={styles.filterInput}
            placeholder="0"
            value={localFilters.amountMin}
            onChange={(e) => handleInputChange('amountMin', e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>💰 Amount Max (₹)</label>
          <input
            type="number"
            className={styles.filterInput}
            placeholder="No limit"
            value={localFilters.amountMax}
            onChange={(e) => handleInputChange('amountMax', e.target.value)}
          />
        </div>

        {/* Price Range */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>💰 Price Min (₹)</label>
          <input
            type="number"
            step="0.01"
            className={styles.filterInput}
            placeholder="0.00"
            value={localFilters.priceMin}
            onChange={(e) => handleInputChange('priceMin', e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>💰 Price Max (₹)</label>
          <input
            type="number"
            step="0.01"
            className={styles.filterInput}
            placeholder="No limit"
            value={localFilters.priceMax}
            onChange={(e) => handleInputChange('priceMax', e.target.value)}
          />
        </div>
      </div>

      {/* Filter Summary */}
      {hasActiveFilters && (
        <div className={styles.activeFilters}>
          <h4 className={styles.activeFiltersTitle}>Active Filters:</h4>
          <div className={styles.activeFiltersList}>
            {localFilters.exchange && <span className={styles.filterTag}>Exchange: {localFilters.exchange}</span>}
            {localFilters.symbol && <span className={styles.filterTag}>Symbol: {localFilters.symbol}</span>}
            {localFilters.isin && <span className={styles.filterTag}>ISIN: {localFilters.isin}</span>}
            {localFilters.issuerName && <span className={styles.filterTag}>Issuer: {localFilters.issuerName}</span>}
            {localFilters.orderType && <span className={styles.filterTag}>Order Type: {localFilters.orderType}</span>}
            {localFilters.settlementStatus && <span className={styles.filterTag}>Status: {localFilters.settlementStatus}</span>}
            {(localFilters.tradeDateFrom || localFilters.tradeDateTo) && (
              <span className={styles.filterTag}>
                Date: {localFilters.tradeDateFrom || '...'} to {localFilters.tradeDateTo || '...'}
              </span>
            )}
            {(localFilters.amountMin || localFilters.amountMax) && (
              <span className={styles.filterTag}>
                Amount: ₹{localFilters.amountMin || '0'} - ₹{localFilters.amountMax || '∞'}
              </span>
            )}
            {(localFilters.priceMin || localFilters.priceMax) && (
              <span className={styles.filterTag}>
                Price: ₹{localFilters.priceMin || '0'} - ₹{localFilters.priceMax || '∞'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
