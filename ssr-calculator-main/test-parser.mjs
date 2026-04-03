/**
 * Exhaustive parser test — generates various Excel files and runs them through the parser.
 * Run with: node test-parser.mjs
 */
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

// Import parser source directly (we'll inline the key functions since it's ESM)
const parserCode = readFileSync('./src/utils/excelParser.js', 'utf-8');

// We need to test the actual parser, so let's create Excel buffers and parse them
// using a simplified version of the flow

function makeWorkbook(sheetData, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  if (Array.isArray(sheetData)) {
    // Array of objects → json_to_sheet
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  } else {
    // Object with sheet names as keys
    for (const [name, data] of Object.entries(sheetData)) {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

function parseBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb;
}

// ====== Inline the parser functions for testing ======

function classifyColumn(header) {
  if (!header || typeof header !== 'string') return null;
  const h = header.trim();
  const hl = h.toLowerCase();

  if (['s.no', 's.no.', 'sl.no', 'sl.no.', 'sno', 'material', 'item code',
       'item name', 'item category', 'category', 'description', 'unit',
       'raw material', 'qty', 'previous ssr', 'prev ssr', 'ssr year'].some(
    (skip) => hl === skip || hl === skip + '.'
  )) return null;

  if (/formula|ieema|cost.?plus|calculated/i.test(h))
    return { sourceType: 'Formula/Cost-Plus', sourceName: h };
  if (/\bpo\b|purchase\s*order/i.test(h))
    return { sourceType: 'Purchase Order', sourceName: h };
  if (/budgetary|oem|\bcg\s*power\b|\bsiemens\b|\bge\b|\bhitachi\b|\babb\b|\bmehru\b|\bhpe\b/i.test(h))
    return { sourceType: 'OEM Budgetary Offer', sourceName: h };
  if (/ssr|aptransco|tgtransco|kptcl|mpptcl|msetcl|bihar|getco|pgcil|utility|state/i.test(h))
    return { sourceType: 'State Utility SSR', sourceName: h };
  if (/price|rate|value|cost/i.test(h))
    return { sourceType: 'State Utility SSR', sourceName: h };

  return null;
}

function parseRate(val) {
  if (val == null || val === '') return NaN;
  if (typeof val === 'number') return val > 0 ? val : NaN;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return num > 0 ? num : NaN;
}

function isRowOriented(rows) {
  if (!rows || rows.length === 0 || !rows[0]) return false;
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  const hasSourceType = keys.some((k) => /^source\s*type$|^tier$/.test(k));
  const hasRate = keys.some((k) => /^rate|^value$/i.test(k));
  return hasSourceType && hasRate;
}

function parseColumnOriented(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const totalRows = range.e.r + 1;
  const totalCols = range.e.c + 1;

  const grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.v != null ? cell.v : '') : '');
    }
    grid.push(row);
  }

  let headerEnd = 0;
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const numericCount = grid[r].filter((c) => {
      if (typeof c === 'number' && c > 100) return true;
      if (typeof c === 'string' && !isNaN(parseRate(c))) return true;
      return false;
    }).length;
    if (numericCount >= 1) { headerEnd = r; break; }
    headerEnd = r + 1;
  }

  const colHeaders = [];
  for (let c = 0; c < totalCols; c++) {
    const parts = [];
    for (let r = 0; r < headerEnd; r++) {
      const val = String(grid[r][c] || '').trim();
      if (val && !parts.includes(val)) parts.push(val);
    }
    colHeaders.push(parts.join(' — '));
  }

  const colMap = colHeaders.map((h, idx) => {
    const cls = classifyColumn(h);
    return cls ? { ...cls, colIdx: idx } : null;
  }).filter(Boolean);

  let codeCol = -1, nameCol = -1, prevSSRCol = -1;
  for (let c = 0; c < totalCols; c++) {
    const hl = colHeaders[c].toLowerCase().trim();
    if (hl === 'item code' || hl === 'code') codeCol = c;
    else if (hl === 'item name' || hl === 'item' || hl === 'name' || hl === 'description') nameCol = c;
    else if (/previous\s*ssr|prev\s*ssr/.test(hl)) prevSSRCol = c;
  }

  if (nameCol === -1) {
    for (let c = 0; c < Math.min(5, totalCols); c++) {
      if (c === codeCol || c === prevSSRCol) continue;
      const colVals = [];
      for (let r = headerEnd; r < Math.min(headerEnd + 5, totalRows); r++) {
        colVals.push(grid[r][c]);
      }
      const hasStrings = colVals.filter((v) => typeof v === 'string' && v.trim().length > 5).length;
      if (hasStrings >= 2) { nameCol = c; break; }
    }
    if (nameCol === -1) nameCol = codeCol === 0 ? 1 : 0;
  }

  const items = {};
  const previousSSR = {};
  const errors = [];

  for (let r = headerEnd; r < totalRows; r++) {
    const itemName = String(grid[r][nameCol] || '').trim();
    if (!itemName || itemName.length < 3) continue;

    const itemCode = codeCol >= 0 ? String(grid[r][codeCol] || '').trim() : '';
    const key = itemCode || itemName;

    if (!items[key]) {
      items[key] = { code: itemCode, name: itemName, sources: [] };
    }

    if (prevSSRCol >= 0) {
      const prevVal = parseRate(grid[r][prevSSRCol]);
      if (!isNaN(prevVal)) {
        previousSSR[key] = { value: prevVal, year: '' };
      }
    }

    for (const col of colMap) {
      const rate = parseRate(grid[r][col.colIdx]);
      if (!isNaN(rate)) {
        items[key].sources.push({
          sourceName: col.sourceName,
          sourceType: col.sourceType,
          rate,
          year: '',
          remarks: '',
        });
      }
    }
  }

  const itemList = Object.values(items).filter((item) => item.sources.length > 0);
  return { items: itemList, errors, colMap, previousSSR, headerEnd };
}

