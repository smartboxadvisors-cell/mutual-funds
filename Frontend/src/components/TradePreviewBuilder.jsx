import React, { useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
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
  rating: ""
};

const AMOUNT_BUCKETS = [
  { key: 'UNDER_10', label: 'Below 10 Lac', min: 0, max: 10 },
  { key: 'BETWEEN_10_50', label: 'Between 10 Lac to 50 Lac', min: 10, max: 50 },
  { key: 'BETWEEN_50_100', label: 'Between 50 Lac to 100 Lac', min: 50, max: 100 },
  { key: 'BETWEEN_100_500', label: 'Between 100 Lac to 500 Lac', min: 100, max: 500 },
  { key: 'BETWEEN_500_2500', label: 'Between 500 Lac to 2500 Lac', min: 500, max: 2500 },
  { key: 'ABOVE_2500', label: 'Above 2500 Lac', min: 2500, max: Infinity },
];

const BUCKET_THEME_CLASSES = {
  UNDER_10: 'bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-white',
  BETWEEN_10_50: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white',
  BETWEEN_50_100: 'bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-600 text-white',
  BETWEEN_100_500: 'bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white',
  BETWEEN_500_2500: 'bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 text-white',
  ABOVE_2500: 'bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 text-white',
  default: 'bg-gradient-to-r from-slate-500 via-slate-600 to-slate-700 text-white',
};

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

