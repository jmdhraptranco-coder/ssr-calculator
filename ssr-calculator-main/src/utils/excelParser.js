import * as XLSX from 'xlsx';

/**
 * Classify a column header into a source type.
 * Returns { sourceType, sourceName } or null if not a data column.
 */
function classifyColumn(header) {
  if (!header || typeof header !== 'string') return null;
  const h = header.trim();
  const hl = h.toLowerCase();

  // Skip non-data columns (empty headers already caught by guard above)
  if (['s.no', 's.no.', 'sl.no', 'sl.no.', 'sno', 'material', 'item code',
       'item name', 'item category', 'category', 'description', 'unit',
       'raw material', 'qty', 'previous ssr', 'prev ssr', 'ssr year'].some(
    (skip) => hl === skip || hl === skip + '.'
  )) return null;

  // Formula / Cost-Plus
  if (/formula|ieema|cost.?plus|calculated/i.test(h))
    return { sourceType: 'Formula/Cost-Plus', sourceName: h };

  // Purchase Order
  if (/\bpo\b|purchase\s*order/i.test(h))
    return { sourceType: 'Purchase Order', sourceName: h };

  // OEM / Budgetary
  if (/budgetary|oem|\bcg\s*power\b|\bsiemens\b|\bge\b|\bhitachi\b|\babb\b|\bmehru\b|\bhpe\b/i.test(h))
    return { sourceType: 'OEM Budgetary Offer', sourceName: h };

  // State Utility SSR
  if (/ssr|aptransco|tgtransco|kptcl|mpptcl|msetcl|bihar|getco|pgcil|utility|state/i.test(h))
    return { sourceType: 'State Utility SSR', sourceName: h };

  // If it contains "price" or looks like a data column, default to SSR
  if (/price|rate|value|cost/i.test(h))
    return { sourceType: 'State Utility SSR', sourceName: h };

  return null;
}

/**
 * Parse a numeric value from a cell (handles comma-formatted strings, empty cells, etc.)
 */
function parseRate(val) {
  if (val == null || val === '') return NaN;
  if (typeof val === 'number') return val > 0 ? val : NaN;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return num > 0 ? num : NaN;
}

/**
 * Detect if a sheet is row-oriented (has explicit Source Type / Rate columns).
 * If not row-oriented, we try column-oriented parsing.
 */
function isRowOriented(rows) {
  if (!rows || rows.length === 0 || !rows[0]) return false;
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  // Row-oriented requires both a source type indicator AND a rate column
  const hasSourceType = keys.some((k) => /^source\s*type$|^tier$/.test(k));
  const hasRate = keys.some((k) => /^rate|^value$/i.test(k));
  return hasSourceType && hasRate;
}

/**
 * Parse column-oriented sheet (items in rows, sources in columns)
 */
function parseColumnOriented(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const totalRows = range.e.r + 1;
  const totalCols = range.e.c + 1;

  // Read all cells
  const grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.v != null ? cell.v : '') : '');
    }
    grid.push(row);
  }

  // Find where header rows end and data rows begin.
  // A data row has at least 1 numeric cell with a value that looks like a rate (> 100).
  // Also count string values that look numeric (e.g. "41,90,400") via parseRate.
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

  // Merge header rows to get full column names
  const colHeaders = [];
  for (let c = 0; c < totalCols; c++) {
    const parts = [];
    for (let r = 0; r < headerEnd; r++) {
      const val = String(grid[r][c] || '').trim();
      if (val && !parts.includes(val)) parts.push(val);
    }
    colHeaders.push(parts.join(' — '));
  }

  // Classify each column
  const colMap = colHeaders.map((h, idx) => {
    const cls = classifyColumn(h);
    return cls ? { ...cls, colIdx: idx } : null;
  }).filter(Boolean);

  // Find Item Code and Item Name columns by header text
  let codeCol = -1;
  let nameCol = -1;
  let prevSSRCol = -1;
  for (let c = 0; c < totalCols; c++) {
    const hl = colHeaders[c].toLowerCase().trim();
    if (hl === 'item code' || hl === 'code') codeCol = c;
    else if (hl === 'item name' || hl === 'item' || hl === 'name' || hl === 'description') nameCol = c;
    else if (/previous\s*ssr|prev\s*ssr/.test(hl)) prevSSRCol = c;
  }

  // Fallback: find item name column by detecting long strings
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

  // Parse data rows
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

    // Extract previous SSR value if column exists
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

  // Remove items with no sources
  const itemList = Object.values(items).filter((item) => item.sources.length > 0);

  return { items: itemList, errors, colMap, totalRows, headerEnd, previousSSR };
}