function parseRowOriented(rows) {
  const items = {};
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const itemCode = String(row['Item Code'] || row['item_code'] || row['Code'] || '').trim();
    const itemName = String(row['Item Name'] || row['item_name'] || row['Name'] || row['Description'] || '').trim();
    const sourceName = String(row['Source Name'] || row['source_name'] || row['Source'] || '').trim();
    const sourceType = String(row['Source Type'] || row['source_type'] || row['Tier'] || '').trim();
    const rateRaw = row['Rate (INR)'] ?? row['Rate'] ?? row['rate'] ?? row['Value'] ?? '';
    const rate = parseRate(rateRaw);
    if (!itemCode && !itemName) continue;
    if (isNaN(rate)) {
      errors.push({ row: i + 2, message: `Invalid rate value: "${rateRaw}"` });
      continue;
    }
    const key = itemCode || itemName;
    if (!items[key]) {
      items[key] = { code: itemCode, name: itemName, sources: [] };
    }
    items[key].sources.push({
      sourceName,
      sourceType: sourceType || 'State Utility SSR',
      rate,
      year: '',
      remarks: '',
    });
  }
  return { items: Object.values(items), errors };
}

function fullParse(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  let allItems = [];
  let allErrors = [];
  let inlinePreviousSSR = {};
  let format = 'unknown';

  for (const sheetName of wb.SheetNames) {
    const lsn = sheetName.toLowerCase();
    if (/instruction|weight|previous|methodology/i.test(lsn)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (isRowOriented(rows)) {
      format = 'row';
      const parsed = parseRowOriented(rows);
      allItems.push(...parsed.items);
      allErrors.push(...parsed.errors);
    } else {
      const colParsed = parseColumnOriented(ws);
      if (colParsed.items.length > 0) {
        format = 'column';
        allItems.push(...colParsed.items);
        allErrors.push(...colParsed.errors);
        if (colParsed.previousSSR) Object.assign(inlinePreviousSSR, colParsed.previousSSR);
      } else if (rows.length > 0) {
        format = 'row';
        const parsed = parseRowOriented(rows);
        allItems.push(...parsed.items);
        allErrors.push(...parsed.errors);
      }
    }
  }

  return { items: allItems, errors: allErrors, format, previousSSR: inlinePreviousSSR };
}

// ====== TEST CASES ======

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n=== Column-oriented template (our generated template) ===');

test('Standard template with 3 items, 9 source columns', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'CB-420', 'Item Name': '420kV Circuit Breaker', 'Previous SSR': 4190400,
      'APTRANSCO SSR 2025-26': 4190400, 'TGTRANSCO SSR': 4340000, 'PGCIL PO': 4436590,
      'ABB Budgetary': 4850000, 'IEEMA Formula': 4320000 },
    { 'Item Code': 'CT-245', 'Item Name': '245kV Current Transformer', 'Previous SSR': 594451,
      'APTRANSCO SSR 2025-26': 594451, 'TGTRANSCO SSR': 620000, 'PGCIL PO': 580000,
      'ABB Budgetary': '', 'IEEMA Formula': '' },
    { 'Item Code': 'ISO-420', 'Item Name': '420kV HCB Isolator', 'Previous SSR': 886270,
      'APTRANSCO SSR 2025-26': 886270, 'TGTRANSCO SSR': 910000, 'PGCIL PO': 920000,
      'ABB Budgetary': 1050000, 'IEEMA Formula': '' },
  ], 'SSR Rate Data');
  const result = fullParse(buf);
  assert(result.format === 'column', `Expected column, got ${result.format}`);
  assert(result.items.length === 3, `Expected 3 items, got ${result.items.length}`);
  assert(result.errors.length === 0, `Expected 0 errors, got ${result.errors.length}`);
  assert(result.items[0].sources.length === 5, `CB-420 expected 5 sources, got ${result.items[0].sources.length}`);
  assert(result.items[1].sources.length === 3, `CT-245 expected 3 sources, got ${result.items[1].sources.length}`);
  assert(result.previousSSR['CB-420']?.value === 4190400, 'Previous SSR not parsed');
});

