// utils/parseExcel.js
const XLSX = require('xlsx');

// Category mappings as per PROJECT_PROMPT
const CATEGORY_MAPPINGS = [
  { 
    patterns: [
      /debt\s*instruments?/i, 
      /^debt$/i
    ], 
    name: 'Debt Instruments' 
  },
  { 
    patterns: [
      /money\s*market\s*instruments?/i
    ], 
    name: 'Money Market Instruments' 
  },
  { 
    patterns: [
      /equity\s*instruments?/i, 
      /equity.*related/i,        // "Equity & Equity related"
      /equity\s*&\s*equity/i,    // "EQUITY & EQUITY RELATED"
      /^equity$/i
    ], 
    name: 'Equity Instruments' 
  },
  { 
    patterns: [
      /reit\/invit\s*instruments?/i, 
      /reit.*invit/i
    ], 
    name: 'REIT/InvIT Instruments' 
  },
  { 
    patterns: [
      /treasury\s*bills?/i, 
      /t-bills?/i
    ], 
    name: 'Treasury Bills' 
  },
  { 
    patterns: [
      /government\s*securities/i, 
      /govt\s*securities/i
    ], 
    name: 'Government Securities' 
  },
  { 
    patterns: [
      /corporate\s*bonds?/i
    ], 
    name: 'Corporate Bonds' 
  },
  { 
    patterns: [
      /mutual\s*funds?/i, 
      /aif/i
    ], 
    name: 'Mutual Funds & AIFs' 
  },
  { 
    patterns: [
      /derivatives?/i, 
      /futures?/i, 
      /options?/i
    ], 
    name: 'Derivatives' 
  }
];

// Irrelevant row patterns - comprehensive list
const IRRELEVANT_PATTERNS = [
  // Notes and disclaimers
  /^#/,                                    // # Unlisted Security
  /^\*\*/,                                 // ** Thinly Traded
  /^\*[^*]/,                               // * Single asterisk notes
  /^-+$/,                                  // Just dashes
  /investors\s*should/i,                   // Investors should consult
  /disclosure/i,                           // Disclosure rows
  /^note(?!s)/i,                           // Note (but not Notes in names)
  /^remarks?$/i,                           // Remarks/Remark
  
  // Sub-headers and metadata
  /^\([a-z]\).*listed.*awaiting/i,         // (a) Listed / awaiting listing
  /^\([a-z]\).*privately.*placed/i,        // (b) Privately placed
  /^\([a-z]\).*unlisted/i,                 // (b) Unlisted
  /^\([a-z]\).*foreign.*securities/i,      // (c) Foreign Securities and /or overseas ETF
  /listed.*awaiting.*listing.*stock.*exchange/i,  // Listed / awaiting listing on Stock Exchanges
  /listed.*awaiting.*listing/i,            // Listed / awaiting listing (standalone)
  /privately\s*placed/i,                   // Privately placed
  /unlisted\s*security$/i,                 // Unlisted Security (exact end)
  /^unlisted$/i,                           // Just "Unlisted" alone
  /thinly\s*traded/i,                      // Thinly traded
  /non\s*traded\s*security/i,              // Non traded security
  /foreign.*securities.*overseas/i,        // Foreign Securities and /or overseas ETF
  
  // Summary rows
  /^total$/i,                              // Total
  /^sub\s*total/i,                         // Sub Total
  /^grand\s*total/i,                       // Grand Total
  
  // Category subcategories (should not be data rows)
  /^commercial\s*paper$/i,                 // Commercial Paper (alone)
  /^treasury\s*bill$/i,                    // Treasury Bill (alone)  
  /^certificate\s*of\s*deposit$/i,         // Certificate of Deposit
  /^non-convertible\s*debenture$/i,        // Non-Convertible Debenture
  /^government\s*securities$/i,            // Government Securities (alone)
  /^corporate\s*bonds?$/i,                 // Corporate Bond/Bonds (alone)
  
  // Portfolio metadata and statistics
  /portfolio\s*ytm/i,                      // Portfolio YTM
  /^as\s+on\s+/i,                          // as on [date]
  /tier\s*\d+.*disclosure/i,               // Tier 1 & 2 Bonds Disclosure
  /^average\s*maturity/i,                  // Average Maturity
  /^residual\s*maturity/i,                 // Residual Maturity
  /^macaulay\s*duration/i,                 // Macaulay Duration
  /^modified\s*duration/i,                 // Modified Duration
  /^scheme\s*name/i,                       // Scheme Name:
  /^fund\s*name/i,                         // Fund Name:
  /^net\s*receivables?/i,                  // Net Receivables
  /^payables?$/i,                          // Payables
  /^\(payables?\)/i,                       // (Payables)
  /^cblo$/i,                               // CBLO (alone)
  /^treps$/i,                              // TREPS (alone)
  /^reverse\s*repo$/i,                     // Reverse Repo (alone)
  /^repo$/i,                               // Repo (alone)
  /^cash\s*&\s*cash\s*equivalent/i,       // Cash & Cash Equivalent
  /^net\s*current\s*assets?/i,            // Net Current Assets
  /^other\s*current\s*assets?/i,          // Other Current Assets
  /^accrued\s*income/i,                    // Accrued Income
];

