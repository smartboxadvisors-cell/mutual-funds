// scripts/debugExcel.js
// Debug script to inspect Excel file structure

const XLSX = require('xlsx');
const path = require('path');

// Get file path from command line argument
const filePath = process.argv[2];

if (!filePath) {
  console.log('❌ Usage: node scripts/debugExcel.js <path-to-excel-file>');
  console.log('   Example: node scripts/debugExcel.js uploads/myfile.xlsx');
  process.exit(1);
}

console.log('🔍 Inspecting Excel file:', filePath);
console.log('='.repeat(80));

try {
  const workbook = XLSX.readFile(filePath);
  
  console.log(`\n📊 Found ${workbook.SheetNames.length} sheets:\n`);
  
  // Inspect first 3 sheets in detail
  const sheetsToInspect = workbook.SheetNames.slice(0, 3);
  
  for (const sheetName of sheetsToInspect) {
    console.log('\n' + '='.repeat(80));
    console.log(`📋 Sheet: "${sheetName}"`);
    console.log('='.repeat(80));
    
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet['!ref']) {
      console.log('❌ Empty sheet (no data range)');
      continue;
    }
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    console.log(`📐 Size: ${range.e.r + 1} rows × ${range.e.c + 1} columns`);
    console.log(`📍 Range: ${worksheet['!ref']}\n`);
    
    // Show first 10 rows
    console.log('📝 First 10 rows:\n');
    
    for (let r = 0; r <= Math.min(9, range.e.r); r++) {
      const rowData = [];
      
      for (let c = 0; c <= Math.min(10, range.e.c); c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[cellAddress];
        
        if (cell) {
          const value = String(cell.v || '').trim();
          const format = cell.z || '';
          
          // Show value and format if it's a percentage
          if (format.includes('%')) {
            rowData.push(`"${value}" [${format}]`);
          } else {
            rowData.push(`"${value}"`);
          }
        } else {
          rowData.push('(empty)');
        }
      }
      
      console.log(`Row ${r}: [${rowData.join(', ')}]`);
    }
    
    // Check for merged cells
    if (worksheet['!merges'] && worksheet['!merges'].length > 0) {
      console.log(`\n⚠️  Warning: This sheet has ${worksheet['!merges'].length} merged cells`);
      console.log('   Merged cells:', worksheet['!merges'].slice(0, 5));
    }
    
    console.log('\n');
  }
  
  console.log('='.repeat(80));
  console.log(`\n💡 Tip: Look for rows that contain column headers like:`);
  console.log('   - "Name of the Instrument", "ISIN", "Rating", "Quantity", etc.');
  console.log('   - Check if headers are in merged cells or split across rows');
  console.log('   - Note which row number contains the headers\n');
  
  if (workbook.SheetNames.length > 3) {
    console.log(`📄 ${workbook.SheetNames.length - 3} more sheets not shown. Inspected first 3 sheets only.\n`);
  }
  
} catch (error) {
  console.error('❌ Error reading Excel file:', error.message);
  console.error(error);
}