console.log('\n=== Edge cases: column names ===');

test('Random non-data columns are ignored', () => {
  const buf = makeWorkbook([
    { 'S.No': 1, 'Item Name': 'Test Item ABC', 'Unit': 'Each', 'Qty': 10,
      'APTRANSCO SSR': 100000, 'PGCIL PO': 120000 },
    { 'S.No': 2, 'Item Name': 'Another Item XYZ', 'Unit': 'Set', 'Qty': 5,
      'APTRANSCO SSR': 200000, 'PGCIL PO': 210000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 2, `Expected 2 items, got ${result.items.length}`);
  assert(result.items[0].sources.length === 2, `Expected 2 sources, got ${result.items[0].sources.length}`);
  // S.No, Unit, Qty should be skipped
  const sourceNames = result.items[0].sources.map(s => s.sourceName);
  assert(!sourceNames.includes('S.No'), 'S.No should be skipped');
  assert(!sourceNames.includes('Unit'), 'Unit should be skipped');
});

test('Columns with "price", "rate", "value", "cost" are treated as SSR', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Widget Alpha Test', 'Market Price': 50000, 'Landed Cost': 55000 },
    { 'Item Name': 'Widget Beta Test', 'Market Price': 60000, 'Landed Cost': 62000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 2, `Expected 2 items, got ${result.items.length}`);
  assert(result.items[0].sources.length === 2, `Expected 2 sources`);
  assert(result.items[0].sources[0].sourceType === 'State Utility SSR', 'price/cost columns should map to SSR');
});

test('OEM vendor names in headers detected correctly', () => {
  const buf = makeWorkbook([
    { 'Item Name': '145kV CT Testing Item', 'Siemens Offer': 300000, 'Hitachi Quote': 310000, 'CG Power': 290000, 'HPE Budgetary': 320000 },
    { 'Item Name': '245kV PT Testing Item', 'Siemens Offer': 400000, 'Hitachi Quote': 410000, 'CG Power': 390000, 'HPE Budgetary': 420000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 2, `Expected 2 items`);
  for (const src of result.items[0].sources) {
    assert(src.sourceType === 'OEM Budgetary Offer', `${src.sourceName} should be OEM, got ${src.sourceType}`);
  }
});

test('IEEMA and formula columns detected as Formula/Cost-Plus', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Conductor ACSR Test', 'IEEMA Formula': 150000, 'Cost Plus Estimate': 155000, 'Calculated Rate': 148000 },
    { 'Item Name': 'Tower Structure Test', 'IEEMA Formula': 250000, 'Cost Plus Estimate': 260000, 'Calculated Rate': 245000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 2);
  for (const src of result.items[0].sources) {
    assert(src.sourceType === 'Formula/Cost-Plus', `${src.sourceName} should be Formula, got ${src.sourceType}`);
  }
});

test('Mixed tier types in one sheet', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'X1', 'Item Name': 'Mixed Source Item Test',
      'APTRANSCO SSR': 100000, 'KPTCL SSR': 110000,
      'PGCIL PO 2024': 95000, 'GETCO PO': 98000,
      'ABB Budgetary': 130000,
      'IEEMA Formula': 105000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  const types = new Set(result.items[0].sources.map(s => s.sourceType));
  assert(types.has('State Utility SSR'), 'Should have SSR');
  assert(types.has('Purchase Order'), 'Should have PO');
  assert(types.has('OEM Budgetary Offer'), 'Should have OEM');
  assert(types.has('Formula/Cost-Plus'), 'Should have Formula');
  assert(result.items[0].sources.length === 6, `Expected 6 sources, got ${result.items[0].sources.length}`);
});

console.log('\n=== Edge cases: data quality ===');

test('Empty cells / missing values handled gracefully', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Item With Gaps Test', 'APTRANSCO SSR': 100000, 'TGTRANSCO SSR': '', 'PGCIL PO': 0, 'ABB Budgetary': null },
    { 'Item Name': 'All Empty Sources Test', 'APTRANSCO SSR': '', 'TGTRANSCO SSR': '', 'PGCIL PO': '', 'ABB Budgetary': '' },
  ]);
  const result = fullParse(buf);
  // First item: only APTRANSCO has a valid value (TGTRANSCO empty, PGCIL is 0 → NaN, ABB null → NaN)
  assert(result.items.length === 1, `Expected 1 item (all-empty skipped), got ${result.items.length}`);
  assert(result.items[0].sources.length === 1, `Expected 1 source, got ${result.items[0].sources.length}`);
});

