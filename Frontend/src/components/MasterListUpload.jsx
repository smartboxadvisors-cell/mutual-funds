import React, { useState } from 'react';
import styles from '../styles/master-upload.module.css';

export default function MasterListUpload({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';
      const uploadUrl = `${API_BASE}/trading/upload-master`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}. Try using the "New Trade Preview Builder" instead (toggle button above) which processes files client-side without needing the server.`);
      }

      const result = await response.json();
      setUploadStatus({ success: true, message: result.message || 'Master list uploaded successfully' });
      
      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
    } catch (error) {
      console.error('Master list upload error:', error);
      const errorMessage = error.message.includes('Failed to fetch') 
        ? 'Server not reachable. Please use the "New Trade Preview Builder" (toggle button above) which works entirely client-side.'
        : error.message;
      setUploadStatus({ success: false, message: errorMessage });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className={styles.masterUpload}>
      <div className={styles.uploadCard}>
        <div style={{ 
          backgroundColor: '#dbeafe', 
          border: '1px solid #3b82f6', 
          borderRadius: '0.375rem', 
          padding: '0.75rem', 
          marginBottom: '1rem',
          fontSize: '0.875rem'
        }}>
          💡 <strong>Tip:</strong> Use the <strong>"New Trade Preview Builder"</strong> (toggle button above) to upload all files at once - it works entirely client-side and doesn't require the server!
        </div>
        
        <h4 className={styles.title}>📊 Upload Master List for Ratings (Server Required)</h4>
        <p className={styles.description}>
          Upload Excel file with ISIN and Rating columns to automatically add ratings to transactions
        </p>
        
        <div className={styles.uploadArea}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            disabled={uploading}
            className={styles.fileInput}
            id="master-upload"
          />
          <label
            htmlFor="master-upload"
            className={`${styles.uploadButton} ${uploading ? styles.uploading : ''}`}
          >
            {uploading ? '⏳ Uploading...' : '📁 Select Master List'}
          </label>
        </div>

        {uploadStatus && (
          <div className={`${styles.status} ${uploadStatus.success ? styles.success : styles.error}`}>
            {uploadStatus.success ? '✅' : '❌'} {uploadStatus.message}
          </div>
        )}

        <div className={styles.helpText}>
          <p><strong>Format:</strong></p>
          <ul>
            <li>Column 1: ISIN (e.g., INE002A08106)</li>
            <li>Column 2: Rating (e.g., CRISIL AAA/Stable ();CARE AAA/Stable ())</li>
            <li>Multiple ratings separated by <code>()</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