// Column mapping patterns as per PROJECT_PROMPT
const COLUMN_MAPPINGS = {
  instrumentName: [
    /name.*of.*the.*instrument/i, // "Name of the Instrument" (most specific first)
    /name.*of.*instrument/i,      // "Name of Instrument"
    /company.*issuer.*instrument.*name/i, // "Company/Issuer/Instrument Name" (ICICI format)
    /name.*instrument/i,          // "Name Instrument"
    /name.*issuer/i,              // "Name of the Instrument / Issuer"
    /instrument.*name/i,          // "Instrument Name"
    /^instrument$/i,              // "Instrument" alone as a column header
    /^security$/i,                // "Security" alone as a column header
    /^name$/i,                    // "Name" alone
    /security.*name/i,            // "Security Name"
    /^issuer$/i,                  // "Issuer" alone
    /^company$/i                  // "Company" alone
  ],
  isin: [/isin/i],
  rating: [
    /rating\s*\/\s*industry/i,      // "Rating / Industry" (most specific first)
    /industry\s*\/\s*rating/i,      // "Industry / Rating" (HDFC format)
    /industry\+?\s*\/\s*rating/i,   // "Industry+ /Rating" or "Industry+/Rating"
    /industry\s*\+\s*rating/i,      // "Industry + Rating"
    /rating.*industry/i,            // "Rating Industry"
    /industry.*rating/i,            // "Industry Rating"
    /^rating$/i,                    // Just "Rating" alone
    /^industry$/i,                  // Just "Industry" alone
    /rating/i, 
    /grade/i
  ],
  quantity: [
    /quantity/i, 
    /qty/i, 
    /units/i,
    /no\s*of\s*units/i
  ],
  marketValue: [
    /market\s*\/\s*fair\s*value.*rs.*lacs/i,     // "Market/ Fair Value (Rs. in Lacs.)"
    /market\s*\/?\s*fair\s*value.*rs.*lacs/i,    // "Market/Fair Value ( Rs. in Lacs)" (HDFC format)
    /market\s*\/?\s*fair\s*value.*rs.*lakhs?/i,  // "Market/Fair Value (Rs. in Lakhs)"
    /exposure.*market\s*value/i,                  // "Exposure/Market Value(Rs.Lakh)" (ICICI format)
    /market\s*value.*rs.*lakhs?/i,               // "Market value (Rs. in Lakhs)"
    /market\s*value.*rs.*lacs/i,                 // "Market value (Rs. in Lacs)"
    /market\s*value.*rs.*lakh/i,                 // "Market value (Rs.Lakh)" (ICICI format)
    /fair\s*value.*rs.*lakhs?/i,                 // "Fair value (Rs. in Lakhs)"
    /value.*rs.*lakhs?/i,                         // "Value (Rs in Lakhs)"
    /value.*rs.*lacs/i,                           // "Value (Rs in Lacs)"
    /value.*rs.*lakh/i,                           // "Value (Rs.Lakh)"
    /market.*value/i, 
    /fair.*value/i,
    /^value$/i,
    /^exposure$/i,                                // "Exposure" alone (ICICI format)
    /amount/i
  ],
  navPercent: [
    /^%\s*to\s*nav\b/i,               // "% to NAV" (strict - most specific first)
    /^%\s*to\s*aum\b/i,               // "% to AUM" (strict)
    /^%\s*to\s*net\s*assets?\b/i,     // "% to Net Assets" (strict)
    /%\s*to\s*nav\b/i,                // "% to NAV" (looser)
    /%\s*to\s*aum\b/i,                // "% to AUM" (looser)
    /%\s*to\s*net\s*assets?/i,        // "% to Net Assets"
    /%.*net.*asset/i,                 // "% Net Assets"
    /rounded.*%.*nav/i,               // "Rounded % to NAV"
    /rounded.*%.*net.*asset/i,        // "Rounded % to Net Assets"
    /rounded.*%/i,                    // "Rounded %"
    /percent.*to.*nav/i,              // "Percent to NAV"
    /percent.*to.*aum/i,              // "Percent to AUM"
    /percent.*net.*asset/i,           // "Percent to Net Assets"
    /weight/i                         // Weight
    // NOTE: Removed generic patterns to avoid false matches
  ],
  maturityDate: [
    /^maturity\s*date$/i,                // "Maturity Date" alone
    /^maturity$/i,                       // "Maturity" alone as a column header
    /date.*maturity/i,                   // "Date of Maturity"
    /maturity.*date/i                    // "Maturity Date"
  ],
  coupon: [
    /^coupon\s*\(%\)$/i,                 // "Coupon (%)"
    /^coupon\s*%$/i,                     // "Coupon %"
    /^coupon\s*rate?$/i,                 // "Coupon Rate" or "Coupon" alone
    /^coupon$/i,                         // "Coupon" alone
    /^rate\s*of\s*interest$/i,           // "Rate of Interest"
    /^interest\s*rate$/i                 // "Interest Rate" alone
  ],
  sector: [
    /sector/i, 
    /industry/i,
    /rating.*industry/i,
    /industry.*rating/i
  ],
  issuer: [/issuer/i, /company/i],
  ytm: [
    /^yield\s+of\s+the\s+instrument$/i,       // "yield of the instrument" (ICICI - exact match after normalization)
    /^yield\s+of\s+instrument$/i,             // "yield of instrument" (shortened)
    /yield\s+of\s+the\s+instrument/i,         // "yield of the instrument" (anywhere in header)
    /yield\s+instrument/i,                    // "yield instrument"
    /^ytm\s+percent$/i,                       // "ytm percent"
    /^ytm\s+%$/i,                             // "ytm %"
    /^ytm$/i,                                 // "ytm" alone
    /^yield\s+to\s+maturity$/i,               // "yield to maturity" (full form, exact)
    /yield\s+to\s+maturity/i,                 // "yield to maturity" (anywhere)
    /^yield$/i,                               // "yield" alone (case-insensitive)
    /\bytm\b/i,                               // "ytm" as whole word
    /\byield\b/i                              // "yield" as whole word (lowest priority)
  ],
  ytc: [
    /^~?ytc/i,                 // "~YTC" or "YTC"
    /yield.*to.*call/i,        // "Yield to Call"
    /yield.*call/i,            // "Yield Call" (shorter variant)
    /^~?ytc.*at1/i,            // "~YTC (AT1/Tier 2 bonds)"
    /^~?ytc.*tier/i            // "~YTC (Tier 2)"
  ]
};

