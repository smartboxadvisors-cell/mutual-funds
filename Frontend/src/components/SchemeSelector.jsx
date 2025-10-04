// src/components/SchemeSelector.jsx
import { useState, useEffect } from 'react';
import styles from '../styles/controls.module.css';

export default function SchemeSelector({ selectedSchemeId, onSchemeChange }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch schemes on mount
  useEffect(() => {
    fetchSchemes();
  }, []);

  const fetchSchemes = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/instruments/schemes', {
        headers: {
          'Accept': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const schemesData = await response.json();
      setSchemes(schemesData);
      
      // Auto-select first scheme if none selected
      if (!selectedSchemeId && schemesData.length > 0) {
        onSchemeChange(schemesData[0]._id);
      }
      
    } catch (err) {
      console.error('Error fetching schemes:', err);
      setError(err.message || 'Failed to fetch schemes');
    } finally {
      setLoading(false);
    }
  };

  const formatSchemeOption = (scheme) => {
    const date = new Date(scheme.reportDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    return `${scheme.name} (${date})`;
  };

  if (loading) {
    return (
      <div className={styles.controlGroup}>
        <label className={styles.label}>Scheme</label>
        <div className={styles.loading}>Loading schemes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.controlGroup}>
        <label className={styles.label}>Scheme</label>
        <div className={styles.error}>
          {error}
          <button onClick={fetchSchemes} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.controlGroup}>
      <label className={styles.label}>Scheme</label>
      <select
        className={styles.select}
        value={selectedSchemeId || ''}
        onChange={(e) => onSchemeChange(e.target.value)}
      >
        <option value="">Select a scheme...</option>
        {schemes.map(scheme => (
          <option key={scheme._id} value={scheme._id}>
            {formatSchemeOption(scheme)}
          </option>
        ))}
      </select>
      <div className={styles.schemeCount}>
        {schemes.length} scheme{schemes.length !== 1 ? 's' : ''} available
      </div>
    </div>
  );
}
