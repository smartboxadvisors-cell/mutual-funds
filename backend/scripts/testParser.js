// Test script to debug Excel parsing
const path = require('path');
const { parseExcelFile } = require('../utils/parseExcel');

// Get file path from command line
const filePath = process.argv[2];

if (!filePath) {
  console.log('❌ Usage: node scripts/testParser.js <path-to-excel-file>');
  console.log('   Example: node scripts/testParser.js "../NIMF-FORTNIGHTLY-PORTFOLIO-15-Sep-25.xls"');
  process.exit(1);
}

console.log('🧪 Testing parser with file:', filePath);
console.log('='.repeat(80));

try {
  const result = parseExcelFile(filePath);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL RESULTS:');
  console.log('='.repeat(80));
  console.log(`Total records extracted: ${result.data.length}`);
  console.log(`Scheme: ${result.schemeName}`);
  console.log(`Date: ${result.reportDate}`);
  console.log(`\nSheets processed: ${result.sheets?.length || 0}`);
  
  if (result.sheets) {
    result.sheets.forEach(sheet => {
      console.log(`  - ${sheet.sheetName}: ${sheet.data.length} records (${sheet.status})`);
    });
  }
  
  if (result.data.length > 0) {
    console.log('\n📝 Sample record (first one):');
    console.log(JSON.stringify(result.data[0], null, 2));
  } else {
    console.log('\n❌ NO DATA EXTRACTED!');
    console.log('Please review the logs above to see why rows were skipped.');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}

