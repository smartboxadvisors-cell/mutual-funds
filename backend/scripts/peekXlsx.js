// Quick inspector for Excel files: lists sheets and prints first rows
const path = require('path');
const XLSX = require('xlsx');

const file = process.argv[2];
const rowsToShow = Number(process.argv[3] || 12);

if (!file) {
  console.error('Usage: node backend/scripts/peekXlsx.js <file> [rows]');
  process.exit(1);
}

const abs = path.resolve(file);
console.log('Inspecting:', abs);
const wb = XLSX.readFile(abs);
console.log('Sheets:', wb.SheetNames);

wb.SheetNames.slice(0, 3).forEach((name, si) => {
  const ws = wb.Sheets[name];
  if (!ws || !ws['!ref']) {
    console.log(`\n[${si}] ${name}: (no data)`);
    return;
  }
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  console.log(`\n[${si}] ${name}: showing first ${Math.min(rowsToShow, json.length)} rows`);
  for (let r = 0; r < Math.min(rowsToShow, json.length); r++) {
    const row = json[r] || [];
    console.log(String(r + 1).padStart(3, ' '), '|', row.map(v => (v === undefined ? '' : String(v))).join(' | '));
  }
});