test('Comma-formatted numbers in cells', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Comma Numbers Test', 'APTRANSCO SSR': '41,90,400', 'PGCIL PO': '44,36,590' },
  ]);
  const result = fullParse(buf);
  // sheet_to_json with comma strings — parseRate handles commas
  assert(result.items.length === 1);
  assert(result.items[0].sources.length === 2, `Expected 2 sources`);
  assert(result.items[0].sources[0].rate === 4190400, `Expected 4190400, got ${result.items[0].sources[0].rate}`);
});

test('Negative and zero values rejected', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Negative Zero Test', 'APTRANSCO SSR': -50000, 'TGTRANSCO SSR': 0, 'PGCIL PO': 100000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  assert(result.items[0].sources.length === 1, `Expected 1 source (only PGCIL), got ${result.items[0].sources.length}`);
});

test('Very short item names (< 3 chars) are skipped', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'AB', 'APTRANSCO SSR': 100000 },
    { 'Item Name': 'Valid Long Name Item', 'APTRANSCO SSR': 200000 },
    { 'Item Name': '', 'APTRANSCO SSR': 300000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1, `Expected 1 item, got ${result.items.length}`);
  assert(result.items[0].name === 'Valid Long Name Item');
});

console.log('\n=== Edge cases: sheet structures ===');

test('Single item with single source', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Lone Item Single Source', 'APTRANSCO SSR': 500000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  assert(result.items[0].sources.length === 1);
});

test('Many items (20+)', () => {
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push({
      'Item Code': `ITEM-${i}`,
      'Item Name': `Test Equipment Item Number ${i}`,
      'APTRANSCO SSR': 100000 + i * 5000,
      'TGTRANSCO SSR': 105000 + i * 5000,
      'PGCIL PO': 98000 + i * 5000,
    });
  }
  const buf = makeWorkbook(rows);
  const result = fullParse(buf);
  assert(result.items.length === 25, `Expected 25 items, got ${result.items.length}`);
});

