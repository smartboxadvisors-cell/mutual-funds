import * as XLSX from 'xlsx';
import Papa from 'papaparse';

function normalizeTradeTime(time) {
  if (!time) return '';
  const trimmed = String(time).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function normalizeDealType(sellerType, buyerType) {
  const s = (sellerType || '').toUpperCase().trim();
  const b = (buyerType || '').toUpperCase().trim();
  
  if (s.includes('BROKERED') || b.includes('BROKERED')) return 'Brokered';
  if (s.includes('DIRECT') && b.includes('DIRECT')) return 'Direct';
  if (s.includes('INTER SCHEME TRANSFER') || b.includes('INTER SCHEME TRANSFER')) return 'Inter Scheme Transfer';
  return s || b || '';
}

function normalizeBSEDealType(orderType) {
  const o = (orderType || '').toUpperCase().trim();
  if (o.includes('BROKERED')) return 'Brokered';
  if (o.includes('DIRECT')) return 'Direct';
  return orderType || '';
}

function coerceNumber(val) {
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val || '').replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

function coerceYield(val) {
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val || '').replace(/,/g, ''));
  return isNaN(parsed) ? '' : parsed;
}

export async function parseNSE(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const rows = result.data.map((row) => ({
            Exchange: 'NSE',
            'Trade Date': (row.Date || row['Trade Date'] || '').trim(),
            'Trade Time': normalizeTradeTime(row['Trade Time'] || row.Time || ''),
            ISIN: (row.ISIN || '').trim(),
            'Issuer details': (row.Description || row['Issuer details'] || '').trim(),
            Maturity: (row['Maturity Date'] || row.Maturity || '').trim(),
            Amout: coerceNumber(row['Deal size'] || row.Amout),
            Price: coerceNumber(row.Price),
            Yield: coerceYield(row.Yield),
            Status: (row['Settlement status'] || row.Status || '').trim(),
            'Deal Type': normalizeDealType(
              row['Seller Deal Type'] || '',
              row['Buyer Deal Type'] || ''
            )
          }));
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(err)
    });
  });
}

export async function parseBSE(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 4) {
          resolve([]);
          return;
        }

        const headerRow = jsonData[0];
        const dataRows = jsonData.slice(3);

        const colMap = {};
        headerRow.forEach((h, idx) => {
          const header = String(h || '').trim();
          if (header.includes('Deal Date') || header.includes('Trade Date')) colMap.tradeDate = idx;
          if (header.includes('Trade Time')) colMap.tradeTime = idx;
          if (header === 'ISIN') colMap.isin = idx;
          if (header.includes('Issuer Name')) colMap.issuer = idx;
          if (header.includes('Maturity Date')) colMap.maturity = idx;
          if (header.includes('Trade Amount')) colMap.amount = idx;
          if (header.includes('Trade Price')) colMap.price = idx;
          if (header.includes('Traded Yield')) colMap.yield = idx;
          if (header.includes('Settlement status') || header === 'Status') colMap.status = idx;
          if (header.includes('Order Type')) colMap.dealType = idx;
        });

        const rows = dataRows
          .filter((row) => row && row.length > 0)
          .map((row) => ({
            Exchange: 'BSE',
            'Trade Date': (row[colMap.tradeDate] || '').toString().trim(),
            'Trade Time': normalizeTradeTime((row[colMap.tradeTime] || '').toString()),
            ISIN: (row[colMap.isin] || '').toString().trim(),
            'Issuer details': (row[colMap.issuer] || '').toString().trim(),
            Maturity: (row[colMap.maturity] || '').toString().trim(),
            Amout: coerceNumber(row[colMap.amount]),
            Price: coerceNumber(row[colMap.price]),
            Yield: coerceYield(row[colMap.yield]),
            Status: (row[colMap.status] || '').toString().trim(),
            'Deal Type': normalizeBSEDealType((row[colMap.dealType] || '').toString())
          }));

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

export function mergeUnified(nse, bse) {
  const merged = [...nse, ...bse];
  merged.sort((a, b) => {
    const dateA = a['Trade Date'] + ' ' + a['Trade Time'];
    const dateB = b['Trade Date'] + ' ' + b['Trade Time'];
    return dateA.localeCompare(dateB);
  });
  return merged;
}

