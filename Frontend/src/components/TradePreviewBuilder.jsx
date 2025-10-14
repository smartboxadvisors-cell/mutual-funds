import React, { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import "../App.css";
import "../styles/trade-preview.css";

const FILTER_DEFAULTS = {
  exchange: "",
  tradeDate: "",
  tradeTime: "",
  isin: "",
  issuerDetails: "",
  maturity: "",
  minAmt: "",
  maxAmt: "",
  minPrice: "",
  maxPrice: "",
  yield: "",
  status: "",
  dealType: "",
  rating: "",
  startDate: "",
  endDate: ""
};

const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:5000/api";

const DB_FETCH_LIMIT = 500;

const RATING_GROUP_OPTIONS = ["AAA", "AA", "A", "BBB", "BB", "B"];

const AMOUNT_BUCKETS = [
  { key: 'UNDER_10', label: 'Below 10 Lac', min: 0, max: 10 },
  { key: 'BETWEEN_10_50', label: 'Between 10 Lac to 50 Lac', min: 10, max: 50 },
  { key: 'BETWEEN_50_100', label: 'Between 50 Lac to 100 Lac', min: 50, max: 100 },
  { key: 'BETWEEN_100_500', label: 'Between 100 Lac to 500 Lac', min: 100, max: 500 },
  { key: 'BETWEEN_500_2500', label: 'Between 500 Lac to 2500 Lac', min: 500, max: 2500 },
  { key: 'ABOVE_2500', label: 'Above 2500 Lac', min: 2500, max: Infinity },
];

const BUCKET_HEADER_COLORS = {
  UNDER_10: '#1e293b',
  BETWEEN_10_50: '#1d4ed8',
  BETWEEN_50_100: '#4338ca',
  BETWEEN_100_500: '#2563eb',
  BETWEEN_500_2500: '#0f62fe',
  ABOVE_2500: '#0f172a',
  default: '#1f2937',
};

const SummaryTable = React.memo(function SummaryTable({ rows }) {
  return (
    <div className="tp-summary-container">
      <div className="tp-scroll max-h-[320px] overflow-y-auto">
        <table className="tp-summary-table min-w-[720px] w-full table-fixed border-collapse border border-slate-200 text-sm text-slate-700">
          <thead className="bg-slate-800 text-[13px] uppercase tracking-[0.17em] text-white/90 border-b border-slate-700">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Name of Issuer</th>
              <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">ISIN</th>
              <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Maturity Date</th>
              <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Trade Count</th>
              <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Sum of Amount (INR Lacs)</th>
              <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Weighted Avg Yield</th>
              <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle border-r border-slate-700 last:border-r-0">Broker + YTM</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 text-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center italic text-slate-400">No matches found</td>
              </tr>
            ) : (
              rows.map((summary) => (
                <tr key={summary.rowKey} className="odd:bg-white even:bg-slate-100 transition-colors duration-200 hover:bg-orange-50/40">
                  <td className="px-3 py-4 font-semibold text-slate-800 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.issuer}</td>
                  <td className="px-3 py-4 font-mono uppercase text-slate-500 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.isin}</td>
                  <td className="px-3 py-4 text-slate-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.maturity}</td>
                  <td className="px-3 py-4 text-right font-semibold text-slate-900 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.tradeCount}</td>
                  <td className="px-3 py-4 text-right font-semibold text-indigo-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.sumAmount.toFixed(2)}</td>
                  <td className="px-3 py-4 text-right font-semibold text-emerald-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{Number.isFinite(summary.weightedAverage) ? summary.weightedAverage.toFixed(2) : '-'}</td>
                  <td className="px-3 py-4 text-slate-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0">{summary.brokerYtm}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const getRatingBannerClass = (ratingLabel = '') => {
  const normalized = String(ratingLabel || 'UNRATED').toUpperCase();
  if (normalized.startsWith('AAA')) return 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white';
  if (normalized.startsWith('AA')) return 'bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-700 text-white';
  if (normalized.startsWith('A')) return 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white';
  if (normalized.startsWith('BBB')) return 'bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 text-white';
  if (normalized.startsWith('BB')) return 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white';
  if (normalized.startsWith('B')) return 'bg-gradient-to-r from-red-500 via-rose-600 to-red-600 text-white';
  if (normalized.startsWith('C')) return 'bg-gradient-to-r from-slate-600 via-slate-700 to-gray-800 text-white';
  if (normalized.startsWith('D')) return 'bg-gradient-to-r from-slate-700 via-slate-800 to-black text-white';
  if (normalized.includes('UNRATED')) return 'bg-gradient-to-r from-slate-500 via-slate-600 to-slate-700 text-white';
  return 'bg-gradient-to-r from-slate-500 via-slate-600 to-slate-700 text-white';
};

// ========== UTILITY FUNCTIONS ==========

const norm = (str) => String(str || "").toLowerCase().replace(/\s+/g, "");

const firstCol = (headers, patterns) => {
  const normHeaders = headers.map(norm);
  for (const pattern of patterns) {
    const target = norm(pattern);
    const exactIdx = normHeaders.findIndex((h) => h === target);
    if (exactIdx !== -1) return exactIdx;
  }
  for (const pattern of patterns) {
    const target = norm(pattern);
    const partialIdx = normHeaders.findIndex((h) => h.includes(target));
    if (partialIdx !== -1) return partialIdx;
  }
  return -1;
};

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const pad2 = (value) => String(value).padStart(2, "0");

const coerceNumber = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const cleaned = String(val)
    .replace(/[,\s]/g, '')
    .replace(/[^0-9.+-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const excelSerialToDate = (serial) => {
  const wholeDays = Math.floor(serial);
  const milliseconds = Math.round(wholeDays * 86400000);
  return new Date(EXCEL_EPOCH_MS + milliseconds);
};

const formatDate = (date) => {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `${d}/${m}/${y}`;
};

const toDate = (val) => {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return formatDate(val);
  }

  const numeric = coerceNumber(val);
  if (numeric !== null) {
    if (numeric > 59 && numeric < 2958465) {
      const excelDate = excelSerialToDate(numeric);
      if (!Number.isNaN(excelDate.getTime())) {
        return formatDate(excelDate);
      }
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  const dmyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,5})$/);
  if (dmyMatch) {
    let [, day, month, year] = dmyMatch;
    if (year.length === 2) {
      const yearInt = parseInt(year, 10);
      year = String((yearInt >= 70 ? 1900 : 2000) + yearInt);
    }

    const yearNum = Number(year);
    if (!Number.isNaN(yearNum) && yearNum > 4000) {
      const excelDate = excelSerialToDate(yearNum);
      if (!Number.isNaN(excelDate.getTime())) {
        return formatDate(excelDate);
      }
    }

    const parsedDMY = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(parsedDMY.getTime())) {
      return formatDate(parsedDMY);
    }
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  return str;
};

const parseDmyToDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const numeric = coerceNumber(value);
  if (numeric !== null) {
    if (numeric > 59 && numeric < 2958465) {
      const excel = excelSerialToDate(numeric);
      return Number.isNaN(excel.getTime()) ? null : excel;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  const normalized = str.replace(/[-.]/g, '/');
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,5})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) {
      const yy = Number(y);
      y = String(yy >= 70 ? 1900 + yy : 2000 + yy);
    }
    const yearNum = Number(y);
    if (!Number.isNaN(yearNum) && yearNum > 4000) {
      const excel = excelSerialToDate(yearNum);
      if (!Number.isNaN(excel.getTime())) return excel;
    }
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const fractionToTime = (fraction) => {
  const normalized = ((fraction % 1) + 1) % 1;
  const totalSeconds = Math.round(normalized * 86400) % 86400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
};

const toTime = (val) => {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${pad2(val.getUTCHours())}:${pad2(val.getUTCMinutes())}:${pad2(val.getUTCSeconds())}`;
  }

  const numeric = coerceNumber(val);
  if (numeric !== null) {
    if (numeric >= 0 && numeric < 1) {
      return fractionToTime(numeric);
    }

    if (numeric > 1 && numeric < 2958465) {
      const fraction = numeric % 1;
      if (fraction > 0) {
        return fractionToTime(fraction);
      }
    }

    if (numeric >= 0 && numeric <= 24 && Number.isInteger(numeric)) {
      return `${pad2(numeric)}:00:00`;
    }
  }

  const s = String(val).trim();
  if (!s) return '';

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;

  const inlineMatch = s.match(/(\d{1,2}:\d{2}:\d{2})$/);
  if (inlineMatch) return inlineMatch[1];

  return s;
};

const rupeesToLacs = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return parseFloat((num / 100000).toFixed(4));
};

const toNumeric = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value)
    .replace(/[,\s]/g, '')
    .replace(/[^0-9.+-]/g, '')
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
};


const pickNumeric = (...sources) => {
  for (const source of sources) {
    const numeric = toNumeric(source);
    if (numeric !== null) return numeric;
  }
  return null;
};

const INVALID_DISPLAY_TOKENS = new Set([
  'NA',
  'N/A',
  'NOT AVAILABLE',
  'NOT APPLICABLE',
  'NULL',
  'NIL',
  'NONE',
  '--',
]);

const sanitizeDisplayValue = (value) => {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\s+/g, ' ').replace(/\./g, '').toUpperCase();
  const collapsed = normalized.replace(/[^A-Z]/g, '');
  if (INVALID_DISPLAY_TOKENS.has(normalized) || INVALID_DISPLAY_TOKENS.has(collapsed)) {
    return '';
  }
  return trimmed;
};

const getFileBadgeLabel = (filename = '') => {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.xlsx')) return 'XLSX';
  if (lower.endsWith('.xls')) return 'XLS';
  return 'FILE';
};

const normalizeRatingGroup = (label = '') => {
  const upper = String(label || '').toUpperCase();
  const match = upper.match(/(?:^|\s)([ABCD]{1,3})(?=[+\-\/\s(]|$)/);
  if (match && match[1]) {
    return match[1];
  }
  return 'UNRATED';
};

const sortRowsDescending = (rowsList = []) => {
  rowsList.sort((a, b) => {
    if (a["Trade Date"] !== b["Trade Date"]) {
      return b["Trade Date"].localeCompare(a["Trade Date"]);
    }
    if (a.Exchange !== b.Exchange) {
      return a.Exchange.localeCompare(b.Exchange);
    }
    return a.ISIN.localeCompare(b.ISIN);
  });
};

const mapTransactionToRow = (transaction) => {
  if (!transaction) return null;

  const raw = transaction.raw || {};
  const exchange = transaction.exchange || raw.exchange || raw.Exchange || '';
  const tradeDateValue =
    transaction.tradeDate ||
    raw.tradeDate ||
    raw['Trade Date'] ||
    raw['Deal Date'] ||
    raw.Date ||
    '';
  const maturityValue =
    transaction.maturityDate ||
    raw.maturityDate ||
    raw.MaturityDate ||
    raw['Maturity Date'] ||
    raw.Maturity ||
    '';

  let amountValue =
    typeof transaction.tradeAmountValue === 'number' && !Number.isNaN(transaction.tradeAmountValue)
      ? transaction.tradeAmountValue
      : coerceNumber(transaction.tradeAmountRaw || raw.tradeAmount || raw['Amount (Rs lacs)']);
  if (amountValue === null || Number.isNaN(amountValue)) {
    amountValue = 0;
  }
  if (exchange.toUpperCase() === 'NSE' && amountValue > 1000) {
    amountValue = amountValue / 100000;
  }

  let priceValue =
    typeof transaction.tradePriceValue === 'number' && !Number.isNaN(transaction.tradePriceValue)
      ? transaction.tradePriceValue
      : coerceNumber(transaction.tradePriceRaw || raw.tradePrice || raw['Price (Rs)']);
  if (priceValue === null || Number.isNaN(priceValue)) {
    priceValue = 0;
  }

  let ratingValue = '';
  if (typeof transaction.rating === 'string' && transaction.rating.trim()) {
    ratingValue = transaction.rating.trim();
  } else if (transaction.ratingGroup && transaction.ratingGroup !== 'UNRATED') {
    ratingValue = transaction.ratingGroup;
  } else if (typeof raw.rating === 'string' && raw.rating.trim()) {
    ratingValue = raw.rating.trim();
  } else if (typeof raw.Rating === 'string' && raw.Rating.trim()) {
    ratingValue = raw.Rating.trim();
  }

  const ratingParts = ratingValue
    ? ratingValue.split(/[|;]+/).map((part) => part.trim()).filter(Boolean)
    : [];

  const yieldValue = sanitizeDisplayValue(
    (() => {
      if (transaction.yieldRaw && String(transaction.yieldRaw).trim()) {
        return String(transaction.yieldRaw).trim();
      }
      if (typeof transaction.yieldValue === 'number' && !Number.isNaN(transaction.yieldValue)) {
        return transaction.yieldValue.toString();
      }
      if (raw.Yield) return String(raw.Yield);
      if (raw['Deal Yield']) return String(raw['Deal Yield']);
      if (raw['Traded Yield (%)']) return String(raw['Traded Yield (%)']);
      return '';
    })()
  );

  const issuerDetail =
    transaction.issuerName || raw.issuerName || raw['Issuer details'] || raw.issuer || '';

  return {
    Exchange: (exchange || '').toUpperCase(),
    "Trade Date": toDate(tradeDateValue) || '',
    "Trade Time": transaction.tradeTime || raw.tradeTime || raw['Trade Time'] || '',
    ISIN: String(transaction.isin || raw.ISIN || '').toUpperCase(),
    "Issuer details": issuerDetail,
    Maturity: toDate(maturityValue) || '',
    "Amount (Rs lacs)": Number(amountValue || 0),
    "Price (Rs)": Number(priceValue || 0),
    Yield: yieldValue,
    "Deal Yield": yieldValue,
    Status: sanitizeDisplayValue(transaction.settlementStatus || raw.settlementStatus || raw.Status),
    "Deal Type": transaction.orderType || raw.orderType || raw['Deal Type'] || '',
    Rating: ratingValue,
    RatingParts: ratingParts,
  };
};

const extractExchangeFromFileName = (fileName = "") => {
  const normalized = String(fileName).toLowerCase();
  if (normalized.includes("nse")) return "NSE";
  if (normalized.includes("bse")) return "BSE";
  return "";
};

const detectType = (headers) => {
  const h = headers.map(norm);
  const hasCreditRating = h.some((x) => x.includes("creditrating") || x.includes("rating"));
  const hasIssuer = h.some((x) => x.includes("nameofissuer") || x.includes("issuername") || x.includes("issuer"));
  const hasISIN = h.some((x) => x.includes("isin"));
  if (hasCreditRating && hasIssuer && hasISIN) return "SECURITIES";

  const hasDealSize = h.some((x) => x.includes("dealsize"));
  const hasSettlementStatus = h.some((x) => x.includes("settlementstatus"));
  if (hasDealSize || hasSettlementStatus) return "NSE";

  const hasTradeAmountLacs = h.some((x) => x.includes("tradeamount") && x.includes("lacs"));
  const hasOrderType = h.some((x) => x.includes("ordertype"));
  if (hasTradeAmountLacs || hasOrderType) return "BSE";

  return "UNKNOWN";
};

// ========== MAIN COMPONENT ==========
export default function TradePreviewBuilder() {
  const [pickedFiles, setPickedFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(() => ({ ...FILTER_DEFAULTS }));
  const [busy, setBusy] = useState(false);
  const [serverSyncing, setServerSyncing] = useState(false);
  const [serverSyncSummaries, setServerSyncSummaries] = useState([]);
  const [serverSyncError, setServerSyncError] = useState('');
  const [usingDatabase, setUsingDatabase] = useState(false);
  const [dbMeta, setDbMeta] = useState(null);
  const [lastDbQuery, setLastDbQuery] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const headerRowRef = useRef(null);
  const tableScrollRef = useRef(null);
  const uploadedFilesRef = useRef(new Set());
  const [filterTop, setFilterTop] = useState('0px');
  const [summarySearch, setSummarySearch] = useState('');
  const filtersSignature = JSON.stringify(filters);
  const [ratingsPerPage, setRatingsPerPage] = useState(2);
  const [ratingPage, setRatingPage] = useState(1);
  const [showAggregated, setShowAggregated] = useState(false);
  const [bucketPageMap, setBucketPageMap] = useState({});
  const AGGREGATE_ROWS_PER_PAGE = 20;

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    setPickedFiles((prev) => [...prev, ...files]);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    setPickedFiles((prev) => [...prev, ...files]);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleShowAggregated = useCallback(() => {
    setBucketPageMap({});
    setRatingPage(1);
    setShowAggregated(true);
  }, []);

  const handleHideAggregated = useCallback(() => {
    setShowAggregated(false);
  }, []);

  const handleBucketPageChange = useCallback((bucketKey, nextPage, totalPages) => {
    const safePage = Math.max(1, Math.min(totalPages, nextPage));
    setBucketPageMap((prev) => {
      const current = prev[bucketKey] || 1;
      if (current === safePage) return prev;
      return { ...prev, [bucketKey]: safePage };
    });
  }, []);

  const clearFiles = () => {
    setPickedFiles([]);
    setRows([]);
    resetFilters();
    setCurrentPage(1);
    setServerSyncSummaries([]);
    setServerSyncError('');
    setShowAggregated(false);
    setBucketPageMap({});
    setUsingDatabase(false);
    setDbMeta(null);
    setLastDbQuery(null);
  };

  const resetFilters = useCallback(() => {
    setFilters({ ...FILTER_DEFAULTS });
  }, []);

  const syncFilesWithServer = useCallback(async (files = []) => {
    if (!files || files.length === 0) {
      setServerSyncSummaries([]);
      setServerSyncError('');
      return [];
    }

    setServerSyncing(true);
    setServerSyncError('');

    const token = localStorage.getItem('token');
    const summaries = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      const isMasterCandidates = ['security', 'securit', 'master'];
      const isMaster = isMasterCandidates.some((token) => lowerName.includes(token));
      const endpoint = isMaster ? `${API_BASE}/trading/upload-master` : `${API_BASE}/trading/upload`;
      const key = `${endpoint}::${file.name}__${file.size}__${file.lastModified}`;

      if (uploadedFilesRef.current.has(key)) {
        summaries.push({
          name: file.name,
          status: 'skipped',
          details: 'Already synced with MongoDB.',
        });
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (!response.ok || payload.success === false) {
          throw new Error(payload.error || `Server responded with ${response.status}`);
        }

        if (isMaster) {
          const processed = payload.processedCount ?? 0;
          const inserted = payload.inserted ?? 0;
          const updated = payload.updated ?? 0;

          summaries.push({
            name: file.name,
            status: 'success',
            details: `Master list processed ${processed} rows (inserted ${inserted}, updated ${updated}).`,
          });

          uploadedFilesRef.current.add(key);
          continue;
        }

        const imported = payload.imported ?? 0;
        const updated = payload.updated ?? 0;
        const duplicates = payload.duplicates ?? 0;

        summaries.push({
          name: file.name,
          status: 'success',
          details: `Stored ${imported} new, updated ${updated}, skipped ${duplicates} duplicates.`,
        });

        uploadedFilesRef.current.add(key);
      } catch (error) {
        console.error('Trading sync upload error:', error);
        summaries.push({
          name: file.name,
          status: 'error',
          details: error.message || 'Failed to sync file with MongoDB.',
        });
      }
    }

    setServerSyncSummaries(summaries);
    const hasError = summaries.some((entry) => entry.status === 'error');
    setServerSyncError(hasError ? 'Some files failed to sync. See details below.' : '');
    setServerSyncing(false);

    return summaries;
  }, []);

  const parseFile = (file) => {
    return new Promise((resolve, reject) => {
      const ext = file.name.split(".").pop().toLowerCase();
      const reader = new FileReader();

      const exchangeHint = extractExchangeFromFileName(file.name);

      reader.onload = (e) => {
        try {
          if (ext === "csv") {
            Papa.parse(e.target.result, {
              complete: (result) =>
                resolve({
                  headers: result.data[0] || [],
                  data: result.data.slice(1),
                  fileName: file.name,
                  exchangeHint,
                }),
              error: reject,
            });
          } else if (["xlsx", "xls"].includes(ext)) {
            const wb = XLSX.read(e.target.result, { type: "binary" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            resolve({
              headers: json[0] || [],
              data: json.slice(1),
              fileName: file.name,
              exchangeHint,
            });
          } else {
            reject(new Error("Unsupported file type"));
          }
        } catch (err) {
          reject(err);
        }
      };

      if (ext === "csv") {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    });
  };

  const buildPreview = async () => {
    setBusy(true);
    try {
      await syncFilesWithServer(pickedFiles);
      const parsed = await Promise.all(pickedFiles.map((f) => parseFile(f)));

      let securitiesMap = {};
      const tradeRows = [];

      for (const { headers, data, exchangeHint } of parsed) {
        const headerType = detectType(headers);
        const effectiveExchange =
          exchangeHint || (headerType === "NSE" || headerType === "BSE" ? headerType : "");

        if (headerType === "SECURITIES") {
          const isinIdx = firstCol(headers, ["isin", "isin code"]);
          const issuerIdx = firstCol(headers, ["name of issuer", "issuer name", "issuer"]);
          const ratingIdx = firstCol(headers, ["credit rating", "rating"]);

          for (const row of data) {
            const isin = String(row[isinIdx] || "").trim();
            if (isin && /^[A-Z0-9]{12}$/.test(isin)) {
              securitiesMap[isin] = {
                issuer: String(row[issuerIdx] || "").trim(),
                rating: String(row[ratingIdx] || "").trim(),
              };
            }
          }
        } else if (effectiveExchange === "NSE") {
          const isinIdx = firstCol(headers, ["isin"]);
          const dateIdx = firstCol(headers, ["trade date", "deal date", "date"]);
          const timeIdx = firstCol(headers, ["trade time", "time", "timestamp"]);
          const maturityIdx = firstCol(headers, ["maturity date", "maturity"]);
          const dealSizeIdx = firstCol(headers, ["deal size", "trade amount (rs)", "amount"]);
          const priceIdx = firstCol(headers, ["price", "trade price"]);
          const yieldIdx = firstCol(headers, ["yield", "traded yield", "deal yield"]);
          const statusIdx = firstCol(headers, ["settlement status", "status"]);
          const sellerIdx = firstCol(headers, ["seller deal type", "seller type"]);
          const buyerIdx = firstCol(headers, ["buyer deal type", "buyer type"]);
          const exchangeLabel = effectiveExchange || "NSE";

          for (const row of data) {
            const isin = String(row[isinIdx] || "").trim();
            if (!isin || !/^[A-Z0-9]{12}$/.test(isin)) continue;

            const dealSizeRupees = parseFloat(row[dealSizeIdx]) || 0;
            const amountLacs = rupeesToLacs(dealSizeRupees);

            const seller = String(row[sellerIdx] || "").toUpperCase();
            const buyer = String(row[buyerIdx] || "").toUpperCase();
            let dealType = "";
            if (seller.includes("DIRECT") && buyer.includes("DIRECT")) {
              dealType = "DIRECT";
            } else if (seller.includes("BROKERED") || buyer.includes("BROKERED")) {
              dealType = "BROKERED";
            } else {
              dealType = seller || buyer || "";
            }

            const tradeDate = toDate(row[dateIdx]);

            tradeRows.push({
              Exchange: exchangeLabel,
              "Trade Date": tradeDate,
              "Trade Time": toTime(row[timeIdx]),
              ISIN: isin,
              "Issuer details": "",
              Maturity: toDate(row[maturityIdx]),
              "Amount (Rs lacs)": amountLacs,
              "Price (Rs)": parseFloat(row[priceIdx]) || 0,
              Yield: sanitizeDisplayValue(row[yieldIdx]),
              "Deal Yield": sanitizeDisplayValue(row[yieldIdx]),
              Status: sanitizeDisplayValue(row[statusIdx]),
              "Deal Type": dealType,
              Rating: "",
            });
          }
        } else if (effectiveExchange === "BSE") {
          const isinIdx = firstCol(headers, ["isin"]);
          const dateIdx = firstCol(headers, ["trade date", "deal date", "date"]);
          const timeIdx = firstCol(headers, ["trade time", "time"]);
          const maturityIdx = firstCol(headers, ["maturity date", "maturity"]);
          const amountIdx = firstCol(headers, ["trade amount (in rs lacs)", "amount (rs lacs)", "amount"]);
          const priceIdx = firstCol(headers, ["trade price (rs)", "price"]);
          const yieldIdx = firstCol(headers, ["traded yield (%)", "yield", "deal yield"]);
          const orderTypeIdx = firstCol(headers, ["order type", "type"]);
          const exchangeLabel = effectiveExchange || "BSE";

          for (const row of data) {
            const isin = String(row[isinIdx] || "").trim();
            if (!isin || !/^[A-Z0-9]{12}$/.test(isin)) continue;

            const amountLacs = pickNumeric(row[amountIdx], row['Trade Amount (In Rs lacs)']) ?? 0;
            const orderType = String(row[orderTypeIdx] || "").toUpperCase();

            const tradeDate = toDate(row[dateIdx]);

            tradeRows.push({
              Exchange: exchangeLabel,
              "Trade Date": tradeDate,
              "Trade Time": toTime(row[timeIdx]),
              ISIN: isin,
              "Issuer details": "",
              Maturity: toDate(row[maturityIdx]),
              "Amount (Rs lacs)": amountLacs,
              "Price (Rs)": parseFloat(row[priceIdx]) || 0,
              Yield: sanitizeDisplayValue(row[yieldIdx]),
              "Deal Yield": sanitizeDisplayValue(row[yieldIdx]),
              Status: "",
              "Deal Type": orderType,
              Rating: "",
            });
          }
        }
      }

      // Join with securities map
      tradeRows.forEach((row) => {
        const sec = securitiesMap[row.ISIN];
        if (sec) {
          row["Issuer details"] = sec.issuer;
          row.Rating = sec.rating;
        }

        const ratingValue = typeof row.Rating === "string" ? row.Rating.trim() : String(row.Rating || "").trim();
        const ratingParts = ratingValue
          ? ratingValue.split(";").map((part) => part.trim()).filter(Boolean)
          : [];

        row.Rating = ratingValue;
        row.RatingParts = ratingParts;
      });

      // Sort by Trade Date (desc), then Exchange, then ISIN
      sortRowsDescending(tradeRows);

      setRows(tradeRows);
      setCurrentPage(1);
      setUsingDatabase(false);
      setDbMeta(null);
      setLastDbQuery(null);
    } catch (err) {
      console.error("Build preview error:", err);
      alert("Error building preview: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const activeRatingGroup = useMemo(() => {
    const input = (filters.rating || '').trim();
    if (!input) return '';
    return normalizeRatingGroup(input);
  }, [filters.rating]);

  const normalizedExchangeFilter = useMemo(
    () => (filters.exchange || '').trim().toUpperCase(),
    [filters.exchange]
  );

  const normalizedTradeDateFilter = useMemo(
    () => (filters.tradeDate || '').trim(),
    [filters.tradeDate]
  );

  const normalizedStartDateFilter = useMemo(
    () => (filters.startDate || '').trim(),
    [filters.startDate]
  );

  const normalizedEndDateFilter = useMemo(
    () => (filters.endDate || '').trim(),
    [filters.endDate]
  );

  const serverFilterSnapshot = useMemo(() => {
    const trimmedTradeTime = (filters.tradeTime || '').trim();
    const trimmedIsin = (filters.isin || '').trim().toUpperCase();
    const trimmedIssuer = (filters.issuerDetails || '').trim();
    const trimmedMaturity = (filters.maturity || '').trim();
    const trimmedMinAmt = (filters.minAmt || '').trim();
    const trimmedMaxAmt = (filters.maxAmt || '').trim();
    const trimmedMinPrice = (filters.minPrice || '').trim();
    const trimmedMaxPrice = (filters.maxPrice || '').trim();
    const trimmedYield = (filters.yield || '').trim();
    const trimmedStatus = (filters.status || '').trim();
    const trimmedDealType = (filters.dealType || '').trim();

    return {
      ratingGroup: activeRatingGroup,
      tradeDate: normalizedTradeDateFilter,
      startDate: normalizedStartDateFilter,
      endDate: normalizedEndDateFilter,
      exchange: normalizedExchangeFilter,
      tradeTime: trimmedTradeTime,
      isin: trimmedIsin,
      issuer: trimmedIssuer,
      maturity: trimmedMaturity,
      minAmt: trimmedMinAmt,
      maxAmt: trimmedMaxAmt,
      minPrice: trimmedMinPrice,
      maxPrice: trimmedMaxPrice,
      yieldText: trimmedYield,
      status: trimmedStatus,
      dealType: trimmedDealType,
    };
  }, [
    activeRatingGroup,
    normalizedTradeDateFilter,
    normalizedStartDateFilter,
    normalizedEndDateFilter,
    normalizedExchangeFilter,
    filters.tradeTime,
    filters.isin,
    filters.issuerDetails,
    filters.maturity,
    filters.minAmt,
    filters.maxAmt,
    filters.minPrice,
    filters.maxPrice,
    filters.yield,
    filters.status,
    filters.dealType,
  ]);

  const fetchFromDatabase = useCallback(
    async (options = {}) => {
      const { allowEmptyFilters = false } = options;
      const {
        ratingGroup: ratingGroupParam,
        tradeDate: tradeDateInput,
        startDate: startDateInput,
        endDate: endDateInput,
        exchange: exchangeParam,
        tradeTime: tradeTimeInput,
        isin: isinInput,
        issuer: issuerInput,
        maturity: maturityInput,
        minAmt: minAmtInput,
        maxAmt: maxAmtInput,
        minPrice: minPriceInput,
        maxPrice: maxPriceInput,
        yieldText: yieldInput,
        status: statusInput,
        dealType: dealTypeInput,
      } = serverFilterSnapshot;

      const hasAnyFilter = [
        ratingGroupParam,
        tradeDateInput,
        startDateInput,
        endDateInput,
        exchangeParam,
        tradeTimeInput,
        isinInput,
        issuerInput,
        maturityInput,
        minAmtInput,
        maxAmtInput,
        minPriceInput,
        maxPriceInput,
        yieldInput,
        statusInput,
        dealTypeInput,
      ].some((value) => value !== '' && value !== null && value !== undefined);

      if (!allowEmptyFilters && !hasAnyFilter) {
        setUsingDatabase(false);
        setDbMeta({
          success: false,
          message: 'Set at least one filter before fetching from MongoDB.',
        });
        return;
      }

      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', String(DB_FETCH_LIMIT));
      if (ratingGroupParam) params.set('ratingGroup', ratingGroupParam);
      if (tradeDateInput) params.set('date', tradeDateInput);
      if (startDateInput) params.set('startDate', startDateInput);
      if (endDateInput) params.set('endDate', endDateInput);
      if (exchangeParam) params.set('exchange', exchangeParam);
      if (tradeTimeInput) params.set('tradeTime', tradeTimeInput);
      if (isinInput) params.set('isin', isinInput);
      if (issuerInput) params.set('issuer', issuerInput);
      if (maturityInput) params.set('maturity', maturityInput);
      if (minAmtInput) params.set('minAmt', minAmtInput);
      if (maxAmtInput) params.set('maxAmt', maxAmtInput);
      if (minPriceInput) params.set('minPrice', minPriceInput);
      if (maxPriceInput) params.set('maxPrice', maxPriceInput);
      if (yieldInput) params.set('yield', yieldInput);
      if (statusInput) params.set('status', statusInput);
      if (dealTypeInput) params.set('dealType', dealTypeInput);

      setBusy(true);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/trading/transactions?${params.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Server error: ${response.status}`);
        }

        const payload = await response.json();
        const mappedRows = (payload.data || []).map(mapTransactionToRow).filter(Boolean);
        sortRowsDescending(mappedRows);

        setRows(mappedRows);
        setCurrentPage(1);
        setUsingDatabase(true);
        setDbMeta({
          success: true,
          fetched: mappedRows.length,
          total: payload.total || mappedRows.length,
          summary: payload.summary || null,
          filtersApplied: payload.filtersApplied || {},
          availableRatings: payload.availableRatings || [],
        });
        setLastDbQuery({ ...serverFilterSnapshot });
      } catch (error) {
        console.error('Trading DB fetch error:', error);
        setRows([]);
        setUsingDatabase(true);
        setDbMeta({
          success: false,
          message: error.message || 'Failed to fetch trading data from MongoDB.',
        });
      } finally {
        setBusy(false);
      }
    },
    [serverFilterSnapshot]
  );
  const dbFiltersChanged = useMemo(() => {
    if (!usingDatabase || !lastDbQuery) return false;
    return Object.keys(serverFilterSnapshot).some((key) => {
      const previous = lastDbQuery[key] ?? '';
      const current = serverFilterSnapshot[key] ?? '';
      return previous !== current;
    });
  }, [usingDatabase, lastDbQuery, serverFilterSnapshot]);

  React.useEffect(() => {
    if (!usingDatabase) return;
    if (!lastDbQuery) return;
    if (!dbFiltersChanged) return;
    if (busy) return;
    const timer = setTimeout(() => {
      fetchFromDatabase({ allowEmptyFilters: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [usingDatabase, lastDbQuery, dbFiltersChanged, fetchFromDatabase, busy]);

  React.useEffect(() => {
    fetchFromDatabase({ allowEmptyFilters: true, initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRatingShortcut = useCallback((code) => {
    setFilters((prev) => {
      const current = String(prev.rating || '').trim().toUpperCase();
      if (!code) {
        return { ...prev, rating: '' };
      }
      const nextRating = current === code ? '' : code;
      return { ...prev, rating: nextRating };
    });
  }, []);

  const filteredRows = useMemo(() => {

    const startDateFilter = filters.startDate ? new Date(filters.startDate) : null;

    if (startDateFilter) startDateFilter.setHours(0, 0, 0, 0);

    const endDateFilter = filters.endDate ? new Date(filters.endDate) : null;

    if (endDateFilter) endDateFilter.setHours(23, 59, 59, 999);



    return rows.filter((row) => {

      if (filters.exchange && !row.Exchange.toLowerCase().includes(filters.exchange.toLowerCase())) return false;

      if (filters.tradeDate && !row["Trade Date"].includes(filters.tradeDate)) return false;

      if (filters.tradeTime && !row["Trade Time"].includes(filters.tradeTime)) return false;

      if (filters.isin && !row.ISIN.toLowerCase().includes(filters.isin.toLowerCase())) return false;

      if (filters.issuerDetails && !row["Issuer details"].toLowerCase().includes(filters.issuerDetails.toLowerCase())) return false;

      if (filters.maturity && !row.Maturity.includes(filters.maturity)) return false;



      if (startDateFilter || endDateFilter) {

        const rowDateObj = parseDmyToDate(row["Trade Date"]);

        if (!rowDateObj) return false;

        if (startDateFilter && rowDateObj < startDateFilter) return false;

        if (endDateFilter && rowDateObj > endDateFilter) return false;

      }



      const amt = row["Amount (Rs lacs)"];

      if (filters.minAmt && amt < parseFloat(filters.minAmt)) return false;

      if (filters.maxAmt && amt > parseFloat(filters.maxAmt)) return false;



      const price = row["Price (Rs)"];

      if (filters.minPrice && price < parseFloat(filters.minPrice)) return false;

      if (filters.maxPrice && price > parseFloat(filters.maxPrice)) return false;



      if (filters.yield && !row.Yield.toString().toLowerCase().includes(filters.yield.toLowerCase())) return false;

      if (filters.status && !row.Status.toLowerCase().includes(filters.status.toLowerCase())) return false;

      if (filters.dealType && !row["Deal Type"].toLowerCase().includes(filters.dealType.toLowerCase())) return false;

      if (filters.rating) {

        const needle = filters.rating.trim().toUpperCase();

        const tokensSource = Array.isArray(row.RatingParts) && row.RatingParts.length

          ? row.RatingParts

          : (row.Rating ? [row.Rating] : []);

        const ratingTokens = tokensSource

          .flatMap((token) => String(token).split(/[|,\s/]+/))

          .map((token) => token.replace(/[^A-Z+/-]/gi, "").toUpperCase())

          .filter(Boolean);

        const ratingMatches = ratingTokens.some((token) => token.startsWith(needle));

        if (!ratingMatches) return false;

      }



      return true;

    });

  }, [rows, filters]);

  const dateRangeSummary = useMemo(() => {
    if (!filters.startDate && !filters.endDate) return null;

    let totalAmount = 0;
    let weightedYieldNumerator = 0;
    let weightedYieldDenominator = 0;

    filteredRows.forEach((row) => {
      const amount = pickNumeric(
        row["Amount (Rs lacs)"],
        row.tradeAmountValue,
        row.tradeAmountRaw,
        row.raw?.tradeAmountValue,
        row.raw?.tradeAmount
      );

      const yieldVal = pickNumeric(
        row["Deal Yield"],
        row.Yield,
        row.yieldValue,
        row.raw?.yield,
        row.raw?.yieldValue
      );

      if (amount !== null && amount > 0 && yieldVal !== null) {
        totalAmount += amount;
        weightedYieldNumerator += yieldVal * amount;
        weightedYieldDenominator += amount;
      }
    });

    const formatRangeDate = (value) => {
      if (!value) return 'N/A';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleDateString('en-GB');
    };

    return {
      startLabel: formatRangeDate(filters.startDate),
      endLabel: formatRangeDate(filters.endDate),
      tradeCount: filteredRows.length,
      totalAmount,
      avgYield: weightedYieldDenominator > 0 ? weightedYieldNumerator / weightedYieldDenominator : null,
    };
  }, [filteredRows, filters.startDate, filters.endDate]);

  const hasActiveFilters = useMemo(
    () => Object.entries(filters).some(([key, value]) => value !== FILTER_DEFAULTS[key]),
    [filters]
  );

  useEffect(() => {

    if (!hasActiveFilters) {

      setShowAggregated(false);

    }

  }, [hasActiveFilters]);


  useEffect(() => {
    if (showAggregated) {
      setShowAggregated(false);
    }
  }, [filtersSignature]);


  useEffect(() => {

    setBucketPageMap({});

  }, [filtersSignature, filteredRows.length, showAggregated, summarySearch]);



  const maxRatingColumns = useMemo(() => {
    const maxParts = rows.reduce((max, row) => {
      const count = Array.isArray(row.RatingParts) ? row.RatingParts.length : 0;
      return count > max ? count : max;
    }, 0);
    return Math.max(1, maxParts);
  }, [rows]);

  useLayoutEffect(() => {
    const updateStickyOffsets = () => {
      if (!headerRowRef.current) return;
      const headerHeight = headerRowRef.current.getBoundingClientRect().height;
      setFilterTop(`${headerHeight}px`);
    };
    updateStickyOffsets();
    window.addEventListener('resize', updateStickyOffsets);
    return () => window.removeEventListener('resize', updateStickyOffsets);
  }, [maxRatingColumns]);

  const ratingSummaries = useMemo(() => {
    if (!showAggregated) return [];
    if (filteredRows.length === 0) return [];

    const ratingBucketMap = new Map();

    filteredRows.forEach((row) => {
      const rawRatingLabel = (row.RatingParts && row.RatingParts.length ? row.RatingParts[0] : row.Rating || 'Unrated').trim() || 'Unrated';
      const ratingLabel = normalizeRatingGroup(rawRatingLabel);
      const amount = pickNumeric(
        row['Amount (Rs lacs)'],
        row.tradeAmountValue,
        row.tradeAmountRaw,
        row.raw?.tradeAmountValue,
        row.raw?.tradeAmount
      );

      const yieldValue = pickNumeric(
        row['Deal Yield'],
        row.Yield,
        row.yieldValue,
        row.raw?.yield,
        row.raw?.yieldValue
      );

      if (amount === null || amount <= 0) {
        return;
      }

      const bucket =
        AMOUNT_BUCKETS.find((b) => amount >= b.min && amount < b.max) || AMOUNT_BUCKETS[AMOUNT_BUCKETS.length - 1];

      let ratingEntry = ratingBucketMap.get(ratingLabel);
      if (!ratingEntry) {
        ratingEntry = new Map();
        ratingBucketMap.set(ratingLabel, ratingEntry);
      }

      let bucketEntry = ratingEntry.get(bucket.key);
      if (!bucketEntry) {
        bucketEntry = new Map();
        ratingEntry.set(bucket.key, bucketEntry);
      }

      const issuer = (row['Issuer details'] || '').trim() || 'Unknown Issuer';
      const isin = row.ISIN || '-';
      const maturity = row.Maturity || '-';
      const compositeKey = `${isin}|${issuer}|${maturity}`;

      let summary = bucketEntry.get(compositeKey);
      if (!summary) {
        summary = {
          issuer,
          isin,
          maturity,
          tradeCount: 0,
          sumAmount: 0,
          weightedNumerator: 0,
          weightedDenominator: 0,
          brokerYtmSet: new Set(),
        };
        bucketEntry.set(compositeKey, summary);
      }

      summary.tradeCount += 1;
      summary.sumAmount += amount;
      if (yieldValue !== null) {
        summary.weightedNumerator += yieldValue * amount;
        summary.weightedDenominator += amount;
      }

      const brokerLabel = [row['Deal Type'], row.Yield].filter(Boolean).join(' / ');
      if (brokerLabel) {
        summary.brokerYtmSet.add(brokerLabel);
      }
    });

    const results = [];
    for (const [rating, bucketMap] of ratingBucketMap.entries()) {
      const bucketSummaries = AMOUNT_BUCKETS.map((bucketDef) => {
        const rowsMap = bucketMap.get(bucketDef.key);
        const rows = rowsMap
          ? Array.from(rowsMap.entries()).map(([rowKey, entry]) => ({
              rowKey,
              issuer: entry.issuer,
              isin: entry.isin,
              maturity: entry.maturity,
              tradeCount: entry.tradeCount,
              sumAmount: entry.sumAmount,
              weightedAverage:
                entry.weightedDenominator > 0 ? entry.weightedNumerator / entry.weightedDenominator : null,
              brokerYtm:
                entry.brokerYtmSet.size > 0 ? Array.from(entry.brokerYtmSet).join(', ') : '-',
            }))
          : [];

        rows.sort((a, b) => {
          if (b.sumAmount !== a.sumAmount) {
            return b.sumAmount - a.sumAmount;
          }
          const bWeighted = Number.isFinite(b.weightedAverage) ? b.weightedAverage : -Infinity;
          const aWeighted = Number.isFinite(a.weightedAverage) ? a.weightedAverage : -Infinity;
          return bWeighted - aWeighted;
        });

        return { ...bucketDef, rows };
      });

      if (bucketSummaries.some((bucket) => bucket.rows.length > 0)) {
        results.push({ rating, buckets: bucketSummaries });
      }
    }

    results.sort((a, b) => a.rating.localeCompare(b.rating));
    return results;
  }, [filteredRows, showAggregated]);

  const normalizedSummarySearch = summarySearch.trim().toLowerCase();

  const filteredRatingSummaries = useMemo(() => {
    if (!showAggregated) return [];
    if (!normalizedSummarySearch) return ratingSummaries;

    const uppercaseSearch = summarySearch.trim().toUpperCase();
    const enforceRatingMatch =
      uppercaseSearch.length > 0 &&
      uppercaseSearch.length <= 3 &&
      /^[A-Z+/\\-]+$/.test(uppercaseSearch);

    return ratingSummaries
      .map(({ rating, buckets }) => {
        const ratingUpper = rating.toUpperCase();
        const ratingMatches = uppercaseSearch.length > 0 && ratingUpper.startsWith(uppercaseSearch);

        if (enforceRatingMatch) {
          return ratingMatches ? { rating, buckets } : null;
        }

        const filteredBuckets = buckets.map((bucket) => {
          const rows = bucket.rows.filter((summary) => {
            const haystack = [
              ratingUpper,
              bucket.label,
              summary.issuer,
              summary.isin,
              summary.maturity,
              String(summary.tradeCount),
              summary.sumAmount.toFixed(2),
              Number.isFinite(summary.weightedAverage) ? summary.weightedAverage.toFixed(2) : '',
              summary.brokerYtm,
            ]
              .join(' ')
              .toLowerCase();

            return haystack.includes(normalizedSummarySearch);
          });

          return { ...bucket, rows };
        });

        const hasRowMatches = filteredBuckets.some((bucket) => bucket.rows.length > 0);
        const bucketLabelMatches = buckets.some((bucket) =>
          bucket.label.toLowerCase().includes(normalizedSummarySearch)
        );

        if (ratingMatches || hasRowMatches || bucketLabelMatches) {
          return { rating, buckets: filteredBuckets };
        }

        return null;
      })
      .filter(Boolean);
  }, [ratingSummaries, normalizedSummarySearch, summarySearch, showAggregated]);

  const ratingPages = Math.max(1, Math.ceil(filteredRatingSummaries.length / ratingsPerPage));
  const currentRatingPage = Math.min(ratingPage, ratingPages);
  const paginatedRatingSummaries = filteredRatingSummaries.slice(
    (currentRatingPage - 1) * ratingsPerPage,
    currentRatingPage * ratingsPerPage
  );

  const totalTradePages = useMemo(() => {
    if (filteredRows.length === 0) return 1;
    return Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  }, [filteredRows.length, rowsPerPage]);

  const currentTradePage = Math.min(currentPage, totalTradePages);
  const paginatedRows = useMemo(() => {
    if (filteredRows.length === 0) return [];
    const start = (currentTradePage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentTradePage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
    setRatingPage(1);
  }, [filtersSignature, filteredRows.length]);

  useEffect(() => {
    setRatingPage(1);
  }, [summarySearch, ratingsPerPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalTradePages));
  }, [totalTradePages]);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentTradePage, rowsPerPage]);

  const pageStartIndex = filteredRows.length === 0 ? 0 : (currentTradePage - 1) * rowsPerPage + 1;
  const pageEndIndex = filteredRows.length === 0
    ? 0
    : Math.min((currentTradePage - 1) * rowsPerPage + paginatedRows.length, filteredRows.length);

  return (
    <div className="tp-page min-h-screen bg-slate-50/80 px-3 py-6 sm:px-6 lg:px-10">
      <div className="tp-shell mx-auto max-w-[1600px] space-y-6 lg:space-y-8">
        {/* File Upload Section */}
        <section className="tp-card tp-upload-card flex flex-col gap-6 rounded-2xl border border-blue-100/70 bg-white p-5 shadow-xl sm:p-6 lg:p-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-3 text-2xl font-bold text-slate-800">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-600" aria-hidden="true">
                  ??
                </span>
                Upload Trading Files
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Upload BSE, NSE trade files and securities master list (.csv, .xlsx, .xls)
              </p>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div
                className={`tp-dropzone ${isDragging ? "tp-dropzone--active" : ""} relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-all duration-300 sm:px-8 lg:px-10 ${
                  isDragging
                    ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-inner lg:scale-[1.01]"
                    : "border-slate-300 bg-gradient-to-br from-slate-50 to-white hover:border-blue-400 hover:bg-gradient-to-br from-blue-100 via-blue-50 to-white/30"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input"
                />

                <input
                  type="file"
                  multiple
                  webkitdirectory="true"
                  directory="true"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                  id="folder-input"
                />

                <div className="flex flex-col items-center gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-600 shadow-sm" aria-hidden="true">?</span>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-gray-800">
                      Drag & drop files or folders here
                    </p>
                    <p className="text-sm text-gray-500">
                      CSV, XLSX, and XLS formats are supported.
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:justify-center">
                    <label
                      htmlFor="file-input"
                      className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                    >
                      Select Files
                    </label>
                    <label
                      htmlFor="folder-input"
                      className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-emerald-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
                    >
                      Select Folder
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {pickedFiles.length > 0 ? (
                <div className="tp-card tp-queue-card flex h-full flex-col gap-4 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {pickedFiles.length}
                      </span>
                      Upload Queue
                    </h4>
                    <button
                      onClick={clearFiles}
                      type="button"
                      className="tp-btn tp-btn--ghost inline-flex items-center gap-2 rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-600 transition-all duration-200 hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                    >
                      Clear All
                    </button>
                  </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1 tp-scroll">
                    {pickedFiles.map((f, i) => {
                      const badgeLabel = getFileBadgeLabel(f.name);
                      return (
                        <div
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-3 rounded-lg border border-blue-100 bg-gradient-to-br from-blue-100 via-blue-50 to-white/60 p-3 shadow-sm transition-all duration-200 hover:border-blue-200"
                        >
                          <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold uppercase text-blue-600 ring-1 ring-inset ring-blue-200">
                            {badgeLabel}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{f.name}</p>
                            <p className="text-xs font-medium text-slate-500">{(f.size / 1024).toFixed(2)} KB</p>
                          </div>
                          <span className="flex-shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            Ready
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={buildPreview}
                    disabled={busy}
                    type="button"
                    className="tp-btn tp-btn--primary inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:from-blue-700 hover:via-blue-800 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-400 disabled:via-slate-500 disabled:to-slate-500"
                  >
                    {busy ? (
                      <>
                        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                        <span>Building Preview...</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">?</span>
                        <span>Build Preview</span>
                      </>
                  )}
                </button>
              </div>
            ) : (
                <div className="tp-empty flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
                  <span className="text-4xl text-slate-300" aria-hidden="true">???</span>
                  <p className="text-sm font-medium text-slate-700">Upload queue is empty</p>
                  <p className="text-xs text-slate-400">
                    Add trade files to organise and review them here.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="tp-card tp-tips rounded-xl border border-blue-100 bg-gradient-to-br from-blue-100 via-blue-50 to-white/70 px-4 py-5 sm:px-6">
            <p className="text-sm font-semibold text-blue-900">Tips</p>
            <ul className="mt-3 grid gap-3 text-sm text-blue-900 sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ?
                </span>
                <span>Upload multiple Excel files at once.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ?
                </span>
                <span>Select an entire folder containing Excel files.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ?
                </span>
                <span>Drag & drop files directly from your file explorer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ?
                </span>
                <span>All sheets in each workbook will be processed.</span>
              </li>
            </ul>
          </div>
        </section>
        {(serverSyncing || serverSyncSummaries.length > 0 || serverSyncError) && (
          <section className="rounded-2xl border border-blue-100 bg-white/90 px-4 py-4 shadow-sm sm:px-6">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-800">MongoDB Sync Status</h4>
              {serverSyncing && (
                <span className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                  <span className="inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-gradient-to-br from-blue-100 via-blue-50 to-white0/70" />
                  Syncing?
                </span>
              )}
            </div>
            {serverSyncError && (
              <p className="mt-2 text-sm text-rose-600">{serverSyncError}</p>
            )}
            {serverSyncSummaries.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {serverSyncSummaries.map((entry, index) => {
                  const tone =
                    entry.status === 'error'
                      ? 'text-rose-600'
                      : entry.status === 'skipped'
                      ? 'text-amber-600'
                      : 'text-emerald-600';
                  return (
                    <li
                      key={`${entry.name}-${index}`}
                      className="flex flex-col gap-1 rounded-lg border border-blue-50 bg-gradient-to-br from-blue-100 via-blue-50 to-white/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium text-slate-800">{entry.name}</span>
                      <span className={`text-sm ${tone}`}>{entry.details}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!serverSyncing && serverSyncSummaries.length === 0 && !serverSyncError && (
              <p className="mt-2 text-sm text-slate-600">
                Upload files and build a preview to sync trades with MongoDB.
              </p>
            )}
          </section>
        )}
        {/* Results Table */}
        {(usingDatabase || rows.length > 0 || (dbMeta && dbMeta.success === false)) && (
          <section className="tp-card tp-results-card overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-xl">
            <header className="tp-results-header flex flex-col gap-4 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-4 py-5 text-white shadow-lg sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="flex flex-col gap-1">
                <h2 className="tp-results-title flex items-center gap-3 text-xl font-bold">
                  Trade Results
                </h2>
                {usingDatabase && dbMeta?.success && (
                  <span className="text-xs text-emerald-200">
                    Showing {dbMeta.fetched.toLocaleString()} of {dbMeta.total.toLocaleString()} stored trades.
                  </span>
                )}
                {dbMeta && dbMeta.success === false && (
                  <span className="text-xs text-amber-200">
                    {dbMeta.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 text-sm sm:items-end sm:text-right">
                <div className="rounded-lg bg-white/10 px-4 py-2 font-medium text-blue-50 backdrop-blur-sm">
                  {filteredRows.length === 0
                    ? 'No trades match the current filters'
                    : `Showing ${pageStartIndex.toLocaleString()} – ${pageEndIndex.toLocaleString()} of ${filteredRows.length.toLocaleString()} trades`}
                  {filteredRows.length < rows.length && ` (filtered from ${rows.length.toLocaleString()})`}
                </div>
                {usingDatabase && dbFiltersChanged && (
                  <div className="rounded-md bg-amber-500/25 px-3 py-1 text-xs font-semibold text-amber-100 shadow-sm">
                    Filters changed. Refresh from MongoDB to update.
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => fetchFromDatabase({ allowEmptyFilters: true })}
                  disabled={busy}
                  className="tp-btn inline-flex items-center justify-center rounded-md bg-white/85 px-4 py-2 text-sm font-semibold text-blue-700 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Refreshing..." : "Refresh from MongoDB"}
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="tp-btn tp-btn--outline inline-flex items-center justify-center rounded-md border border-white/70 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear Filters
                </button>
              </div>
            </header>
                        <div className="flex flex-col gap-4 border-b border-blue-100/60 bg-gradient-to-br from-blue-100 via-blue-50 to-white/40 px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                <label className="flex flex-col text-xs font-semibold text-blue-900 sm:text-sm">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1 rounded-md border border-blue-200 px-3 py-1 text-sm text-slate-700 focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </label>
                <label className="flex flex-col text-xs font-semibold text-blue-900 sm:text-sm">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="mt-1 rounded-md border border-blue-200 px-3 py-1 text-sm text-slate-700 focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchFromDatabase({ allowEmptyFilters: true })}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-60"
                    disabled={busy}
                  >
                    Apply Date Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))}
                    className="rounded-md border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
                    disabled={!filters.startDate && !filters.endDate}
                  >
                    Clear Range
                  </button>
                </div>
              </div>
              {dateRangeSummary && (
                <div className="flex flex-wrap items-center gap-4 text-sm text-blue-900">
                  <span><strong>From:</strong> {dateRangeSummary.startLabel}</span>
                  <span><strong>To:</strong> {dateRangeSummary.endLabel}</span>
                  <span><strong>Trades:</strong> {dateRangeSummary.tradeCount.toLocaleString()}</span>
                  <span><strong>Total Amount (Lacs):</strong> {dateRangeSummary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span><strong>Avg Yield:</strong> {dateRangeSummary.avgYield !== null ? `${dateRangeSummary.avgYield.toFixed(2)}%` : 'N/A'}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleShowAggregated}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-700 disabled:opacity-60"
                  disabled={!hasActiveFilters || filteredRows.length === 0 || showAggregated}
                >
                  Show Aggregated Summary
                </button>
                {showAggregated && (
                  <button
                    type="button"
                    onClick={handleHideAggregated}
                    className="rounded-md border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Hide Aggregated Summary
                  </button>
                )}
              </div>
            </div><div className="flex flex-wrap items-center gap-2 border-b border-blue-100/60 bg-gradient-to-br from-blue-100 via-blue-50 to-white/30 px-4 py-3 text-sm text-blue-900 sm:px-6 sm:text-base">
              <span className="font-semibold uppercase tracking-wide text-blue-700/80">
                Rating quick select:
              </span>
              {RATING_GROUP_OPTIONS.map((code) => {
                const isActive = activeRatingGroup === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleRatingShortcut(code)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition sm:text-sm ${
                      isActive
                        ? 'bg-blue-700 text-white shadow'
                        : 'bg-white/80 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleRatingShortcut('')}
                className="rounded-full px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 sm:text-sm"
              >
                Clear
              </button>
            </div>
            <div className="w-full overflow-x-auto">
              <div
                ref={tableScrollRef}
                className="tp-scroll max-h-[calc(100vh-320px)] overflow-y-auto"
              >
                <table className="tp-table min-w-[1200px] w-full table-auto border-collapse">
                <thead>
                  <tr
                    ref={headerRowRef}
                    className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 text-white shadow-md"
                  >
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Exchange
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Trade Date
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Trade Time
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      ISIN
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Issuer Details
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Maturity
                    </th>
                    <th className="px-3 py-3 text-right text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Amount (INR Lacs)
                    </th>
                    <th className="px-3 py-3 text-right text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Price (INR)
                    </th>
                    <th className="px-3 py-3 text-center text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Yield
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Status
                    </th>
                    <th className="px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 border-r border-slate-800">
                      Deal Type
                    </th>
                    {Array.from({ length: maxRatingColumns }).map((_, idx) => (
                      <th
                        key={`rating-header-${idx}`}
                        className={`px-3 py-3 text-left text-base font-semibold uppercase tracking-[0.18em] text-white border-b border-slate-700 ${idx === maxRatingColumns - 1 ? "" : "border-r border-slate-800"}`}
                      >
                        {maxRatingColumns > 1 ? `Rating ${idx + 1}` : "Rating"}
                      </th>
                    ))}
                  </tr>
                  <tr
                    className="sticky z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200"
                    style={{ top: filterTop }}
                  >
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.exchange}
                        onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.tradeDate}
                        onChange={(e) => setFilters({ ...filters, tradeDate: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.tradeTime}
                        onChange={(e) => setFilters({ ...filters, tradeTime: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.isin}
                        onChange={(e) => setFilters({ ...filters, isin: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.issuerDetails}
                        onChange={(e) => setFilters({ ...filters, issuerDetails: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.maturity}
                        onChange={(e) => setFilters({ ...filters, maturity: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.minAmt}
                        onChange={(e) => setFilters({ ...filters, minAmt: e.target.value })}
                        placeholder="Min..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.minPrice}
                        onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                        placeholder="Min..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.yield}
                        onChange={(e) => setFilters({ ...filters, yield: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 border-b border-slate-200 border-r border-slate-200">
                      <input
                        type="text"
                        value={filters.dealType}
                        onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </th>
                    {Array.from({ length: maxRatingColumns }).map((_, idx) => (
                      <th
                        key={`rating-filter-${idx}`}
                        className={`px-3 py-2 border-b border-slate-200 ${idx === maxRatingColumns - 1 ? "" : "border-r border-gray-200"}`}
                      >
                        {idx === 0 ? (
                          <input
                            type="text"
                            value={filters.rating}
                            onChange={(e) => setFilters({ ...filters, rating: e.target.value })}
                            placeholder="Filter..."
                            className="tp-input w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="bg-white text-slate-700">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11 + maxRatingColumns} className="px-6 py-12 text-center">
                        <div className="text-slate-500">
                          <p className="mb-2 text-lg font-semibold">No transactions match your filters</p>
                          <p className="text-sm">Try adjusting or clearing the filters above</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, idx) => {
                      const absoluteIndex = (currentTradePage - 1) * rowsPerPage + idx;
                      const zebra = absoluteIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                      const rowKey =
                        row.rowKey ??
                        `${row.ISIN || 'isin'}-${row["Trade Time"] || absoluteIndex}-${absoluteIndex}`;

                      const statusLabel = String(row.Status || 'Pending');
                      const statusClass = statusLabel.toLowerCase().includes('success') ||
                        statusLabel.toLowerCase().includes('settled')
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : statusLabel.toLowerCase().includes('pending')
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-slate-300 bg-slate-100 text-slate-700';

                      return (
                        <tr
                          key={rowKey}
                          className={`border-b border-slate-200 transition-colors hover:bg-sky-50 ${zebra}`}
                        >
                          <td className="px-3 py-3 text-sm border-r border-slate-200">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                row.Exchange === 'NSE'
                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-100 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {row.Exchange || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-slate-800 border-r border-slate-200">
                            {row["Trade Date"] || '-'}
                          </td>
                          <td className="px-3 py-3 text-sm font-mono text-slate-600 border-r border-slate-200">
                            {row["Trade Time"] || '-'}
                          </td>
                          <td
                            className="px-3 py-3 tp-isin bg-slate-50 font-mono text-sm text-slate-900 border-r border-slate-200 whitespace-normal break-words"
                            title={row.ISIN}
                          >
                            {row.ISIN || '-'}
                          </td>
                          <td
                            className="px-3 py-3 text-sm font-medium text-slate-700 border-r border-slate-200 whitespace-normal break-words"
                            title={row["Issuer details"]}
                          >
                            {row["Issuer details"] || '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700 border-r border-slate-200">
                            {row.Maturity || '-'}
                          </td>
                          <td className="px-3 py-3 text-sm font-bold text-indigo-700 text-right border-r border-slate-200">
                            {Number(row["Amount (Rs lacs)"] ?? 0).toFixed(4)}
                          </td>
                          <td className="px-3 py-3 text-sm font-bold text-emerald-700 text-right border-r border-slate-200">
                            Rs {Number(row["Price (Rs)"] ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-center text-sky-700 border-r border-slate-200">
                            {row.Yield || '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700 border-r border-slate-200">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm border-r border-slate-200">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                                (row["Deal Type"] || '').toUpperCase().includes('DIRECT')
                                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                  : 'bg-orange-100 text-orange-700 border border-orange-200'
                              }`}
                            >
                              {row["Deal Type"] || '-'}
                            </span>
                          </td>
                          {Array.from({ length: maxRatingColumns }).map((_, ratingIdx) => {
                            const ratingValue = row.RatingParts?.[ratingIdx] || "";
                            return (
                              <td
                                key={`rating-${rowKey}-${ratingIdx}`}
                                className={`px-3 py-3 text-xs font-semibold text-slate-700 whitespace-normal break-words${
                                  ratingIdx === maxRatingColumns - 1 ? "" : " border-r border-slate-200"
                                }`}
                                title={ratingValue || undefined}
                              >
                                {ratingValue || "-"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
            <div className="tp-load-controls bg-slate-50 px-6 py-4 border-t border-slate-200">
              <div className="tp-load-controls__row">
                <span className="tp-load-controls__status">
                  {filteredRows.length === 0
                    ? 'No trades to display'
                    : `Showing ${pageStartIndex.toLocaleString()} – ${pageEndIndex.toLocaleString()} of ${filteredRows.length.toLocaleString()} trades`}
                </span>
                <label className="tp-load-controls__batch">
                  <span>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setRowsPerPage(next);
                      setCurrentPage(1);
                    }}
                    className="tp-input px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
              </div>
              {filteredRows.length > 0 && (
                <div className="tp-load-controls__pager">
                  <button
                    type="button"
                    className="tp-btn px-3 py-1.5 text-sm border border-indigo-200 bg-white text-indigo-600 shadow-sm hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentTradePage === 1}
                  >
                    Prev
                  </button>
                  <span className="tp-load-controls__page-indicator text-sm font-semibold text-slate-700">
                    Page {currentTradePage} of {totalTradePages}
                  </span>
                  <button
                    type="button"
                    className="tp-btn px-3 py-1.5 text-sm border border-indigo-200 bg-white text-indigo-600 shadow-sm hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400"
                    onClick={() => setCurrentPage((prev) => Math.min(totalTradePages, prev + 1))}
                    disabled={currentTradePage === totalTradePages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {showAggregated && (
              <div className="tp-card tp-aggregated px-6 py-6 bg-slate-50 border-t border-gray-200">
                <div className="tp-aggregated-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Aggregated View</h3>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={summarySearch}
                      onChange={(e) => setSummarySearch(e.target.value)}
                      placeholder="Search aggregated results..."
                      className="tp-input flex-1 sm:flex-initial min-w-[200px] px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {summarySearch && (
                      <button
                        type="button"
                        onClick={() => setSummarySearch('')}
                        className="tp-btn tp-btn--outline px-3 py-2 text-sm font-medium text-gray-700 border border-slate-300 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {filteredRatingSummaries.length === 0 ? (
                  <div className="px-4 py-6 bg-white border border-dashed border-gray-300 text-center text-gray-500 rounded-lg">
                    {summarySearch
                      ? `No aggregated results match "${summarySearch}".`
                      : 'No aggregated data available.'}
                  </div>
                ) : (
                  <div className="tp-summary-grid">
                    {paginatedRatingSummaries.map(({ rating, buckets }) => {
                      const ratingBannerClass = getRatingBannerClass(rating);
                      return (
                        <div key={rating} className="tp-summary-card bg-gradient-to-br from-slate-50 via-white to-slate-100 border border-slate-200 rounded-2xl shadow-lg overflow-hidden backdrop-blur">
                          <div className={`px-6 py-5 text-2xl font-extrabold tracking-wide uppercase shadow-md ${ratingBannerClass}`}>
                            {rating}
                          </div>
                          <div className="tp-summary-bucket-list">
                            {buckets.map(({ key, label, rows }) => {
                              const bucketHeaderColor =
                                BUCKET_HEADER_COLORS[key] || BUCKET_HEADER_COLORS.default;
                              const bucketKeyId = `${rating}-${key}`;
                              const totalBucketPages = Math.max(1, Math.ceil(rows.length / AGGREGATE_ROWS_PER_PAGE));
                              const currentBucketPage = bucketPageMap[bucketKeyId] || 1;
                              const pagedRows = rows.slice((currentBucketPage - 1) * AGGREGATE_ROWS_PER_PAGE, currentBucketPage * AGGREGATE_ROWS_PER_PAGE);
                              return (
                                <div key={`${rating}-${key}`} className="tp-summary-bucket">
                                  <div
                                    className="tp-summary-bucket__header"
                                    style={{ backgroundColor: bucketHeaderColor }}
                                  >
                                    <span className="tp-summary-bucket__dot" aria-hidden="true" />
                                    <span className="tp-summary-bucket__title">{label}</span>
                                  </div>
                                  <div className="tp-summary-bucket__content">
                                    <SummaryTable rows={pagedRows} />
                                    {totalBucketPages > 1 && (
                                      <div className="tp-summary-bucket__pagination">
                                        <span>Page {currentBucketPage} of {totalBucketPages}</span>
                                        <div className="tp-summary-bucket__pager">
                                          <button
                                            type="button"
                                            onClick={() => handleBucketPageChange(bucketKeyId, currentBucketPage - 1, totalBucketPages)}
                                            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
                                            disabled={currentBucketPage === 1}
                                          >
                                            Prev
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleBucketPageChange(bucketKeyId, currentBucketPage + 1, totalBucketPages)}
                                            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
                                            disabled={currentBucketPage === totalBucketPages}
                                          >
                                            Next
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {filteredRatingSummaries.length > 0 && (
                  <div className="tp-rating-controls">
                    <div className="tp-rating-controls__row">
                      <span className="tp-rating-controls__status">
                        Rating set {currentRatingPage} of {ratingPages}
                      </span>
                      <label className="tp-rating-controls__size">
                        <span>Ratings per page:</span>
                        <select
                          value={ratingsPerPage}
                          onChange={(e) => setRatingsPerPage(Number(e.target.value))}
                          className="tp-input px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                    </div>
                    <div className="tp-rating-controls__pager">
                      <button
                        type="button"
                        className="tp-btn tp-btn--outline"
                        onClick={() => setRatingPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentRatingPage === 1}
                      >
                        Prev
                      </button>
                      <span className="tp-rating-controls__page-indicator">
                        {currentRatingPage} / {ratingPages}
                      </span>
                      <button
                        type="button"
                        className="tp-btn tp-btn--outline"
                        onClick={() => setRatingPage((prev) => Math.min(ratingPages, prev + 1))}
                        disabled={currentRatingPage === ratingPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* This closing section fixes the unbalanced JSX (was missing) */}
        {/* End of Results Table container */}

        {rows.length === 0 && !busy && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <p className="text-lg">
              {usingDatabase ? 'No trades matched the current filters.' : 'No preview data yet.'}
            </p>
            <p className="text-sm mt-2">
              {usingDatabase
                ? 'Adjust the rating or trade date filters and refresh from MongoDB.'
                : 'Upload BSE, NSE, and Securities master files to begin.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