function detectSchemeInfo(worksheet) {
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  let schemeName = '';
  let reportDate = null;
  let isICICI = false;
  let firstLineValue = '';
  
  // Check first 10 rows for scheme name and date
  for (let r = 0; r < Math.min(10, range.e.r + 1); r++) {
    for (let c = 0; c < Math.min(10, range.e.c + 1); c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellAddress];
      if (!cell) continue;
      
      const value = String(cell.v || '').trim();
      
      // Skip empty values
      if (!value) continue;
      
      // Store first line to detect ICICI format
      if (r === 0 && !firstLineValue) {
        firstLineValue = value;
        // Detect ICICI format: first line is just "ICICI Prudential Mutual Fund"
        if (/^ICICI\s+Prudential\s+Mutual\s+Fund$/i.test(value)) {
          isICICI = true;
          console.log('🏦 Detected ICICI format - will use second line as scheme name');
          continue; // Skip this line, don't use as scheme name
        }
      }
      
      // Detect scheme name patterns (priority order)
      // Pattern 1: "SCHEME NAME: SBI Short Term Debt Fund"
      if (/scheme\s*name\s*:/i.test(value)) {
        schemeName = value.replace(/scheme\s*name\s*:/i, '').trim();
      }
      // Pattern 2: Text containing mutual fund keywords (most common format)
      // Examples: "Nippon India Corporate Bond Fund", "HDFC Ultra Short Term Fund", "DSP Liquidity Fund"
      else if (!schemeName && r <= 2) { // Only check first 3 rows
        // For ICICI format: skip first line (fund house name), use second line (scheme name)
        if (isICICI && r === 0) {
          continue; // Skip first line for ICICI
        }
        
        // Check if it contains fund-related keywords
        const isFundName = /fund|mutual\s*fund|scheme/i.test(value);
        
        // Check if it's long enough and doesn't look like a header
        const isLongEnough = value.length > 10;
        const notAHeader = !/^(sr\.?\s*no|name\s*of|isin|rating|quantity|market|portfolio\s*statement)/i.test(value);
        
        if (isFundName && isLongEnough && notAHeader) {
          // Extract just the fund name, remove long descriptions in parentheses
          // Example: "Nippon India Corporate Bond Fund (An open ended debt scheme...)" 
          // -> "Nippon India Corporate Bond Fund"
          let cleanedName = value;
          
          // Remove text in parentheses if it's a long description
          const parenMatch = value.match(/^([^(]+)\s*\([^)]{30,}\)/);
          if (parenMatch) {
            cleanedName = parenMatch[1].trim();
          }
          
          // Remove common suffixes that are descriptions
          cleanedName = cleanedName
            .replace(/\s*-\s*(an\s+open\s+ended|a\s+close\s+ended).*/i, '')
            .replace(/\s*\(an\s+open\s+ended.*/i, '')
            .replace(/\s*\(a\s+close\s+ended.*/i, '')
            .trim();
          
          schemeName = cleanedName;
          if (isICICI) {
            console.log(`✅ ICICI scheme name from line ${r + 1}: "${schemeName}"`);
          }
        }
      }
      
      // Detect date patterns
      // Special case: "PORTFOLIO STATEMENT AS ON: September 15, 2021"
      if (/portfolio\s*statement\s*as\s*on\s*:/i.test(value)) {
        const dateStr = value.replace(/portfolio\s*statement\s*as\s*on\s*:/i, '').trim();
        try {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            reportDate = parsed;
          }
        } catch (e) {
          // Continue searching
        }
      }
      
      const datePatterns = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*,?\s*(\d{4})/i,
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*,?\s*(\d{4})/i
      ];
      
      for (const pattern of datePatterns) {
        const match = value.match(pattern);
        if (match) {
          console.log('📅 FOUND DATE STRING:', value);
          console.log('📅 DATE MATCH GROUPS:', match);
          
          try {
            reportDate = new Date(value);
            if (isNaN(reportDate.getTime())) {
              // Try parsing manually
              if (match[3]) { // dd/mm/yyyy or dd mmm yyyy
                reportDate = new Date(match[3], match[2] - 1 || 0, match[1]);
              }
            }
            
            if (reportDate && !isNaN(reportDate.getTime())) {
              // Format as dd/mm/yyyy
              const day = String(reportDate.getDate()).padStart(2, '0');
              const month = String(reportDate.getMonth() + 1).padStart(2, '0');
              const year = reportDate.getFullYear();
              const formattedDate = `${day}/${month}/${year}`;
              
              console.log('✅ PARSED DATE OBJECT:', reportDate);
              console.log('✅ FORMATTED AS dd/mm/yyyy:', formattedDate);
            }
          } catch (e) {
            console.log('❌ Error parsing date:', e.message);
          }
        }
      }
    }
  }
  
  return { schemeName, reportDate };
}