/**
 * Parse row-oriented sheet (one row per source per item — the template format)
 */
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
    const year = String(row['Year/Date'] || row['year'] || row['Year'] || '').trim();
    const remarks = String(row['Remarks'] || row['remarks'] || '').trim();

    if (!itemCode && !itemName) continue;

    if (isNaN(rate)) {
      errors.push({ row: i + 2, message: `Invalid rate value: "${rateRaw}"` });
      continue;
    }

    const validTypes = ['Purchase Order', 'State Utility SSR', 'OEM Budgetary Offer', 'Formula/Cost-Plus'];
    if (sourceType && !validTypes.includes(sourceType)) {
      errors.push({ row: i + 2, message: `Unknown source type: "${sourceType}"` });
    }

    const key = itemCode || itemName;
    if (!items[key]) {
      items[key] = { code: itemCode, name: itemName, sources: [] };
    }
    items[key].sources.push({
      sourceName,
      sourceType: sourceType || 'State Utility SSR',
      rate,
      year,
      remarks,
    });
  }

  return { items: Object.values(items), errors };
}

export function parseUploadedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });

        let allItems = [];
        let allErrors = [];
        let inlinePreviousSSR = {};
        let format = 'unknown';

        // Process each sheet (except meta sheets)
        for (const sheetName of wb.SheetNames) {
          const lsn = sheetName.toLowerCase();
          if (/instruction|weight|previous|methodology/i.test(lsn)) continue;

          const ws = wb.Sheets[sheetName];
          if (!ws['!ref']) continue;

          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

          // If sheet has explicit Source Type + Rate columns → row-oriented
          if (isRowOriented(rows)) {
            format = 'row';
            const parsed = parseRowOriented(rows);
            allItems.push(...parsed.items);
            allErrors.push(...parsed.errors);
          } else {
            // Try column-oriented parsing first
            const colParsed = parseColumnOriented(ws);
            if (colParsed.items.length > 0) {
              format = 'column';
              allItems.push(...colParsed.items);
              allErrors.push(...colParsed.errors);
              if (colParsed.previousSSR) {
                Object.assign(inlinePreviousSSR, colParsed.previousSSR);
              }
            } else if (rows.length > 0) {
              // Last resort: try row-oriented
              format = 'row';
              const parsed = parseRowOriented(rows);
              allItems.push(...parsed.items);
              allErrors.push(...parsed.errors);
            }
          }
        }

        // Parse previous SSR: merge inline column values + separate sheet
        let previousSSR = { ...inlinePreviousSSR };
        const prevSheet = wb.SheetNames.find((n) => n.toLowerCase().includes('previous'));
        if (prevSheet) {
          const prevRows = XLSX.utils.sheet_to_json(wb.Sheets[prevSheet], { defval: '' });
          for (const row of prevRows) {
            const code = String(row['Item Code'] || '').trim();
            const val = parseRate(row['Previous SSR Value']);
            if (code && !isNaN(val)) {
              previousSSR[code] = { value: val, year: String(row['SSR Year'] || '') };
            }
          }
        }

        // Parse tier weights if present
        const weightSheet = wb.SheetNames.find((n) =>
          n.toLowerCase().includes('weight') || n.toLowerCase().includes('tier')
        );
        let customWeights = null;
        if (weightSheet) {
          const weightRows = XLSX.utils.sheet_to_json(wb.Sheets[weightSheet], { defval: '' });
          customWeights = {};
          for (const row of weightRows) {
            const tier = String(row['Tier'] || '').trim();
            const weight = parseFloat(String(row['Weight (%)'] || row['Weight'] || ''));
            if (tier && !isNaN(weight)) customWeights[tier] = weight;
          }
        }

        resolve({
          items: allItems,
          previousSSR,
          customWeights,
          errors: allErrors,
          format,
          totalRows: allItems.length,
          sheetsProcessed: wb.SheetNames.length,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
