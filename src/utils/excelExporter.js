import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export function generateTemplate() {
  const wb = XLSX.utils.book_new();

  // Single sheet: column-oriented — items in rows, sources as columns
  const data = [
    {
      'Item Code': 'CB-420-PIR',
      'Item Name': '420kV Circuit Breaker with PIR',
      'Previous SSR': 4190400,
      'APTRANSCO SSR 2025-26': 4190400,
      'TGTRANSCO SSR 2025-26': 4340000,
      'KPTCL SSR 2025-26': 4050000,
      'PGCIL PO 2024-25': 4436590,
      'GETCO PO 2024-25': 4280000,
      'MSETCL PO 2024': 4510000,
      'ABB Budgetary 2025': 4850000,
      'Siemens Budgetary 2025': 5100000,
      'IEEMA Formula': 4320000,
    },
    {
      'Item Code': 'CT-245',
      'Item Name': '245kV Current Transformer (Oil-filled)',
      'Previous SSR': 594451,
      'APTRANSCO SSR 2025-26': 594451,
      'TGTRANSCO SSR 2025-26': 620000,
      'KPTCL SSR 2025-26': '',
      'PGCIL PO 2024-25': 580000,
      'GETCO PO 2024-25': '',
      'MSETCL PO 2024': '',
      'ABB Budgetary 2025': '',
      'Siemens Budgetary 2025': '',
      'IEEMA Formula': '',
    },
    {
      'Item Code': 'ISO-420-HCB',
      'Item Name': '420kV HCB Isolator with Earth Switch',
      'Previous SSR': 886270,
      'APTRANSCO SSR 2025-26': 886270,
      'TGTRANSCO SSR 2025-26': 910000,
      'KPTCL SSR 2025-26': 860000,
      'PGCIL PO 2024-25': 920000,
      'GETCO PO 2024-25': '',
      'MSETCL PO 2024': '',
      'ABB Budgetary 2025': 1050000,
      'Siemens Budgetary 2025': '',
      'IEEMA Formula': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 15 },  // Item Code
    { wch: 42 },  // Item Name
    { wch: 14 },  // Previous SSR
    { wch: 22 },  // APTRANSCO SSR
    { wch: 22 },  // TGTRANSCO SSR
    { wch: 18 },  // KPTCL SSR
    { wch: 18 },  // PGCIL PO
    { wch: 18 },  // GETCO PO
    { wch: 18 },  // MSETCL PO
    { wch: 20 },  // ABB Budgetary
    { wch: 22 },  // Siemens Budgetary
    { wch: 16 },  // IEEMA Formula
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'SSR Rate Data');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'SSR_Rate_Data_Template.xlsx');
}