function isCategoryHeader(rowData) {
  // Categories can be in different columns depending on file format:
  // - NIMF format: categories in instrumentName column
  // - HDFC format: categories in isin column (column B)
  // - ICICI format: categories in instrumentName with summary data in other columns
  // Check both fields to handle all formats
  const textFromInstrument = String(rowData.instrumentName || '').trim().toLowerCase();
  const textFromIsin = String(rowData.isin || '').trim().toLowerCase();
  
  // Try instrumentName first (most common), then isin
  const text = textFromInstrument || textFromIsin;
  
  // Category headers should have text
  if (!text) return null;
  
  // Check if text matches any category pattern FIRST
  // This is the most reliable way to detect categories
  for (const mapping of CATEGORY_MAPPINGS) {
    if (mapping.patterns.some(p => p.test(text))) {
      // Found a category match!
      // Additional validation: should NOT have a valid ISIN (ISINs indicate data rows)
      const hasValidISIN = rowData.isin && /^IN[A-Z0-9]{10}$/i.test(String(rowData.isin).trim());
      if (!hasValidISIN) {
        return mapping.name;
      }
    }
  }
  
  return null;
}

function isIrrelevantRow(rowData) {
  // Check instrumentName field for pattern matching (more consistent than first value)
  const text = String(rowData.instrumentName || '').trim().toLowerCase();
  
  // Count non-empty cells
  const allValues = Object.values(rowData);
  const nonEmptyCount = allValues.filter(v => 
    v !== null && v !== undefined && String(v).trim() !== ''
  ).length;
  
  // INCLUDE if has valid ISIN (most reliable indicator of real data)
  const hasISIN = allValues.some(v => /^IN[A-Z0-9]{10}$/.test(String(v).trim()));
  if (hasISIN) return false;
  
  // INCLUDE if has multiple numeric values (likely data row)
  const numberCount = allValues.filter(v => 
    /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(String(v).trim()) ||
    /^\d+(\.\d+)?$/.test(String(v).trim())
  ).length;
  if (numberCount >= 2 && nonEmptyCount >= 4) return false;
  
  // SKIP if matches irrelevant patterns
  if (IRRELEVANT_PATTERNS.some(p => p.test(text))) {
    return true;
  }
  
  // SKIP if just "(a)" or "(b)" alone with minimal data
  if (/^\([a-z]\)$/i.test(text) && nonEmptyCount <= 2) {
    return true;
  }
  
  // SKIP if very short text with minimal data
  if (text.length < 5 && nonEmptyCount <= 2) {
    return true;
  }
  
  // SKIP rows like "CBLO/Reverse REPO" that are placeholders with no data
  if (/cblo|reverse\s*repo/i.test(text) && nonEmptyCount <= 1) {
    return true;
  }
  
  return false;
}