const getFileBadgeLabel = (filename = '') => {
  const lower = filename.toLowerCase();
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
  const [isDragging, setIsDragging] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [visibleCount, setVisibleCount] = useState(50);
  const headerRowRef = useRef(null);
  const tableScrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const [filterTop, setFilterTop] = useState('0px');
  const [summarySearch, setSummarySearch] = useState('');
  const filtersSignature = JSON.stringify(filters);

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
    setVisibleCount(batchSize);
  };

  const resetFilters = useCallback(() => {
    setFilters({ ...FILTER_DEFAULTS });
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
      setVisibleCount(Math.min(batchSize, tradeRows.length));
    } catch (err) {
      console.error("Build preview error:", err);
      alert("Error building preview: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filters.exchange && !row.Exchange.toLowerCase().includes(filters.exchange.toLowerCase())) return false;
      if (filters.tradeDate && !row["Trade Date"].includes(filters.tradeDate)) return false;
      if (filters.tradeTime && !row["Trade Time"].includes(filters.tradeTime)) return false;
      if (filters.isin && !row.ISIN.toLowerCase().includes(filters.isin.toLowerCase())) return false;
      if (filters.issuerDetails && !row["Issuer details"].toLowerCase().includes(filters.issuerDetails.toLowerCase())) return false;
      if (filters.maturity && !row.Maturity.includes(filters.maturity)) return false;

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
          .flatMap((token) => String(token).split(/[,\s/]+/))
          .map((token) => token.replace(/[^A-Z+/-]/gi, "").toUpperCase())
          .filter(Boolean);
        const ratingMatches = ratingTokens.some((token) => token.startsWith(needle));
        if (!ratingMatches) return false;
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
      const rawRatingLabel = (row.RatingParts && row.RatingParts.length ? row.RatingParts[0] : row.Rating || 'Unrated').trim() || 'Unrated';
      const ratingLabel = normalizeRatingGroup(rawRatingLabel);
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
          ? Array.from(rowsMap.entries()).map(([rowKey, entry]) => ({
              rowKey,
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
  }, [ratingSummaries, normalizedSummarySearch, summarySearch]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount]
  );
  const hasMoreRows = visibleCount < filteredRows.length;

  React.useEffect(() => {
    const baseline = filteredRows.length === 0 ? 0 : Math.min(batchSize, filteredRows.length);
    setVisibleCount(baseline);
  }, [filtersSignature, batchSize, filteredRows.length]);

  React.useEffect(() => {
    const scrollRoot = tableScrollRef.current;
    const sentinel = sentinelRef.current;
    if (!scrollRoot || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setVisibleCount((prev) => {
            if (prev >= filteredRows.length) return prev;
            return Math.min(prev + batchSize, filteredRows.length);
          });
        }
      },
      { root: scrollRoot, rootMargin: '0px 0px 120px 0px', threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredRows.length, batchSize]);

  return (
    <div className="tp-page min-h-screen bg-slate-50/80 px-3 py-6 sm:px-6 lg:px-10">
      <div className="tp-shell mx-auto max-w-[1600px] space-y-6 lg:space-y-8">
        {/* File Upload Section */}
        <section className="tp-card tp-upload-card flex flex-col gap-6 rounded-2xl border border-blue-100/70 bg-white p-5 shadow-xl sm:p-6 lg:p-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-3 text-2xl font-bold text-slate-800">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-600" aria-hidden="true">
                  📂
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
                    : "border-slate-300 bg-gradient-to-br from-slate-50 to-white hover:border-blue-400 hover:bg-blue-50/30"
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
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl text-blue-600 shadow-sm" aria-hidden="true">⬆</span>
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
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {pickedFiles.map((f, i) => {
                      const badgeLabel = getFileBadgeLabel(f.name);
                      return (
                        <div
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 shadow-sm transition-all duration-200 hover:border-blue-200"
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
                        <span aria-hidden="true">→</span>
                        <span>Build Preview</span>
                      </>
                  )}
                </button>
              </div>
            ) : (
                <div className="tp-empty flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
                  <span className="text-4xl text-slate-300" aria-hidden="true">🗂️</span>
                  <p className="text-sm font-medium text-slate-700">Upload queue is empty</p>
                  <p className="text-xs text-slate-400">
                    Add trade files to organise and review them here.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="tp-card tp-tips rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-5 sm:px-6">
            <p className="text-sm font-semibold text-blue-900">Tips</p>
            <ul className="mt-3 grid gap-3 text-sm text-blue-900 sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ✓
                </span>
                <span>Upload multiple Excel files at once.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ✓
                </span>
                <span>Select an entire folder containing Excel files.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ✓
                </span>
                <span>Drag & drop files directly from your file explorer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-inset ring-blue-200" aria-hidden="true">
                  ✓
                </span>
                <span>All sheets in each workbook will be processed.</span>
              </li>
            </ul>
          </div>
        </section>
        {/* Results Table */}
        {rows.length > 0 && (
          <section className="tp-card tp-results-card overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-xl">
            <header className="tp-results-header flex flex-col gap-3 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-4 py-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <h2 className="tp-results-title flex items-center gap-3 text-xl font-bold">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg" aria-hidden="true">
                  📊
                </span>
                Trade Results
              </h2>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                <div className="rounded-lg bg-white/10 px-4 py-2 font-medium text-blue-50 backdrop-blur-sm">
                  Showing {visibleRows.length.toLocaleString()} of {filteredRows.length.toLocaleString()} {filteredRows.length < rows.length && `(filtered from ${rows.length.toLocaleString()})`}
                </div>
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
            <div className="w-full overflow-x-auto">
              <div
                ref={tableScrollRef}
                className="max-h-[calc(100vh-320px)] overflow-y-auto"
              >
                <table className="tp-table min-w-[1200px] w-full table-auto border-collapse">
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
                      Amount (INR Lacs)
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-300 border-r border-gray-200">
                      Price (INR)
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
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.tradeDate}
                        onChange={(e) => setFilters({ ...filters, tradeDate: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.tradeTime}
                        onChange={(e) => setFilters({ ...filters, tradeTime: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.isin}
                        onChange={(e) => setFilters({ ...filters, isin: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.issuerDetails}
                        onChange={(e) => setFilters({ ...filters, issuerDetails: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.maturity}
                        onChange={(e) => setFilters({ ...filters, maturity: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.minAmt}
                        onChange={(e) => setFilters({ ...filters, minAmt: e.target.value })}
                        placeholder="Min..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.minPrice}
                        onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                        placeholder="Min..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.yield}
                        onChange={(e) => setFilters({ ...filters, yield: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </th>
                    <th className="px-2 py-1.5 border-b-2 border-gray-300 border-r border-gray-200">
                      <input
                        type="text"
                        value={filters.dealType}
                        onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}
                        placeholder="Filter..."
                        className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                            className="tp-input w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-slate-200 text-slate-700">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={11 + maxRatingColumns} className="px-6 py-12 text-center">
                        <div className="text-gray-500">
                          <p className="text-lg font-semibold mb-2">No transactions match your filters</p>
                          <p className="text-sm">Try adjusting or clearing the filters above</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row, i) => (
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
                        {Number(row["Amount (Rs lacs)"] ?? 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-green-900 text-right font-bold border-r border-gray-200">
                        Rs {Number(row["Price (Rs)"] ?? 0).toFixed(2)}
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
                  {hasMoreRows && visibleRows.length > 0 && (
                    <tr ref={sentinelRef}>
                      <td colSpan={11 + maxRatingColumns} className="tp-loading-row px-3 py-4 text-center text-sm text-gray-500">
                        Loading more trades...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
            <div className="tp-load-controls bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="tp-load-controls__row">
                <span className="tp-load-controls__status">
                  Showing {visibleRows.length.toLocaleString()} of {filteredRows.length.toLocaleString()} trades
                </span>
                <label className="tp-load-controls__batch">
                  <span>Rows per load:</span>
                  <select
                    value={batchSize}
                    onChange={(e) => {
                      const nextBatch = Number(e.target.value);
                      setBatchSize(nextBatch);
                      setVisibleCount(Math.min(nextBatch, filteredRows.length));
                    }}
                    className="tp-input px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
              </div>
              {!hasMoreRows && filteredRows.length > 0 && (
                <p className="tp-load-controls__done">All available trades have been loaded.</p>
              )}
            </div>

            {ratingSummaries.length > 0 && (
              <div className="tp-card tp-aggregated px-6 py-6 bg-slate-50 border-t border-gray-200">
                <div className="tp-aggregated-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Aggregated View</h3>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={summarySearch}
                      onChange={(e) => setSummarySearch(e.target.value)}
                      placeholder="Search aggregated results..."
                      className="tp-input flex-1 sm:flex-initial min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {summarySearch && (
                      <button
                        type="button"
                        onClick={() => setSummarySearch('')}
                        className="tp-btn tp-btn--outline px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
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
                    {filteredRatingSummaries.map(({ rating, buckets }) => {
                      const ratingBannerClass = getRatingBannerClass(rating);
                      return (
                        <div key={rating} className="tp-summary-card bg-white/95 border border-slate-200 rounded-2xl shadow-lg overflow-hidden backdrop-blur">
                          <div className={`px-6 py-5 text-2xl font-extrabold tracking-wide uppercase shadow-md ${ratingBannerClass}`}>
                            {rating}
                          </div>
                          <div className="divide-y divide-slate-200">
                            {buckets.map(({ key, label, rows }) => {
                              const bucketTheme = BUCKET_THEME_CLASSES[key] || BUCKET_THEME_CLASSES.default;
                              return (
                                <div key={`${rating}-${key}`} className="tp-summary-bucket bg-white px-2 sm:px-4 pb-6">
                                  <div className={`flex items-center gap-3 px-4 sm:px-6 py-4 text-base font-semibold uppercase tracking-[0.18em] shadow-sm ${bucketTheme}`}>
                                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/80" aria-hidden="true" />
                                    <span>{label}</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="tp-summary-table min-w-[720px] w-full table-auto border-collapse border border-slate-200 text-sm text-slate-700">
                                      <thead className="bg-slate-800 text-[13px] uppercase tracking-[0.17em] text-white/90 border-b border-slate-700">
                                        <tr>
                                          <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle w-36 border-r border-slate-700 last:border-r-0">Name of Issuer</th>
                                          <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle w-28 border-r border-slate-700 last:border-r-0">ISIN</th>
                                          <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle w-28 border-r border-slate-700 last:border-r-0">Maturity Date</th>
                                          <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle w-20 border-r border-slate-700 last:border-r-0">Trade Count</th>
                                          <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle w-28 border-r border-slate-700 last:border-r-0">Sum of Amount (INR Lacs)</th>
                                          <th className="px-3 py-3 text-right font-semibold text-white/90 tracking-wide align-middle w-28 border-r border-slate-700 last:border-r-0">Weighted Avg Yield</th>
                                          <th className="px-3 py-3 text-left font-semibold text-white/90 tracking-wide align-middle w-36 border-r border-slate-700 last:border-r-0">Broker + YTM</th>
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
                                              <td className="px-3 py-4 font-semibold text-slate-800 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-36">{summary.issuer}</td>
                                              <td className="px-3 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-28">{summary.isin}</td>
                                              <td className="px-3 py-4 text-slate-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-28">{summary.maturity}</td>
                                              <td className="px-3 py-4 text-right font-semibold text-slate-900 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-20">{summary.tradeCount}</td>
                                              <td className="px-3 py-4 text-right font-semibold text-indigo-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-28">{summary.sumAmount.toFixed(2)}</td>
                                              <td className="px-3 py-4 text-right font-semibold text-emerald-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-28">{Number.isFinite(summary.weightedAverage) ? summary.weightedAverage.toFixed(2) : '-'}</td>
                                              <td className="px-3 py-4 text-slate-600 whitespace-normal break-words align-top border-r border-slate-200 last:border-r-0 w-36">{summary.brokerYtm}</td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
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
              </div>
            )}
          </section>
        )}

        {/* This closing section fixes the unbalanced JSX (was missing) */}
        {/* End of Results Table container */}

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