export function exportResults(results, tierWeights, items) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: SSR Summary
  const summaryData = results.map((r) => ({
    'Item Code': r.code,
    'Item Name': r.name,
    'Category': r.category || '',
    'Final SSR Value': Math.round(r.finalValue),
    'Selected Method': r.selectedMethod || 'Tiered Weighted Blend',
    'Previous SSR': r.previousSSR?.value || '',
    '% Change': r.previousSSR?.value
      ? (((r.finalValue - r.previousSSR.value) / r.previousSSR.value) * 100).toFixed(1) + '%'
      : '',
    'Selection Justification': r.overrideReason || '',
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws1, 'SSR Summary');

  // Sheet 2: Detailed Calculations
  const detailData = results.flatMap((r) => {
    const row = { 'Item Code': r.code, 'Item Name': r.name };
    if (r.allMethods) {
      for (const [key, val] of Object.entries(r.allMethods)) {
        row[key] = val != null ? Math.round(val) : '';
      }
    }
    row['Tiered Weighted Value'] = Math.round(r.finalValue);
    row['CV%'] = r.cv?.toFixed(1) || '';
    row['Total Sources'] = r.totalSources || '';
    return [row];
  });
  const ws2 = XLSX.utils.json_to_sheet(detailData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Detailed Calculations');

  // Sheet 3: Source Data
  const sourceData = items.flatMap((item) =>
    item.sources.map((s) => ({
      'Item Code': item.code,
      'Item Name': item.name,
      'Source Name': s.sourceName,
      'Source Type': s.sourceType,
      'Rate (INR)': s.rate,
      'Year': s.year,
      'Remarks': s.remarks,
    }))
  );
  const ws3 = XLSX.utils.json_to_sheet(sourceData);
  XLSX.utils.book_append_sheet(wb, ws3, 'Source Data');

  // Sheet 4: Methodology Note
  const methodology = [
    { Note: 'SSR Rate Calculation Methodology' },
    { Note: `Date of Analysis: ${new Date().toLocaleDateString('en-IN')}` },
    { Note: '' },
    { Note: 'Tier Weights Applied:' },
    ...Object.entries(tierWeights).map(([tier, w]) => ({ Note: `  ${tier}: ${w}%` })),
    { Note: '' },
    { Note: 'Statistical Methods: Simple Mean, Median, Trimmed Mean (10%), Winsorized Mean (10%), IQM, Hodges-Lehmann, Huber M-Estimator, MAD-Filtered Mean' },
    { Note: 'Outlier Detection: MAD-based with threshold of 2.5 scaled MAD units' },
    { Note: 'Within-tier Estimation: Hodges-Lehmann estimator (default)' },
    { Note: 'Software: APTRANSCO SSR Rate Calculator v1.0' },
  ];
  const ws4 = XLSX.utils.json_to_sheet(methodology);
  XLSX.utils.book_append_sheet(wb, ws4, 'Methodology Note');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'SSR_Calculation_Results.xlsx');
}

export function exportManualEntryResults({ itemName, matchedItem, sources, validSources, tierWeights, analysis }) {
  if (!analysis) return;

  const wb = XLSX.utils.book_new();
  const title = itemName || matchedItem?.name || 'Manual Entry';
  const generatedOn = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  // ── Sheet 1: SSR Report (structured sections) ──────────────────────────────
  const rows = [];

  const blank = { A: '' };
  const row = (...cells) => {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    return Object.fromEntries(cells.map((v, i) => [keys[i], v ?? '']));
  };
  const header = (label) => row(`── ${label} ──`);

  // Title block
  rows.push(row('APTRANSCO — SSR Manual Entry Report', '', '', '', '', '', 'FY 2026-27'));
  rows.push(row('Schedule of Rates Analysis'));
  rows.push(blank);
  rows.push(row('Item Name', title));
  rows.push(row('Item Code', matchedItem?.code || 'MANUAL'));
  rows.push(row('Category', matchedItem?.category || '—'));
  rows.push(row('Voltage Level', matchedItem?.voltageLevel || '—'));
  rows.push(row('Generated On', generatedOn));
  rows.push(blank);

  // Final result
  rows.push(header('RECOMMENDED SSR RATE'));
  rows.push(row('Tiered Weighted SSR (Final)', Math.round(analysis.tiered.finalValue)));
  if (matchedItem?.previousSSR?.value != null) {
    const prev = matchedItem.previousSSR.value;
    const pct = ((analysis.tiered.finalValue - prev) / prev) * 100;
    rows.push(row(`Previous SSR (${matchedItem.previousSSR.year})`, Math.round(prev)));
    rows.push(row('Change (%)', `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`));
  }
  rows.push(blank);

  // Summary stats
  rows.push(header('SUMMARY STATISTICS'));
  rows.push(row('Total Sources Entered', sources.length));
  rows.push(row('Active Sources (used in calc)', validSources.length));
  rows.push(row('Excluded Sources', sources.filter((s) => s.excluded).length));
  rows.push(row('Tiers Represented', analysis.tiered.tierBreakdown.length));
  const cvVal = analysis.cv;
  const spreadLabel = cvVal <= 15 ? 'Low' : cvVal <= 40 ? 'Moderate' : cvVal <= 60 ? 'High' : 'Very High';
  rows.push(row('Coefficient of Variation (CV%)', `${cvVal.toFixed(1)}%`));
  rows.push(row('Data Spread Quality', spreadLabel));
  rows.push(blank);

  // Tier weights
  rows.push(header('TIER WEIGHTS APPLIED'));
  rows.push(row('Tier', 'Weight (%)'));
  for (const [tier, weight] of Object.entries(tierWeights)) {
    if (weight > 0) rows.push(row(tier, weight));
  }
  rows.push(blank);

  // Tier contributions
  rows.push(header('TIER CONTRIBUTIONS'));
  rows.push(row('Tier', 'Sources', 'Weight (%)', 'Tier Estimate (INR)', 'Contribution (INR)'));
  for (const tb of analysis.tiered.tierBreakdown) {
    rows.push(row(
      tb.tier,
      tb.sources.length,
      `${(tb.weight * 100).toFixed(0)}%`,
      Math.round(tb.estimate),
      Math.round(tb.contribution),
    ));
  }
  const formulaParts = analysis.tiered.tierBreakdown
    .map((tb) => `${(tb.weight * 100).toFixed(0)}% × ₹${Math.round(tb.estimate).toLocaleString('en-IN')}`)
    .join(' + ');
  rows.push(row('Formula', formulaParts));
  rows.push(row('Final Value', Math.round(analysis.tiered.finalValue)));
  rows.push(blank);

  // Method comparison
  rows.push(header('STATISTICAL METHOD COMPARISON'));
  rows.push(row('Method', 'Value (INR)', 'Difference from Tiered Blend', 'Difference (%)'));
  const finalVal = analysis.tiered.finalValue;
  for (const [key, val] of Object.entries(analysis.allMethods)) {
    if (val == null) continue;
    const diff = val - finalVal;
    const diffPct = (diff / finalVal) * 100;
    rows.push(row(
      key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim(),
      Math.round(val),
      Math.round(diff),
      `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%`,
    ));
  }
  rows.push(row('Tiered Weighted Blend (Recommended)', Math.round(finalVal), 0, '0.0%'));
  rows.push(blank);

  // Diagnostics
  rows.push(header('DIAGNOSTICS'));
  if (analysis.tiered.diagnostics.flags.length) {
    for (const flag of analysis.tiered.diagnostics.flags) rows.push(row('⚠ ' + flag));
  } else {
    rows.push(row('✓ No diagnostic flags raised.'));
  }
  rows.push(blank);

  // Source data
  rows.push(header('SOURCE DATA'));
  rows.push(row('#', 'Source Name', 'Source Type / Tier', 'Rate (INR)', 'Year', 'Status', 'Remarks'));
  sources.forEach((s, i) => {
    const rate = parseFloat(String(s.rate).replace(/,/g, ''));
    rows.push(row(
      i + 1,
      s.sourceName || '—',
      s.sourceType,
      Number.isFinite(rate) ? Math.round(rate) : s.rate || '—',
      s.year || '—',
      s.excluded ? 'Excluded' : 'Included',
      s.remarks || '',
    ));
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], skipHeader: true });
  ws['!cols'] = [{ wch: 36 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'SSR Report');

  const fileBase = title.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 55) || 'Manual_Entry';
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `${fileBase}_SSR_Report.xlsx`);
}