// Validate if row has meaningful data (no nulls in critical fields)
function hasValidData(parsedRow) {
  // Must have instrument name (not null, not empty, not just spaces)
  if (!parsedRow.instrumentName || String(parsedRow.instrumentName).trim() === '') {
    return false;
  }
  
  // Must have ISIN (valid ISIN code, not null)
  const hasValidISIN = parsedRow.isin && 
                       String(parsedRow.isin).trim() !== '' && 
                       String(parsedRow.isin).trim() !== '-' &&
                       /^IN[A-Z0-9]{10}$/i.test(String(parsedRow.isin).trim());
  
  if (!hasValidISIN) {
    return false;
  }
  
  // Must have at least quantity OR marketValue OR navPercent (not all null)
  const hasQuantity = parsedRow.quantity !== null && 
                      parsedRow.quantity !== undefined && 
                      parsedRow.quantity !== '' &&
                      !isNaN(parsedRow.quantity);
                      
  const hasMarketValue = parsedRow.marketValue !== null && 
                         parsedRow.marketValue !== undefined && 
                         parsedRow.marketValue !== '' &&
                         !isNaN(parsedRow.marketValue);
                         
  const hasNavPercent = parsedRow.navPercent !== null && 
                        parsedRow.navPercent !== undefined && 
                        parsedRow.navPercent !== '' &&
                        !isNaN(parsedRow.navPercent);
  
  // Valid if has ISIN AND at least one numeric value
  return hasValidISIN && (hasQuantity || hasMarketValue || hasNavPercent);
}

