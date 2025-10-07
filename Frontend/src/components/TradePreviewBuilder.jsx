import React, { useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

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
  rating: ""
};

const AMOUNT_BUCKETS = [
  { key: 'UNDER_10', label: 'Below 10 Lac', min: 0, max: 10 },
  { key: 'BETWEEN_10_50', label: 'Between 10 Lac to 50 Lac', min: 10, max: 50 },
  { key: 'BETWEEN_50_100', label: 'Between 50 Lac to 100 Lac', min: 50, max: 100 },
  { key: 'ABOVE_100', label: 'Above 100 Lac', min: 100, max: Infinity },
];

// ========== UTILITY FUNCTIONS ==========

const norm = (str) => String(str || "").toLowerCase().replace(/\s+/g, "");

const firstCol = (headers, patterns) => {
  const normHeaders = headers.map(norm);
  for (const pattern of patterns) {
    const idx = normHeaders.findIndex((h) => h.includes(norm(pattern)));
    if (idx !== -1) return idx;
  }
  return -1;
};

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const pad2 = (value) => String(value).padStart(2, "0");

const coerceNumber = (val) => {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
  }
  return null;
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
  return `${y}-${m}-${d}`;
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

  const dmyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmyMatch) {
    let [, day, month, year] = dmyMatch;
    if (year.length === 2) {
      const yearInt = parseInt(year, 10);
      year = String((yearInt >= 70 ? 1900 : 2000) + yearInt);
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
    .replace(/,/g, '')
    .replace(/[^0-9.+-]/g, '')
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
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

// Test harness removed for production

// ========== MAIN COMPONENT ==========
export default function TradePreviewBuilder() {
  const [pickedFiles, setPickedFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(() => ({ ...FILTER_DEFAULTS }));
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const headerRowRef = useRef(null);
  const [filterTop, setFilterTop] = useState('0px');
  const [summarySearch, setSummarySearch] = useState('');

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

  const clearFiles = () => {
    setPickedFiles([]);
    setRows([]);
    resetFilters();
  };

  const resetFilters = useCallback(() => {
    setFilters({ ...FILTER_DEFAULTS });
    setCurrentPage(1);
  }, [setFilters, setCurrentPage]);

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
          const dateIdx = firstCol(headers, ["date", "trade date"]);
          const timeIdx = firstCol(headers, ["trade time", "time", "timestamp"]);
          const maturityIdx = firstCol(headers, ["maturity date", "maturity"]);
          const dealSizeIdx = firstCol(headers, ["deal size", "trade amount (rs)", "amount"]);
          const priceIdx = firstCol(headers, ["price", "trade price"]);
          const yieldIdx = firstCol(headers, ["yield", "traded yield"]);
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

            tradeRows.push({
              Exchange: exchangeLabel,
              "Trade Date": toDate(row[dateIdx]),
              "Trade Time": toTime(row[timeIdx]),
              ISIN: isin,
              "Issuer details": "",
              Maturity: toDate(row[maturityIdx]),
              "Amount (Rs lacs)": amountLacs,
              "Price (Rs)": parseFloat(row[priceIdx]) || 0,
              Yield: String(row[yieldIdx] || "").trim(),
              Status: String(row[statusIdx] || "").trim(),
              "Deal Type": dealType,
              Rating: "",
            });
          }
        } else if (effectiveExchange === "BSE") {
          const isinIdx = firstCol(headers, ["isin"]);
          const dateIdx = firstCol(headers, ["deal date", "trade date", "date"]);
          const timeIdx = firstCol(headers, ["trade time", "time"]);
          const maturityIdx = firstCol(headers, ["maturity date", "maturity"]);
          const amountIdx = firstCol(headers, ["trade amount (in rs lacs)", "amount (rs lacs)", "amount"]);
          const priceIdx = firstCol(headers, ["trade price (rs)", "price"]);
          const yieldIdx = firstCol(headers, ["traded yield (%)", "yield"]);
          const orderTypeIdx = firstCol(headers, ["order type", "type"]);
          const exchangeLabel = effectiveExchange || "BSE";

          for (const row of data) {
            const isin = String(row[isinIdx] || "").trim();
            if (!isin || !/^[A-Z0-9]{12}$/.test(isin)) continue;

            const amountLacs = parseFloat(row[amountIdx]) || 0;
            const orderType = String(row[orderTypeIdx] || "").toUpperCase();

            tradeRows.push({
              Exchange: exchangeLabel,
              "Trade Date": toDate(row[dateIdx]),
              "Trade Time": toTime(row[timeIdx]),
              ISIN: isin,
              "Issuer details": "",
              Maturity: toDate(row[maturityIdx]),
              "Amount (Rs lacs)": amountLacs,
              "Price (Rs)": parseFloat(row[priceIdx]) || 0,
              Yield: String(row[yieldIdx] || "").trim(),
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
      tradeRows.sort((a, b) => {
        if (a["Trade Date"] !== b["Trade Date"]) {
          return b["Trade Date"].localeCompare(a["Trade Date"]);
        }
        if (a.Exchange !== b.Exchange) {
          return a.Exchange.localeCompare(b.Exchange);
        }
        return a.ISIN.localeCompare(b.ISIN);
      });

      setRows(tradeRows);
    } catch (err) {
      console.error("Build preview error:", err);
      alert("Error building preview: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Exchange filter
      if (filters.exchange && !row.Exchange.toLowerCase().includes(filters.exchange.toLowerCase())) {
        return false;
      }
      
      // Trade Date filter
      if (filters.tradeDate && !row["Trade Date"].includes(filters.tradeDate)) {
        return false;
      }
      
      // Trade Time filter
      if (filters.tradeTime && !row["Trade Time"].includes(filters.tradeTime)) {
        return false;
      }
      
      // ISIN filter
      if (filters.isin && !row.ISIN.toLowerCase().includes(filters.isin.toLowerCase())) {
        return false;
      }
      
      // Issuer details filter
      if (filters.issuerDetails && !row["Issuer details"].toLowerCase().includes(filters.issuerDetails.toLowerCase())) {
        return false;
      }
      
      // Maturity filter
      if (filters.maturity && !row.Maturity.includes(filters.maturity)) {
        return false;
      }
      
      // Amount range filter
      const amt = row["Amount (Rs lacs)"];
      if (filters.minAmt && amt < parseFloat(filters.minAmt)) return false;
      if (filters.maxAmt && amt > parseFloat(filters.maxAmt)) return false;
      
      // Price range filter
      const price = row["Price (Rs)"];
      if (filters.minPrice && price < parseFloat(filters.minPrice)) return false;
      if (filters.maxPrice && price > parseFloat(filters.maxPrice)) return false;
      
      // Yield filter
      if (filters.yield && !row.Yield.toString().toLowerCase().includes(filters.yield.toLowerCase())) {
        return false;
      }
      
      // Status filter
      if (filters.status && !row.Status.toLowerCase().includes(filters.status.toLowerCase())) {
        return false;
      }
      
      // Deal Type filter
      if (filters.dealType && !row["Deal Type"].toLowerCase().includes(filters.dealType.toLowerCase())) {
        return false;
      }
      
      // Rating filter
      if (filters.rating && !row.Rating.toLowerCase().includes(filters.rating.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [rows, filters]);

  const hasActiveFilters = useMemo(
    () => Object.entries(filters).some(([key, value]) => value !== FILTER_DEFAULTS[key]),
    [filters]
  );

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
    if (filteredRows.length === 0) return [];

    const ratingBucketMap = new Map();

    filteredRows.forEach((row) => {
      const ratingLabel = (row.RatingParts && row.RatingParts.length ? row.RatingParts[0] : row.Rating || 'Unrated').trim() || 'Unrated';
      const amountValue = toNumeric(row['Amount (Rs lacs)']);
      const amount = Number.isFinite(amountValue) ? amountValue : 0;
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
          brokerYtmSet: new Set(),
        };
        bucketEntry.set(compositeKey, summary);
      }

      summary.tradeCount += 1;
      summary.sumAmount += amount;

      const yieldValue = toNumeric(row.Yield);
      if (yieldValue !== null) {
        summary.weightedNumerator += yieldValue * amount;
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
          ? Array.from(rowsMap.values()).map((entry) => ({
              issuer: entry.issuer,
              isin: entry.isin,
              maturity: entry.maturity,
              tradeCount: entry.tradeCount,
              sumAmount: entry.sumAmount,
              weightedAverage:
                entry.sumAmount > 0 ? entry.weightedNumerator / entry.sumAmount : null,
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
  }, [filteredRows]);

  const normalizedSummarySearch = summarySearch.trim().toLowerCase();

  const filteredRatingSummaries = useMemo(() => {
    if (!normalizedSummarySearch) return ratingSummaries;

    return ratingSummaries
      .map(({ rating, buckets }) => {
        const filteredBuckets = buckets.map((bucket) => {
          const rows = bucket.rows.filter((summary) => {
            const haystack = [
              rating,
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

        const hasMatches = filteredBuckets.some((bucket) => bucket.rows.length > 0);
        return hasMatches ? { rating, buckets: filteredBuckets } : null;
      })
      .filter(Boolean);
  }, [ratingSummaries, normalizedSummarySearch]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-4 md:p-6">
      <div className="max-w-[1920px] mx-auto">
        {/* File Upload Section */}
        <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-6 mb-6">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-gray-800">📊 Upload Trading Files</h3>
            <p className="text-sm text-gray-600">
              Upload BSE, NSE trade files and securities master list (.csv, .xlsx, .xls)
            </p>
          </div>
          
          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
              isDragging 
                ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-inner scale-[1.01]" 
                : "border-gray-300 bg-gradient-to-br from-gray-50 to-slate-50 hover:border-blue-400 hover:bg-blue-50/30"
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
            
            <div className="space-y-4">
              {/* Text Content */}
              <p className="text-base font-medium text-gray-700 mb-2">
                📎 Drag & drop files or folders here
              </p>
              <p className="text-sm text-gray-500 mb-4">or</p>
              
              {/* Buttons */}
              <div className="flex justify-center gap-3">
                <label 
                  htmlFor="file-input"
                  className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  📁 Select Files
                </label>
                <label 
                  htmlFor="folder-input"
                  className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  📂 Select Folder
                </label>
              </div>
            </div>
          </div>

          {pickedFiles.length > 0 && (
            <div className="mt-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 rounded-xl p-5 border border-blue-200">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <span className="bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold">
                    {pickedFiles.length}
                  </span>
                  Upload Queue
                </h4>
                <button
                  onClick={clearFiles}
                  className="px-4 py-2 text-sm font-semibold text-red-600 hover:text-white hover:bg-red-600 border-2 border-red-600 rounded-lg transition-all duration-200 transform hover:scale-105"
                >
                  🗑️ Clear All
                </button>
              </div>
              
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {pickedFiles.map((f, i) => (
                  <div 
                    key={i} 
                    className="flex items-center gap-3 bg-white p-3.5 rounded-lg border border-blue-200 shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex-shrink-0 text-3xl">
                      {f.name.endsWith('.csv') ? '📄' : '📊'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                      <p className="text-xs text-gray-500 font-medium">{(f.size / 1024).toFixed(2)} KB</p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                        ✓ Ready
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={buildPreview}
                disabled={busy}
                className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-blue-700 hover:via-blue-800 hover:to-indigo-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-3">
                    <span className="inline-block animate-spin text-2xl">⏳</span>
                    <span className="font-bold">Building Preview...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    🚀 Build Preview
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">💡 Tips:</p>
            <ul className="text-sm text-blue-800 space-y-1 ml-4">
              <li>✅ Upload multiple Excel files at once</li>
              <li>✅ Select an entire folder containing Excel files</li>
              <li>✅ Drag & drop files from your file explorer</li>
              <li>✅ All sheets in each file will be processed automatically</li>
            </ul>
          </div>
        </div>

        {/* Results Table */}
        {rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-blue-100">
            <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-4 flex justify-between items-center flex-wrap gap-2 shadow-lg">
              <h2 className="text-xl font-bold text-white">
                📊 Trade Results
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-sm text-blue-100 font-medium bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredRows.length)} of {filteredRows.length} {filteredRows.length < rows.length && `(filtered from ${rows.length})`}
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="px-3 py-1.5 text-sm font-semibold text-white border border-white rounded-md bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Clear Filters
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-w-full w-full" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr
                    ref={headerRowRef}
                    className="bg-gray-100 sticky top-0 z-20 shadow-sm"
                  >
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Exchange
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Trade Date
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Trade Time
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      ISIN
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Issuer Details
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Maturity
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Amount (₹ lacs)
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Price (₹)
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Yield
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Status
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Deal Type
                    </th>
                    {Array.from({ length: maxRatingColumns }).map((_, idx) => (
                      <th
                        key={`rating-header-${idx}`}
                        className={`px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 ${idx === maxRatingColumns - 1 ? "" : "border-r border-gray-200"}`}
                      >
                        {maxRatingColumns > 1 ? `Rating ${idx + 1}` : "Rating"}
                      </th>
                    ))}
                  </tr>
                  <tr
                    className="bg-white sticky z-10"
                    style={{ top: filterTop }}
                  >
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.exchange}
                        onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.tradeDate}
                        onChange={(e) => setFilters({ ...filters, tradeDate: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.tradeTime}
                        onChange={(e) => setFilters({ ...filters, tradeTime: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.isin}
                        onChange={(e) => setFilters({ ...filters, isin: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.issuerDetails}
                        onChange={(e) => setFilters({ ...filters, issuerDetails: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.maturity}
                        onChange={(e) => setFilters({ ...filters, maturity: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.minAmt}
                        onChange={(e) => setFilters({ ...filters, minAmt: e.target.value })}
                        placeholder="Min..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.minPrice}
                        onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                        placeholder="Min..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.yield}
                        onChange={(e) => setFilters({ ...filters, yield: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.dealType}
                        onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}
                        placeholder="Filter..."
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    {Array.from({ length: maxRatingColumns }).map((_, idx) => (
                      <th
                        key={`rating-filter-${idx}`}
                        className={`px-2 py-1.5 border-b-2 border-gray-300 ${idx === maxRatingColumns - 1 ? "" : "border-r border-gray-200"}`}
                      >
                        {idx === 0 ? (
                          <input
                            type="text"
                            value={filters.rating}
                            onChange={(e) => setFilters({ ...filters, rating: e.target.value })}
                            placeholder="Filter..."
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="bg-white">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11 + maxRatingColumns} className="px-6 py-12 text-center">
                        <div className="text-gray-500">
                          <p className="text-lg font-semibold mb-2">No transactions match your filters</p>
                          <p className="text-sm">Try adjusting or clearing the filters above</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, i) => (
                    <tr 
                      key={i} 
                      className={`border-b border-gray-200 transition-colors hover:bg-blue-50 ${
                        i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-sm border-r border-gray-200">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          row.Exchange === 'NSE' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {row.Exchange}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-800 border-r border-gray-200 font-medium">
                        {row["Trade Date"]}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 border-r border-gray-200 font-mono">
                        {row["Trade Time"]}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-900 font-mono border-r border-gray-200 whitespace-normal break-words bg-gray-50" title={row.ISIN}>
                        {row.ISIN}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 border-r border-gray-200 whitespace-normal break-words font-medium" title={row["Issuer details"]}>
                        {row["Issuer details"]}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 border-r border-gray-200">
                        {row.Maturity}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-blue-900 text-right font-bold border-r border-gray-200">
                        {row["Amount (Rs lacs)"].toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-green-900 text-right font-bold border-r border-gray-200">
                        ₹{row["Price (Rs)"].toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 border-r border-gray-200 text-center">
                        {row.Yield}
                      </td>
                      <td className="px-3 py-2.5 text-sm border-r border-gray-200">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          row.Status.toLowerCase().includes('success') || row.Status.toLowerCase().includes('settled')
                            ? 'bg-green-100 text-green-800 border border-green-300'
                            : row.Status.toLowerCase().includes('pending')
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            : 'bg-gray-100 text-gray-700 border border-gray-300'
                        }`}>
                          {row.Status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm border-r border-gray-200">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          row["Deal Type"].toUpperCase().includes('DIRECT')
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-orange-100 text-orange-800 border border-orange-300'
                        }`}>
                          {row["Deal Type"]}
                        </span>
                      </td>
                      {Array.from({ length: maxRatingColumns }).map((_, ratingIdx) => {
                        const ratingValue = row.RatingParts?.[ratingIdx] || "";
                        return (
                          <td
                            key={`rating-${i}-${ratingIdx}`}
                            className={`px-3 py-2.5 text-xs text-gray-700 whitespace-normal break-words font-semibold${ratingIdx === maxRatingColumns - 1 ? "" : " border-r border-gray-200"}`}
                            title={ratingValue || undefined}
                          >
                            {ratingValue || "-"}
                          </td>
                        );
                      })}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  {/* Items per page */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 font-medium">Rows per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>

                  {/* Page info and controls */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-700">
                      Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                    </span>
                    
                    <div className="flex gap-1">
                      {/* First page */}
                      <button
                        onClick={() => goToPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="First page"
                      >
                        ««
                      </button>
                      
                      {/* Previous page */}
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Previous page"
                      >
                        ‹
                      </button>
                      
                      {/* Page numbers */}
                      {(() => {
                        const pages = [];
                        const maxVisible = 5;
                        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                        
                        if (endPage - startPage < maxVisible - 1) {
                          startPage = Math.max(1, endPage - maxVisible + 1);
                        }
                        
                        for (let i = startPage; i <= endPage; i++) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => goToPage(i)}
                              className={`px-3 py-1.5 border rounded-md text-sm font-medium transition-colors ${
                                currentPage === i
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {i}
                            </button>
                          );
                        }
                        return pages;
                      })()}
                      
                      {/* Next page */}
                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Next page"
                      >
                        ›
                      </button>
                      
                      {/* Last page */}
                      <button
                        onClick={() => goToPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Last page"
                      >
                        »»
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {ratingSummaries.length > 0 && (
              <div className="px-6 py-6 bg-slate-50 border-t border-gray-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Aggregated View</h3>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={summarySearch}
                      onChange={(e) => setSummarySearch(e.target.value)}
                      placeholder="Search aggregated results..."
                      className="flex-1 sm:flex-initial min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {summarySearch && (
                      <button
                        type="button"
                        onClick={() => setSummarySearch('')}
                        className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
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
                  <div className="space-y-8">
                    {filteredRatingSummaries.map(({ rating, buckets }) => (
                      <div key={rating} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-orange-500 text-white font-bold text-lg">
                          {rating}
                        </div>
                        <div className="divide-y divide-gray-200">
                          {buckets.map(({ key, label, rows }) => (
                            <div key={`${rating}-${key}`} className="overflow-x-auto">
                              <div className={`px-4 py-2 ${key === 'BETWEEN_10_50' ? 'bg-yellow-300 text-gray-900 font-semibold' : 'bg-gray-100 text-gray-700 font-semibold'}`}>
                                {label}
                              </div>
                              <table className="min-w-full bg-white text-sm">
                                <thead className="bg-slate-100 text-xs uppercase text-gray-600 tracking-wide">
                                  <tr>
                                    <th className="px-4 py-2 text-left">Name of Issuer</th>
                                    <th className="px-4 py-2 text-left">ISIN</th>
                                    <th className="px-4 py-2 text-left">Maturity Date</th>
                                    <th className="px-4 py-2 text-right">Trade Count</th>
                                    <th className="px-4 py-2 text-right">Sum of Amount (In Lacs)</th>
                                    <th className="px-4 py-2 text-right">Weighted Avg Yield</th>
                                    <th className="px-4 py-2 text-left">Broker + YTM</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.length === 0 ? (
                                    <tr>
                                      <td colSpan={7} className="px-4 py-3 text-center italic text-gray-500">No matches found</td>
                                    </tr>
                                  ) : (
                                    rows.map((summary) => (
                                      <tr key={`${summary.isin}-${summary.issuer}`} className="even:bg-slate-50">
                                        <td className="px-4 py-2 text-gray-800">{summary.issuer}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-gray-700">{summary.isin}</td>
                                        <td className="px-4 py-2 text-gray-700">{summary.maturity}</td>
                                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{summary.tradeCount}</td>
                                        <td className="px-4 py-2 text-right font-semibold text-blue-700">{summary.sumAmount.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{Number.isFinite(summary.weightedAverage) ? summary.weightedAverage.toFixed(2) : '-'}</td>
                                        <td className="px-4 py-2 text-gray-700">{summary.brokerYtm}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {rows.length === 0 && !busy && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <p className="text-lg">No preview data yet.</p>
            <p className="text-sm mt-2">Upload BSE, NSE, and Securities master files to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}





