#!/usr/bin/env node
/**
 * Merge NSE and BSE trade sheets into a unified dataset.
 *
 * Usage:
 *   node mergeTrades.js [--output output.csv] file1 file2 ... fileN
 *
 * The script autodetects exchange layout, normalises headers, and
 * writes a merged CSV or XLSX based on the output path extension.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const UNIVERSAL_COLUMNS = [
  'Exchange',
  'Trade Date',
  'Trade Time',
  'ISIN',
  'Issuer details',
  'Maturity Date',
  'Amount (Rs lacs)',
  'Price (Rs)',
  'Yield (%)',
  'Status',
  'Deal Type',
  'Rating',
];

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

function parseArguments(argv) {
  const files = [];
  let output = 'merged_trades.csv';

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for --output');
      }
      output = argv[i + 1];
      i += 1;
    } else {
      files.push(arg);
    }
  }

  if (files.length === 0) {
    throw new Error('Provide at least one input file');
  }

  return { files, output };
}

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { raw: true, cellDates: true, cellNF: false, cellText: false });
}

function sheetToMatrix(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return rows.filter((row) => row.some((value) => String(value).trim() !== ''));
}

function detectExchange(headers) {
  const lowered = headers.map((h) => String(h || '').trim().toLowerCase());
  const nseMarkers = ['seller deal type', 'buyer deal type', 'settlement status', 'deal size', 'description'];
  const bseMarkers = ['trade amount', 'trade price', 'order type', 'settlement type', 'issuer name', 'trade time'];

  const nseScore = nseMarkers.reduce((score, marker) => score + (lowered.some((h) => h.includes(marker)) ? 1 : 0), 0);
  const bseScore = bseMarkers.reduce((score, marker) => score + (lowered.some((h) => h.includes(marker)) ? 1 : 0), 0);

  if (nseScore === 0 && bseScore === 0) return null;
  return nseScore >= bseScore ? 'NSE' : 'BSE';
}

function buildColumnIndex(headers) {
  return headers.reduce((acc, header, idx) => {
    const key = String(header || '').trim().toLowerCase();
    if (key) acc[key] = idx;
    return acc;
  }, {});
}

function findColumn(index, candidates) {
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (key in index) return index[key];
  }
  // allow partial matches (e.g. "trade time (hh:mm)")
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    const found = Object.keys(index).find((col) => col.includes(key));
    if (found) return index[found];
  }
  return null;
}

function toStringCell(row, idx) {
  if (idx === null || idx === undefined) return '';
  const value = row[idx];
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  return str === 'NaN' ? '' : str;
}

function normaliseNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return '';
  const num = Number(cleaned);
  if (Number.isNaN(num)) return cleaned;
  return Number(num.toFixed(6)).toString().replace(/\.0+$/, '').replace(/\.(\d*?)0+$/, '.$1');
}

function serialToDate(serial) {
  const ms = Math.round(serial * 86400000);
  const date = new Date(EXCEL_EPOCH.getTime() + ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normaliseDate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (value > 59 && value < 3000000) {
      const date = serialToDate(value);
      if (date) return date.toISOString().slice(0, 10);
    }
  }
  const str = String(value).trim();
  if (!str) return '';
  const num = Number(str);
  if (!Number.isNaN(num) && num > 59 && num < 3000000) {
    const date = serialToDate(num);
    if (date) return date.toISOString().slice(0, 10);
  }
  const formats = ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d-%b-%Y', '%d %b %Y'];
  const jsFormats = {
    '%d/%m/%Y': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // dd/mm/yyyy
    '%d-%m-%Y': /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // dd-mm-yyyy
    '%Y-%m-%d': /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // yyyy-mm-dd
    '%d-%b-%Y': /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/, // dd-MMM-yyyy
    '%d %b %Y': /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/, // dd MMM yyyy
  };
  const monthLookup = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  for (const fmt of formats) {
    const pattern = jsFormats[fmt];
    const match = pattern.exec(str);
    if (!match) continue;
    let year; let month; let day;
    if (fmt === '%Y-%m-%d') {
      [, year, month, day] = match;
      month = Number(month) - 1;
    } else if (fmt === '%d-%b-%Y' || fmt === '%d %b %Y') {
      [, day, month, year] = match;
      month = monthLookup[month.toLowerCase()];
    } else {
      [, day, month, year] = match;
      month = Number(month) - 1;
    }
    day = Number(day);
    year = Number(year);
    if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year)) continue;
    const date = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return str;
}

function normaliseTime(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(11, 16);
  }
  if (typeof value === 'number') {
    const fraction = value >= 1 ? value % 1 : value;
    if (fraction >= 0 && fraction < 1) {
      const minutes = Math.round(fraction * 24 * 60);
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
  }
  const str = String(value).trim();
  if (!str) return '';
  const numeric = Number(str);
  if (!Number.isNaN(numeric)) {
    return normaliseTime(numeric);
  }
  const patterns = [
    { regex: /^(\d{1,2}):(\d{2}):(\d{2})$/, handler: (m) => `${m[1].padStart(2, '0')}:${m[2]}` },
    { regex: /^(\d{1,2}):(\d{2})$/, handler: (m) => `${m[1].padStart(2, '0')}:${m[2]}` },
    { regex: /^(\d{1,2})(\d{2})(\d{2})$/, handler: (m) => `${m[1].padStart(2, '0')}:${m[2]}` },
  ];

  for (const { regex, handler } of patterns) {
    const match = regex.exec(str);
    if (match) return handler(match);
  }

  // Handle HH:MM:SS AM/PM
  const ampmMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])$/.exec(str);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const mins = ampmMatch[2];
    const period = ampmMatch[4].toLowerCase();
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins}`;
  }

  // Extract trailing time if embedded in strings
  const trailing = /(\d{1,2}:\d{2})(?::\d{2})?/.exec(str);
  if (trailing) {
    const hhmm = trailing[1].split(':').slice(0, 2).join(':');
    return hhmm.replace(/^(\d):/, (_, h) => `0${h}:`);
  }

  return str;
}

function combineDealType(seller, buyer) {
  const parts = [seller, buyer]
    .map((value) => (value ? String(value).trim() : ''))
    .filter(Boolean);
  if (parts.length === 0) return '';
  return [...new Set(parts)].join(' / ');
}

function mapNse(headers, rows) {
  const index = buildColumnIndex(headers);
  const dateIdx = findColumn(index, ['date', 'trade date']);
  const timeIdx = findColumn(index, ['trade time']);
  const isinIdx = findColumn(index, ['isin']);
  const descIdx = findColumn(index, ['description', 'security name']);
  const maturityIdx = findColumn(index, ['maturity date', 'maturity']);
  const amountIdx = findColumn(index, ['deal size', 'deal size (rs lacs)', 'amount']);
  const priceIdx = findColumn(index, ['price', 'trade price']);
  const yieldIdx = findColumn(index, ['yield', 'traded yield']);
  const statusIdx = findColumn(index, ['settlement status', 'status']);
  const sellerIdx = findColumn(index, ['seller deal type', 'seller type']);
  const buyerIdx = findColumn(index, ['buyer deal type', 'buyer type']);

  return rows.map((row) => ({
    Exchange: 'NSE',
    'Trade Date': normaliseDate(row[dateIdx]),
    'Trade Time': normaliseTime(row[timeIdx]),
    ISIN: toStringCell(row, isinIdx),
    'Issuer details': toStringCell(row, descIdx),
    'Maturity Date': normaliseDate(row[maturityIdx]),
    'Amount (Rs lacs)': normaliseNumber(row[amountIdx]),
    'Price (Rs)': normaliseNumber(row[priceIdx]),
    'Yield (%)': normaliseNumber(row[yieldIdx]),
    Status: toStringCell(row, statusIdx),
    'Deal Type': combineDealType(row[sellerIdx], row[buyerIdx]),
    Rating: '',
  })).filter((record) => record.ISIN || record['Issuer details']);
}

function mapBse(headers, rows) {
  const index = buildColumnIndex(headers);
  const dateIdx = findColumn(index, ['deal date', 'trade date', 'date']);
  const timeIdx = findColumn(index, ['trade time', 'trade time (hh:mm)', 'time']);
  const isinIdx = findColumn(index, ['isin']);
  const issuerIdx = findColumn(index, ['issuer name', 'issuer', 'company']);
  const symbolIdx = findColumn(index, ['symbol', 'scrip']);
  const maturityIdx = findColumn(index, ['maturity date', 'maturity']);
  const amountIdx = findColumn(index, ['trade amount (in rs lacs)', 'amount (rs lacs)', 'amount']);
  const priceIdx = findColumn(index, ['trade price (rs)', 'price']);
  const yieldIdx = findColumn(index, ['traded yield (%)', 'yield']);
  const statusIdx = findColumn(index, ['settlement type', 'settlement status']);
  const orderIdx = findColumn(index, ['order type', 'type']);

  return rows.map((row) => {
    const issuer = toStringCell(row, issuerIdx) || toStringCell(row, symbolIdx);
    return {
      Exchange: 'BSE',
      'Trade Date': normaliseDate(row[dateIdx]),
      'Trade Time': normaliseTime(row[timeIdx]),
      ISIN: toStringCell(row, isinIdx),
      'Issuer details': issuer,
      'Maturity Date': normaliseDate(row[maturityIdx]),
      'Amount (Rs lacs)': normaliseNumber(row[amountIdx]),
      'Price (Rs)': normaliseNumber(row[priceIdx]),
      'Yield (%)': normaliseNumber(row[yieldIdx]),
      Status: toStringCell(row, statusIdx),
      'Deal Type': toStringCell(row, orderIdx),
      Rating: '',
    };
  }).filter((record) => record.ISIN || record['Issuer details']);
}

function processSheet(filePath, sheetName, matrix) {
  if (matrix.length === 0) return [];
  const headers = matrix[0];
  const exchange = detectExchange(headers);
  if (!exchange) {
    console.warn(`[WARN] Unable to detect exchange for sheet ${sheetName} in ${filePath}`);
    return [];
  }
  const rows = matrix.slice(1);
  if (exchange === 'NSE') {
    console.log(`[INFO] ${path.basename(filePath)} :: ${sheetName} -> NSE (${rows.length} rows)`);
    return mapNse(headers, rows);
  }
  console.log(`[INFO] ${path.basename(filePath)} :: ${sheetName} -> BSE (${rows.length} rows)`);
  return mapBse(headers, rows);
}

function writeOutput(records, outputPath) {
  const ws = XLSX.utils.json_to_sheet(records, { header: UNIVERSAL_COLUMNS });
  // Ensure header order
  XLSX.utils.sheet_add_aoa(ws, [UNIVERSAL_COLUMNS], { origin: 'A1' });

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Merged Trades');
    XLSX.writeFile(wb, outputPath);
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws);
    fs.writeFileSync(outputPath, csv, 'utf8');
  }
}

function main() {
  let args;
  try {
    args = parseArguments(process.argv);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  const allRecords = [];

  for (const input of args.files) {
    const filePath = path.resolve(process.cwd(), input);
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] Skipping missing file: ${filePath}`);
      continue;
    }

    let workbook;
    try {
      workbook = readWorkbook(filePath);
    } catch (err) {
      console.error(`[ERROR] Failed to read ${filePath}: ${err.message}`);
      continue;
    }

    workbook.SheetNames.forEach((sheetName) => {
      const matrix = sheetToMatrix(workbook, sheetName);
      const records = processSheet(filePath, sheetName, matrix);
      allRecords.push(...records);
    });
  }

  if (allRecords.length === 0) {
    console.error('[ERROR] No records produced. Ensure files have recognisable headers.');
    process.exit(1);
  }

  const outputPath = path.resolve(process.cwd(), args.output);
  try {
    writeOutput(allRecords, outputPath);
  } catch (err) {
    console.error(`[ERROR] Failed to write output: ${err.message}`);
    process.exit(1);
  }

  console.log(`[SUCCESS] Wrote ${allRecords.length} rows to ${outputPath}`);
}

if (require.main === module) {
  main();
}
