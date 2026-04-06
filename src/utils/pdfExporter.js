import { formatPercent, getMethodDisplayName } from './formatters';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return 'NA';
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function getSafeFileName(name) {
  return (name || 'Manual Entry')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'Manual_Entry';
}

export function exportManualEntryPdf({
  itemName,
  matchedItem,
  sources,
  validSources,
  tierWeights,
  analysis,
}) {
  if (!analysis) return;

  const title = itemName || matchedItem?.name || 'Manual Entry';
  const fileName = `${getSafeFileName(title)}_SSR_Report`;
  const methodRows = Object.entries(analysis.allMethods)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `
      <tr>
        <td>${escapeHtml(getMethodDisplayName(key))}</td>
        <td>${formatCurrency(value)}</td>
      </tr>
    `)
    .join('');

  const sourceRows = sources.map((source, index) => {
    const numericRate = parseFloat(String(source.rate).replace(/,/g, ''));
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(source.sourceName || '-')}</td>
        <td>${escapeHtml(source.sourceType || '-')}</td>
        <td>${Number.isFinite(numericRate) ? formatCurrency(numericRate) : escapeHtml(source.rate || '-')}</td>
        <td>${escapeHtml(source.year || '-')}</td>
        <td>${source.excluded ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(source.remarks || '-')}</td>
      </tr>
    `;
  }).join('');

  const tierRows = analysis.tiered.tierBreakdown.map((tb) => `
    <tr>
      <td>${escapeHtml(tb.tier)}</td>
      <td>${tb.sources.length}</td>
      <td>${(tb.weight * 100).toFixed(0)}%</td>
      <td>${formatCurrency(tb.estimate)}</td>
      <td>${formatCurrency(tb.contribution)}</td>
    </tr>
  `).join('');

  const flagsMarkup = analysis.tiered.diagnostics.flags.length
    ? `<ul>${analysis.tiered.diagnostics.flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>`
    : '<p>No diagnostic flags.</p>';

  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    throw new Error('Pop-up blocked. Please allow pop-ups to export the PDF report.');
  }

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(fileName)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 24px;
            color: #0f172a;
          }
          h1, h2, h3, p {
            margin: 0 0 12px;
          }
          .meta, .grid {
            display: grid;
            gap: 12px;
          }
          .meta {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-bottom: 20px;
          }
          .card {
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .hero {
            background: #eff6ff;
            border-color: #bfdbfe;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 8px;
            text-align: left;
            font-size: 12px;
            vertical-align: top;
          }
          th {
            background: #f8fafc;
          }
          .small {
            font-size: 12px;
            color: #475569;
          }
          @media print {
            body {
              margin: 12mm;
            }
            .card {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="card hero">
          <h1>SSR Manual Entry Report</h1>
          <p><strong>${escapeHtml(title)}</strong></p>
          <p class="small">Generated on ${escapeHtml(new Date().toLocaleString('en-IN'))}</p>
          <p class="small">Final tiered weighted SSR: <strong>${formatCurrency(analysis.tiered.finalValue)}</strong></p>
        </div>

        <div class="meta">
          <div class="card">
            <h2>Summary</h2>
            <p>Total valid sources: ${validSources.length}</p>
            <p>Coefficient of variation: ${formatPercent(analysis.cv)}</p>
            <p>Matched code: ${escapeHtml(matchedItem?.code || 'MANUAL')}</p>
            <p>Previous SSR: ${matchedItem?.previousSSR ? formatCurrency(matchedItem.previousSSR.value) : 'NA'}</p>
          </div>
          <div class="card">
            <h2>Tier Weights</h2>
            ${Object.entries(tierWeights).map(([tier, weight]) => (
              `<p>${escapeHtml(tier)}: ${weight}%</p>`
            )).join('')}
          </div>
        </div>

        <div class="card">
          <h2>Tier Contributions</h2>
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Sources</th>
                <th>Weight</th>
                <th>Estimate</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>${tierRows}</tbody>
          </table>
        </div>

        <div class="card">
          <h2>Method Comparison</h2>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${methodRows}
              <tr>
                <td>Tiered Weighted Blend</td>
                <td>${formatCurrency(analysis.tiered.finalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h2>Source Data</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Source Name</th>
                <th>Source Type</th>
                <th>Rate</th>
                <th>Year</th>
                <th>Excluded</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>${sourceRows}</tbody>
          </table>
        </div>

        <div class="card">
          <h2>Diagnostics</h2>
          ${flagsMarkup}
        </div>

        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}
