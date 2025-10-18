// src/components/UploadSection.jsx
import { useState, useRef } from 'react';
import styles from '../styles/upload.module.css';

export default function UploadSection({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  // Set today's date as default in YYYY-MM-DD format
  const [reportDate, setReportDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Process a single file
  const uploadSingleFile = async (file, index) => {
    // Update queue status for this file
    setUploadQueue(prev => prev.map((item, i) => 
      i === index ? { ...item, status: 'uploading', progress: 0 } : item
    ));

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add report date if provided
      if (reportDate) {
        formData.append('reportDate', reportDate);
      }

      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api';
      const uploadUrl = `${API_BASE}/upload`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Update queue with success
      setUploadQueue(prev => prev.map((item, i) => 
        i === index ? { 
          ...item, 
          status: 'success', 
          progress: 100,
          result: `✅ ${result.inserted} records from ${result.totalSheets} sheets`
        } : item
      ));

      // Notify parent
      if (onUploadSuccess) {
        onUploadSuccess(result.scheme);
      }

    } catch (error) {
      console.error('Upload error:', error);
      setUploadQueue(prev => prev.map((item, i) => 
        i === index ? { 
          ...item, 
          status: 'error', 
          progress: 0,
          result: `❌ ${error.message}`
        } : item
      ));
    }
  };

  // Process all files in queue
  const processQueue = async (files) => {
    // Check if report date is selected
    if (!reportDate || reportDate.trim() === '') {
      alert('⚠️ Please select a Portfolio Report Date before uploading files.');
      return;
    }
    
    // Filter Excel files only (including XLSM - Excel with macros)
    const excelFiles = Array.from(files).filter(file => {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      return ['.xlsx', '.xls', '.xlsm'].includes(ext);
    });

    if (excelFiles.length === 0) {
      alert('❌ No Excel files found. Please select .xlsx, .xls, or .xlsm files.');
      return;
    }

    // Create queue items
    const queueItems = excelFiles.map(file => ({
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
      result: ''
    }));

    setUploadQueue(queueItems);
    setUploading(true);

    // Upload files sequentially
    for (let i = 0; i < excelFiles.length; i++) {
      await uploadSingleFile(excelFiles[i], i);
    }

    setUploading(false);
  };

  // Handle file input change (single or multiple files)
  const handleFileSelect = (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processQueue(files);
    }
    // Reset input
    event.target.value = '';
  };

  // Handle folder input change
  const handleFolderSelect = (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processQueue(files);
    }
    // Reset input
    event.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = [];
    
    if (e.dataTransfer.items) {
      // Use DataTransferItemList interface
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          const file = e.dataTransfer.items[i].getAsFile();
          if (file) files.push(file);
        }
      }
    } else {
      // Use DataTransfer interface
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }

    if (files.length > 0) {
      processQueue(files);
    }
  };

  // Clear queue
  const clearQueue = () => {
    setUploadQueue([]);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadCard}>
        <h3 className={styles.uploadTitle}>📊 Upload Excel Files</h3>
        <p className={styles.uploadDescription}>
          Upload mutual fund portfolio Excel files (.xlsx, .xls, .xlsm)
        </p>
        
        {/* Report Date Input */}
        <div className={styles.dateInputSection}>
          <label htmlFor="reportDate" className={styles.dateLabel}>
            📅 Portfolio Report Date <span className={styles.required}>* (Required)</span>
          </label>
          <input
            id="reportDate"
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className={styles.dateInput}
            disabled={uploading}
            required
          />
          <p className={styles.dateNote}>Default: Today's date. Change if needed.</p>
        </div>
        
        {/* Drag and Drop Zone */}
        <div 
          className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className={styles.dropZoneContent}>
            <div className={styles.dropIcon}>📂</div>
            <p className={styles.dropText}>
              {isDragging ? '📥 Drop files here' : '🖱️ Drag & drop files or folders here'}
            </p>
            <p className={styles.dropSubtext}>or</p>
            
            {/* Upload Buttons */}
            <div className={styles.uploadButtons}>
              {/* Multiple Files */}
          <input
                ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm"
                multiple
                onChange={handleFileSelect}
            disabled={uploading}
            className={styles.fileInput}
                id="excel-upload-multiple"
          />
          <label 
                htmlFor="excel-upload-multiple" 
            className={`${styles.uploadButton} ${uploading ? styles.uploading : ''}`}
          >
                📁 Select Files
              </label>

              {/* Folder Upload */}
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleFolderSelect}
                disabled={uploading}
                className={styles.fileInput}
                id="folder-upload"
              />
              <label 
                htmlFor="folder-upload" 
                className={`${styles.uploadButton} ${styles.folderButton} ${uploading ? styles.uploading : ''}`}
              >
                📂 Select Folder
          </label>
            </div>
          </div>
        </div>

        {/* Upload Queue */}
        {uploadQueue.length > 0 && (
          <div className={styles.uploadQueue}>
            <div className={styles.queueHeader}>
              <h4>Upload Queue ({uploadQueue.length} files)</h4>
              {!uploading && (
                <button onClick={clearQueue} className={styles.clearButton}>
                  🗑️ Clear
                </button>
              )}
            </div>

            <div className={styles.queueList}>
              {uploadQueue.map((item, index) => (
                <div key={index} className={`${styles.queueItem} ${styles[item.status]}`}>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName}>
                      {item.status === 'pending' && '⏳'}
                      {item.status === 'uploading' && '📤'}
                      {item.status === 'success' && '✅'}
                      {item.status === 'error' && '❌'}
                      {' '}
                      {item.name}
                    </div>
                    <div className={styles.fileSize}>{formatFileSize(item.size)}</div>
                  </div>
                  
                  {item.status === 'uploading' && (
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${item.progress}%` }}></div>
                    </div>
                  )}
                  
                  {item.result && (
                    <div className={styles.fileResult}>{item.result}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className={styles.helpText}>
          <p>💡 <strong>Tips:</strong></p>
          <ul>
            <li>✅ Upload multiple Excel files at once</li>
            <li>✅ Select an entire folder containing Excel files</li>
            <li>✅ Drag & drop files from your file explorer</li>
            <li>✅ All sheets in each file will be processed automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