function detectColumnHeaders(worksheet) {
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  const columnMap = {};
  
  console.log('🔍 Searching for column headers in first 30 rows...');
  
  // Search for header row (usually has multiple column names)
  for (let r = 0; r < Math.min(30, range.e.r + 1); r++) {
    const rowHeaders = {};
    let headerCount = 0;
    const rowValues = [];
    
    for (let c = 0; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellAddress];
      const value = String(cell?.v || '').trim();
      rowValues.push(value || '(empty)'); // Keep empty cells in array to maintain column positions
      
      // Skip empty cells for pattern matching
      if (!value) continue;
      
      // Normalize the value: remove line breaks, extra spaces, and special formatting
      const normalizedValue = value
        .replace(/[\r\n]+/g, ' ')           // Replace line breaks with spaces
        .replace(/\s+/g, ' ')                // Replace multiple spaces with single space
        .replace(/["""'']/g, '"')            // Normalize quotes
        .replace(/[^a-z0-9\s]/gi, ' ')      // Remove special characters except spaces
        .replace(/\s+/g, ' ')                // Collapse multiple spaces again
        .trim()
        .toLowerCase();
      
      // Check against column mappings
      for (const [fieldName, patterns] of Object.entries(COLUMN_MAPPINGS)) {
        if (patterns.some(p => p.test(normalizedValue))) {
          rowHeaders[fieldName] = c;
          headerCount++;
          console.log(`✅ Found header "${fieldName}" in column ${c}: "${value}" (normalized: "${normalizedValue}")`);
          
          // Special logging for ICICI yield column
          if (fieldName === 'ytm' && /yield.*of.*the.*instrument/i.test(normalizedValue)) {
            console.log('🏦 ICICI YIELD COLUMN DETECTED: Will extract yield from "Yield of the instrument" column');
            console.log('🏦 Original header text:', value);
            console.log('🏦 Normalized header text:', normalizedValue);
          }
        }
      }
      
      // Special debug for yield-related headers that weren't matched
      if (value && /yield/i.test(value)) {
        if (!rowHeaders.ytm) {
          console.log(`⚠️  YIELD HEADER NOT MATCHED in column ${c}:`);
          console.log(`   Original: "${value}"`);
          console.log(`   Normalized: "${normalizedValue}"`);
          console.log(`   Length: ${normalizedValue.length} chars`);
          
          // Test against all YTM patterns to see which ones match
          console.log(`   Testing against YTM patterns:`);
          const ytmPatterns = COLUMN_MAPPINGS.ytm;
          ytmPatterns.forEach((pattern, idx) => {
            const matches = pattern.test(normalizedValue);
            console.log(`     Pattern ${idx}: ${pattern} → ${matches ? '✅ MATCH' : '❌ no match'}`);
          });
        } else {
          console.log(`✅ YIELD HEADER MATCHED in column ${c} as 'ytm'`);
          console.log(`   Original: "${value}"`);
          console.log(`   Normalized: "${normalizedValue}"`);
        }
      }
    }
    
    if (r < 10) {
      console.log(`📋 Row ${r}:`, rowValues); // Show ALL columns in first 10 rows
    }
    
    // If we found multiple headers in this row, it's likely the header row
    // Require at least 2 columns (was 3) to be more lenient with smaller files
    if (headerCount >= 2) {
      Object.assign(columnMap, rowHeaders);
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎯 HEADER ROW FOUND at index ${r} with ${headerCount} matched columns`);
      console.log(`${'='.repeat(80)}`);
      
      // Show ALL headers in this row (matched and unmatched)
      console.log(`\n📋 ALL COLUMN HEADERS IN THIS ROW:`);
      rowValues.forEach((val, idx) => {
        if (val && val !== '(empty)') {
          const isMapped = Object.values(rowHeaders).includes(idx);
          const mappedAs = Object.keys(rowHeaders).find(key => rowHeaders[key] === idx);
          console.log(`   Column ${idx}: "${val}" ${isMapped ? `✅ → ${mappedAs}` : '❌ not mapped'}`);
        }
      });
      
      console.log(`\n📊 COMPLETE COLUMN MAPPING:`);
      console.log(JSON.stringify(columnMap, null, 2));
      
      // Check if YTM column was detected
      if (columnMap.ytm !== undefined) {
        console.log(`\n✅ YTM COLUMN DETECTED at column ${columnMap.ytm}`);
      } else {
        console.log(`\n❌ YTM COLUMN NOT DETECTED - Yield values will NOT be extracted!`);
        console.log(`   💡 Looking for headers like: "Yield of the instrument", "YTM", "Yield", etc.`);
      }
      console.log(`${'='.repeat(80)}\n`);
      
      return { columnMap, headerRowIndex: r };
    }
  }
  
  console.log('❌ No header row found with 2+ recognizable columns');
  console.log('💡 This usually means:');
  console.log('   - The Excel file has a different header format');
  console.log('   - Headers might be merged cells or formatted differently');
  console.log('   - The file might be in a completely different structure');
  console.log('📋 Please check the first 5 rows above to see what headers are present');
  console.log('\n🔍 Looking for headers like:');
  console.log('   - "Name of the Instrument", "Instrument", "Security"');
  console.log('   - "ISIN"');
  console.log('   - "Rating", "Rating / Industry"');
  console.log('   - "Quantity", "Market Value", "% to NAV", "YTM"\n');
  return { columnMap: {}, headerRowIndex: -1 };
}

function parseExcelFile(filePathOrBuffer) {
  console.log('🔍 Starting Excel parsing...');
  
  // Support both file path and buffer
  let workbook;
  if (Buffer.isBuffer(filePathOrBuffer)) {
    console.log('📦 Parsing from memory buffer');
    workbook = XLSX.read(filePathOrBuffer, { type: 'buffer' });
  } else {
    console.log('📁 Parsing from file path:', filePathOrBuffer);
    workbook = XLSX.readFile(filePathOrBuffer);
  }
  
  const allData = [];
  const processedSheets = [];
  
  console.log('📄 Found sheets:', workbook.SheetNames);
  
  // Process ALL sheets as per PROJECT_PROMPT
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n📋 Processing sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet['!ref']) {
      console.log('❌ Sheet has no data range');
      continue;
    }
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    console.log(`📊 Sheet range: ${range.e.r + 1} rows, ${range.e.c + 1} columns`);
    
    const { schemeName, reportDate } = detectSchemeInfo(worksheet);
    console.log('🏷️  Detected scheme:', schemeName, 'Date:', reportDate);
    
    const { columnMap, headerRowIndex } = detectColumnHeaders(worksheet);
    console.log('📑 Column mapping:', columnMap);
    console.log('📍 Header row index:', headerRowIndex);
    
    if (headerRowIndex === -1) {
      processedSheets.push({ sheetName, status: 'No headers found', data: [] });
      continue;
    }
    
    const sheetData = [];
    let currentCategory = null;
    
    // Process rows after header
    console.log(`🔄 Processing ${range.e.r - headerRowIndex} data rows...`);
    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const rowData = {};
      
      // Extract values based on column mapping
      for (const [fieldName, colIndex] of Object.entries(columnMap)) {
        const cellAddress = XLSX.utils.encode_cell({ r, c: colIndex });
        const cell = worksheet[cellAddress];
        
        if (!cell) {
          rowData[fieldName] = null;
          continue;
        }
        
        let value = cell.v;
        
        // Handle dash/empty values for numeric fields (treat as null)
        if (value === '—' || value === '-' || value === '–' || value === '−' || value === 'NA' || value === 'N/A') {
          value = null;
        }
        
        // Special handling for percentage fields: navPercent, ytm, and ytc
        // Excel stores percentages as decimals ONLY if the cell is percentage-formatted
        // e.g., 7.21% is stored as 0.0721 if formatted as "%", otherwise as 7.21
        if ((fieldName === 'navPercent' || fieldName === 'ytm' || fieldName === 'ytc') && typeof value === 'number') {
          const format = cell.z || cell.w || '';
          const isPercentFormatted = format.includes('%');
          
          // ONLY convert if the cell is explicitly formatted as a percentage in Excel
          // AND the value is < 1 (to avoid converting values like 50% stored as 50)
          if (isPercentFormatted && value < 1 && value > 0) {
            value = value * 100;
            console.log(`📊 Converted ${fieldName} from ${cell.v} to ${value} (Excel percentage format detected)`);
          }
          
          // Special logging for yield values (first 10 data rows)
          if (fieldName === 'ytm' && r <= headerRowIndex + 10) {
            console.log(`🏦 Row ${r} - YTM captured: ${value} (raw: ${cell.v}, type: ${typeof value})`);
          }
        }
        
        // Log all YTM values being captured (even null ones) for debugging
        if (fieldName === 'ytm' && r <= headerRowIndex + 10) {
          console.log(`📊 Row ${r} - YTM field: value=${value}, type=${typeof value}, original cell=${cell.v}`);
        }
        
        rowData[fieldName] = value;
      }
      
      // Debug: Show first few rows
      if (r <= headerRowIndex + 5) {
        console.log(`📝 Row ${r}:`, rowData);
      }
      
      // IMPORTANT: Check for category headers FIRST before filtering irrelevant rows
      // Category headers like "Debt Instruments" might look like irrelevant rows but they're not!
      const categoryName = isCategoryHeader(rowData);
      if (categoryName) {
        currentCategory = categoryName;
        console.log(`📂 Found category: ${categoryName} at row ${r}`, 
          `(had ${Object.values(rowData).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length} non-empty fields)`);
        continue;
      }
      
      // Now check if irrelevant row (subcategories, metadata, etc.)
      if (isIrrelevantRow(rowData)) {
        if (r <= headerRowIndex + 15) {
          console.log(`❌ Skipping irrelevant row ${r}:`, rowData.instrumentName || '(no instrument name)',
            `| Current category: ${currentCategory || 'NONE'}`);
        }
        continue;
      }
      
      // Check if row has valid data (not empty/null)
      if (!hasValidData(rowData)) {
        if (r <= headerRowIndex + 15) {
          console.log(`❌ Skipping empty/invalid data row ${r}:`, rowData.instrumentName || '(no instrument name)',
            `| ISIN: ${rowData.isin || 'NONE'}`,
            `| Current category: ${currentCategory || 'NONE'}`);
        }
        continue;
      }
      
      // Only add if has category and valid data
      if (currentCategory) {
        rowData.instrumentType = currentCategory;
        rowData._sheetName = sheetName;
        sheetData.push(rowData);
        if (sheetData.length <= 5) {
          console.log(`✅ Added row ${r} to category "${currentCategory}":`,
            `ISIN: ${rowData.isin}`,
            `Instrument: ${rowData.instrumentName?.substring(0, 50)}...`);
        }
      } else {
        if (r <= headerRowIndex + 15) {
          console.log(`⚠️  Skipping row ${r} - No category assigned yet.`,
            `ISIN: ${rowData.isin || 'NONE'}`,
            `Instrument: ${rowData.instrumentName || 'NONE'}`);
        }
      }
    }
    
    console.log(`📊 Sheet "${sheetName}" processed: ${sheetData.length} records found (from ${range.e.r - headerRowIndex} rows)`);
    
    processedSheets.push({ 
      sheetName, 
      status: 'Processed', 
      data: sheetData,
      schemeName,
      reportDate
    });
    
    allData.push(...sheetData);
  }
  
  // Use scheme info from first sheet that has it
  const schemeInfo = processedSheets.find(s => s.schemeName) || {};
  
  return {
    schemeName: schemeInfo.schemeName || 'Unknown Scheme',
    reportDate: schemeInfo.reportDate || new Date(),
    data: allData,
    sheets: processedSheets,
    totalSheets: workbook.SheetNames.length
  };
}

module.exports = { parseExcelFile };
