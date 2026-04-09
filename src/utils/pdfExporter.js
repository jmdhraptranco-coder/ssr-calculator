import { formatPercent, getMethodDisplayName } from './formatters';

const TIER_COLORS_HEX = {
  'State Utility SSR': '#1d4ed8',
  'Purchase Order': '#15803d',
  'OEM Budgetary': '#b45309',
  'Formula Based': '#7c3aed',
  'Historical': '#64748b',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtINR(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return '₹\u202F' + Math.round(value).toLocaleString('en-IN');
}

function safeFileName(name) {
  return (name || 'Manual_Entry')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'Manual_Entry';
}

function tierBadge(tier) {
  const color = TIER_COLORS_HEX[tier] || '#64748b';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;color:#fff;background:${color}">${esc(tier)}</span>`;
}

export function exportManualEntryPdf({ itemName, matchedItem, sources, validSources, tierWeights, analysis, calculationSettings = {} }) {
  if (!analysis) return;

  const title = itemName || matchedItem?.name || 'Manual Entry';
  const generatedOn = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  const pctChange = matchedItem?.previousSSR?.value != null
    ? ((analysis.tiered.finalValue - matchedItem.previousSSR.value) / matchedItem.previousSSR.value) * 100
    : null;

  // Method rows
  const methodRows = Object.entries(analysis.allMethods)
    .filter(([, v]) => v != null)
    .map(([key, val]) => `
      <tr>
        <td>${esc(getMethodDisplayName(key))}</td>
        <td class="num">${fmtINR(val)}</td>
        <td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${Math.round((val / analysis.tiered.finalValue) * 100)}%;background:#93c5fd"></div></div></td>
      </tr>`)
    .join('');

  // Tier rows
  const tierRows = analysis.tiered.tierBreakdown.map((tb) => `
    <tr>
      <td>${tierBadge(tb.tier)}</td>
      <td class="num">${tb.sources.length}</td>
      <td class="num">${(tb.weight * 100).toFixed(0)}%</td>
      <td class="num">${fmtINR(tb.estimate)}</td>
      <td class="num"><strong>${fmtINR(tb.contribution)}</strong></td>
    </tr>`).join('');

  // Source rows
  const sourceRows = sources.map((s, i) => {
    const rate = parseFloat(String(s.rate).replace(/,/g, ''));
    return `
    <tr class="${s.excluded ? 'excluded-row' : ''}">
      <td class="num">${i + 1}</td>
      <td>${esc(s.sourceName || '—')}</td>
      <td>${tierBadge(s.sourceType)}</td>
      <td class="num">${Number.isFinite(rate) ? fmtINR(rate) : esc(s.rate || '—')}</td>
      <td class="num">${esc(s.year || '—')}</td>
      <td>${s.excluded ? '<span class="chip-red">Excluded</span>' : '<span class="chip-green">Included</span>'}</td>
      <td class="small-text">${esc(s.remarks || '—')}</td>
    </tr>`;
  }).join('');

  // Formula line
  const formulaLine = analysis.tiered.tierBreakdown
    .map((tb) => `${(tb.weight * 100).toFixed(0)}% × ${fmtINR(tb.estimate)}`)
    .join(' + ');

  const baseValue = calculationSettings.baseValue ?? analysis.tiered.baseValue ?? analysis.tiered.finalValue;
  const pvFactor = calculationSettings.pvFactor ?? analysis.tiered.pvFactor ?? 1;
  const closingMode = calculationSettings.closingMode || analysis.tiered.closingModeApplied || 'sumP2overP';

  const flagsHtml = analysis.tiered.diagnostics.flags.length
    ? `<ul class="flag-list">${analysis.tiered.diagnostics.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '<p class="no-flags">No diagnostic flags raised.</p>';

  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Pop-up blocked. Please allow pop-ups for this site to export PDF.');

  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>SSR Report — ${esc(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#0f172a;background:#fff;padding:0}

    /* ── Page header ── */
    .page-header{background:#00529B;color:#fff;padding:18px 28px 14px;display:flex;align-items:center;justify-content:space-between}
    .page-header .org{font-size:16px;font-weight:700;letter-spacing:.3px}
    .page-header .sub{font-size:10px;opacity:.8;margin-top:2px}
    .page-header .report-label{font-size:10px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:4px;font-weight:600}

    /* ── Hero banner ── */
    .hero{background:#eff6ff;border-left:5px solid #00529B;padding:14px 28px;margin:0}
    .hero h1{font-size:18px;font-weight:700;color:#00529B}
    .hero .meta{display:flex;gap:32px;margin-top:8px;flex-wrap:wrap}
    .hero .meta span{font-size:11px;color:#475569}
    .hero .meta strong{color:#0f172a}
    .hero .final-value{margin-top:10px;font-size:28px;font-weight:800;color:#00529B}
    .hero .final-label{font-size:10px;color:#64748b;margin-top:2px}

    /* ── Change badge ── */
    .change-pos{color:#15803d;font-weight:600}
    .change-neg{color:#b91c1c;font-weight:600}
    .change-neutral{color:#92400e;font-weight:600}

    /* ── Content area ── */
    .content{padding:18px 28px;display:flex;flex-direction:column;gap:18px}

    /* ── Section card ── */
    .section{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
    .section-title{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#475569}

    /* ── Two-col layout ── */
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px}

    /* ── Tables ── */
    table{width:100%;border-collapse:collapse}
    th,td{padding:7px 10px;text-align:left;font-size:11px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    th{background:#f8fafc;font-weight:600;color:#374151;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#fafafa}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .excluded-row td{opacity:.5;text-decoration:line-through}

    /* ── Bar cells ── */
    .bar-cell{width:120px}
    .bar-bg{background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden}
    .bar-fill{height:8px;border-radius:4px}

    /* ── Chips ── */
    .chip-green{background:#dcfce7;color:#15803d;padding:1px 7px;border-radius:9999px;font-size:10px;font-weight:600}
    .chip-red{background:#fee2e2;color:#b91c1c;padding:1px 7px;border-radius:9999px;font-size:10px;font-weight:600}
    .small-text{font-size:10px;color:#64748b}

    /* ── Formula box ── */
    .formula-box{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;padding:10px 14px;margin:10px 14px 14px;font-family:'Courier New',monospace;font-size:11px;color:#334155}
    .formula-result{font-size:13px;font-weight:800;color:#00529B;margin-top:4px}

    /* ── Flags ── */
    .flag-list{list-style:none;padding:10px 14px}
    .flag-list li{padding:4px 0;padding-left:18px;position:relative;color:#92400e;font-size:11px}
    .flag-list li::before{content:"⚠";position:absolute;left:0}
    .no-flags{padding:10px 14px;color:#64748b;font-size:11px}

    /* ── Summary key-value list ── */
    .kv-list{padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}
    .kv-list .kv{display:flex;flex-direction:column}
    .kv-list .kv .k{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .kv-list .kv .v{font-size:12px;font-weight:600;color:#0f172a;margin-top:1px}

    /* ── Footer ── */
    .page-footer{border-top:1px solid #e2e8f0;padding:10px 28px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:8px}

    /* ── Print ── */
    @media print{
      @page{margin:12mm 14mm;size:A4}
      .section{break-inside:avoid}
      .two-col{break-inside:avoid}
      body{padding:0}
    }
  </style>
</head>
<body>

<div class="page-header">
  <div>
    <div class="org">APTRANSCO — Transmission Corporation of Andhra Pradesh</div>
    <div class="sub">Schedule of Rates (SSR) Analysis Report · FY 2026-27</div>
  </div>
  <div class="report-label">Manual Entry Report</div>
</div>

<div class="hero">
  <h1>${esc(title)}</h1>
  <div class="meta">
    <span>Code: <strong>${esc(matchedItem?.code || 'MANUAL')}</strong></span>
    <span>Category: <strong>${esc(matchedItem?.category || '—')}</strong></span>
    ${matchedItem?.voltageLevel ? `<span>Voltage: <strong>${esc(matchedItem.voltageLevel)}</strong></span>` : ''}
    <span>Generated: <strong>${esc(generatedOn)}</strong></span>
  </div>
  <div class="final-value">${fmtINR(analysis.tiered.finalValue)}</div>
  <div class="final-label">Tiered Weighted SSR — Recommended Rate</div>
  ${pctChange != null ? `
  <div style="margin-top:6px;font-size:11px">
    vs Previous SSR (${esc(matchedItem.previousSSR.year)}): ${fmtINR(matchedItem.previousSSR.value)}
    &nbsp;<span class="${Math.abs(pctChange) <= 15 ? 'change-pos' : Math.abs(pctChange) <= 30 ? 'change-neutral' : 'change-neg'}">
      ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%
    </span>
  </div>` : ''}
</div>

<div class="content">

  <div class="two-col">

    <div class="section">
      <div class="section-title">Summary</div>
      <div class="kv-list">
        <div class="kv"><span class="k">Valid Sources</span><span class="v">${validSources.length} of ${sources.length}</span></div>
        <div class="kv"><span class="k">Tiers Covered</span><span class="v">${analysis.tiered.tierBreakdown.length}</span></div>
        <div class="kv"><span class="k">Coeff. of Variation</span><span class="v" style="color:${analysis.cv > 60 ? '#b91c1c' : analysis.cv > 40 ? '#b45309' : '#15803d'}">${formatPercent(analysis.cv)}</span></div>
        <div class="kv"><span class="k">Data Spread</span><span class="v">${analysis.cv <= 15 ? 'Low' : analysis.cv <= 40 ? 'Moderate' : analysis.cv <= 60 ? 'High' : 'Very High'}</span></div>
        <div class="kv"><span class="k">Previous SSR</span><span class="v">${matchedItem?.previousSSR ? fmtINR(matchedItem.previousSSR.value) : '—'}</span></div>
        <div class="kv"><span class="k">Previous Year</span><span class="v">${matchedItem?.previousSSR?.year || '—'}</span></div>
        <div class="kv"><span class="k">Closing Mode</span><span class="v">${esc(closingMode)}</span></div>
        <div class="kv"><span class="k">PV Factor</span><span class="v">${esc(pvFactor)}</span></div>
        <div class="kv"><span class="k">Base Value</span><span class="v">${fmtINR(baseValue)}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Tier Weights Applied</div>
      <div style="padding:10px 14px">
        ${Object.entries(tierWeights).filter(([,w]) => w > 0).map(([tier, w]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
            ${tierBadge(tier)}
            <div style="flex:1;background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
              <div style="width:${w}%;height:8px;border-radius:4px;background:${TIER_COLORS_HEX[tier] || '#64748b'}"></div>
            </div>
            <span style="font-weight:700;font-size:11px;width:32px;text-align:right">${w}%</span>
          </div>`).join('')}
      </div>
    </div>

  </div>

  <div class="section">
    <div class="section-title">Tier Contributions</div>
    <table>
      <thead><tr><th>Tier</th><th class="num">Sources</th><th class="num">Weight</th><th class="num">Tier Estimate</th><th class="num">Contribution</th></tr></thead>
      <tbody>${tierRows}</tbody>
    </table>
    <div class="formula-box">
      SSR = ${esc(formulaLine)}
      <div class="small-text" style="margin-top:6px">Final SSR = Base Closing Value × PV Factor = ${fmtINR(baseValue)} × ${esc(pvFactor)}</div>
      <div class="formula-result">= ${fmtINR(analysis.tiered.finalValue)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Statistical Method Comparison</div>
    <table>
      <thead><tr><th>Method</th><th class="num">Value</th><th class="bar-cell">Distribution</th></tr></thead>
      <tbody>
        ${methodRows}
        <tr style="background:#eff6ff">
          <td><strong>Tiered Weighted Blend</strong></td>
          <td class="num"><strong>${fmtINR(analysis.tiered.finalValue)}</strong></td>
          <td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:100%;background:#00529B"></div></div></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Source Data (${sources.length} entries · ${validSources.length} active)</div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Source Name</th>
          <th>Type / Tier</th>
          <th class="num">Rate (INR)</th>
          <th class="num">Year</th>
          <th>Status</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>${sourceRows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Diagnostics</div>
    ${flagsHtml}
  </div>

</div>

<div class="page-footer">
  <span>APTRANSCO SSR Rate Calculator · FY 2026-27</span>
  <span>Generated ${esc(generatedOn)}</span>
</div>

<script>
  window.onload = () => { window.print(); };
</script>
</body>
</html>`);
  popup.document.close();
}