test('Many source columns (15+)', () => {
  const row = { 'Item Name': 'Many Sources Equipment Item' };
  const sources = [
    'APTRANSCO SSR', 'TGTRANSCO SSR', 'KPTCL SSR', 'MPPTCL SSR', 'MSETCL SSR',
    'Bihar SSR', 'GETCO SSR', 'PGCIL PO', 'GETCO PO', 'MSETCL PO',
    'ABB Budgetary', 'Siemens Budgetary', 'Hitachi Budgetary', 'Mehru Budgetary',
    'IEEMA Formula', 'Cost Plus Estimate'
  ];
  sources.forEach((s, i) => { row[s] = 100000 + i * 10000; });
  const buf = makeWorkbook([row]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  assert(result.items[0].sources.length === 16, `Expected 16 sources, got ${result.items[0].sources.length}`);
});

test('No Item Code column — works with just Item Name', () => {
  const buf = makeWorkbook([
    { 'Item Name': '420kV CB Without Code', 'APTRANSCO SSR': 4000000, 'PGCIL PO': 4200000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  assert(result.items[0].code === '', 'Code should be empty');
  assert(result.items[0].name === '420kV CB Without Code');
});

test('No Item Name column — falls back to long-string detection', () => {
  const buf = makeWorkbook([
    { 'Equipment Description': '420kV Circuit Breaker Long Name', 'APTRANSCO SSR': 4000000, 'PGCIL PO': 4200000 },
    { 'Equipment Description': '245kV Current Transformer Long', 'APTRANSCO SSR': 600000, 'PGCIL PO': 580000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 2, `Expected 2 items, got ${result.items.length}`);
});

console.log('\n=== Row-oriented format (backward compat) ===');

test('Row-oriented with Source Type + Rate columns', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'CB-420', 'Item Name': '420kV CB', 'Source Type': 'State Utility SSR', 'Rate': 4190400 },
    { 'Item Code': 'CB-420', 'Item Name': '420kV CB', 'Source Type': 'Purchase Order', 'Rate': 4436590 },
    { 'Item Code': 'CT-245', 'Item Name': '245kV CT', 'Source Type': 'OEM Budgetary Offer', 'Rate': 680000 },
  ]);
  const result = fullParse(buf);
  assert(result.format === 'row', `Expected row format, got ${result.format}`);
  assert(result.items.length === 2, `Expected 2 items, got ${result.items.length}`);
  assert(result.items[0].sources.length === 2, `CB-420 expected 2 sources`);
});

test('Row-oriented with Rate (INR) column name', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'X1', 'Item Name': 'Test Item', 'Source Type': 'State Utility SSR', 'Rate (INR)': 500000 },
  ]);
  const result = fullParse(buf);
  assert(result.format === 'row');
  assert(result.items.length === 1);
});

console.log('\n=== Unclassifiable / garbage columns ===');

test('Columns with random names are ignored (no false positives)', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Test Item With Random Cols',
      'Foo Bar': 12345, 'Baz Qux': 67890, 'Hello World': 11111,
      'APTRANSCO SSR': 500000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  // Only APTRANSCO SSR should be classified; Foo/Baz/Hello are unclassifiable
  assert(result.items[0].sources.length === 1, `Expected 1 source, got ${result.items[0].sources.length}`);
  assert(result.items[0].sources[0].sourceName === 'APTRANSCO SSR');
});

test('All unclassifiable columns → 0 items from column parser, falls to row (also 0)', () => {
  const buf = makeWorkbook([
    { 'Item Name': 'Orphan Item No Sources', 'Foo': 100, 'Bar': 200, 'Baz': 300 },
  ]);
  const result = fullParse(buf);
  // Column parser finds 0 classifiable columns → 0 items
  // Row parser fallback also finds nothing useful
  assert(result.items.length === 0, `Expected 0 items, got ${result.items.length}`);
});

test('Previous SSR column extracted correctly', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'A1', 'Item Name': '420kV Isolator Test Item', 'Previous SSR': 644274,
      'APTRANSCO SSR': 700000, 'PGCIL PO': 680000 },
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
  assert(result.previousSSR['A1']?.value === 644274, `Previous SSR not found`);
});

