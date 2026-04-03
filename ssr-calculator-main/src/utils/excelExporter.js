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