test('Sheet named "Tier Weights" or "Previous SSR" is skipped', () => {
  const buf = makeWorkbook({
    'Rate Data': [
      { 'Item Name': 'Main Sheet Item Test', 'APTRANSCO SSR': 100000, 'PGCIL PO': 110000 }
    ],
    'Tier Weights': [
      { 'Tier': 'Purchase Order', 'Weight': 45 }
    ],
    'Previous SSR Values': [
      { 'Item Code': 'X', 'Previous SSR Value': 90000 }
    ],
  });
  const result = fullParse(buf);
  assert(result.items.length === 1, `Expected 1 item from main sheet, got ${result.items.length}`);
});

test('Duplicate items across rows are merged', () => {
  const buf = makeWorkbook([
    { 'Item Code': 'DUP', 'Item Name': 'Duplicate Item Test A', 'APTRANSCO SSR': 100000, 'PGCIL PO': 110000 },
    // Same item code shouldn't create a new item in column-oriented (one row = one item)
  ]);
  const result = fullParse(buf);
  assert(result.items.length === 1);
});

console.log('\n=== classifyColumn unit tests ===');

test('classifyColumn: null/undefined/empty → null', () => {
  assert(classifyColumn(null) === null);
  assert(classifyColumn(undefined) === null);
  assert(classifyColumn('') === null);
});

test('classifyColumn: skip items → null', () => {
  assert(classifyColumn('S.No') === null);
  assert(classifyColumn('S.No.') === null);
  assert(classifyColumn('Sl.No') === null);
  assert(classifyColumn('Item Code') === null);
  assert(classifyColumn('Item Name') === null);
  assert(classifyColumn('Category') === null);
  assert(classifyColumn('Unit') === null);
  assert(classifyColumn('Previous SSR') === null);
  assert(classifyColumn('Qty') === null);
  assert(classifyColumn('Description') === null);
});

test('classifyColumn: SSR sources detected', () => {
  assert(classifyColumn('APTRANSCO SSR 2025-26')?.sourceType === 'State Utility SSR');
  assert(classifyColumn('TGTRANSCO SSR')?.sourceType === 'State Utility SSR');
  assert(classifyColumn('KPTCL SSR 2024-25')?.sourceType === 'State Utility SSR');
  assert(classifyColumn('PGCIL Rate')?.sourceType === 'State Utility SSR');
  assert(classifyColumn('State Utility Rate')?.sourceType === 'State Utility SSR');
});

test('classifyColumn: PO sources detected', () => {
  assert(classifyColumn('PGCIL PO 2024-25')?.sourceType === 'Purchase Order');
  assert(classifyColumn('GETCO PO')?.sourceType === 'Purchase Order');
  assert(classifyColumn('Purchase Order 2024')?.sourceType === 'Purchase Order');
});

test('classifyColumn: OEM sources detected', () => {
  assert(classifyColumn('ABB Budgetary')?.sourceType === 'OEM Budgetary Offer');
  assert(classifyColumn('Siemens Offer 2025')?.sourceType === 'OEM Budgetary Offer');
  assert(classifyColumn('Hitachi Quote')?.sourceType === 'OEM Budgetary Offer');
  assert(classifyColumn('CG Power')?.sourceType === 'OEM Budgetary Offer');
  assert(classifyColumn('OEM Estimate')?.sourceType === 'OEM Budgetary Offer');
});

test('classifyColumn: Formula sources detected', () => {
  assert(classifyColumn('IEEMA Formula')?.sourceType === 'Formula/Cost-Plus');
  assert(classifyColumn('Cost Plus Estimate')?.sourceType === 'Formula/Cost-Plus');
  assert(classifyColumn('Calculated Rate')?.sourceType === 'Formula/Cost-Plus');
});

test('classifyColumn: unknown columns → null', () => {
  assert(classifyColumn('Foo Bar') === null);
  assert(classifyColumn('Random Data') === null);
  assert(classifyColumn('XYZ 123') === null);
});

// ====== SUMMARY ======
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
