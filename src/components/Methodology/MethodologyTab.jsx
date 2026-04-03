import { METHOD_INFO } from '../../data/methodInfo';
import 'katex/dist/katex.min.css';
import katex from 'katex';

function Formula({ tex }) {
  try {
    const html = katex.renderToString(tex, { throwOnError: false, displayMode: true });
    return <div className="my-3 text-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code className="block my-3 text-center text-sm bg-slate-100 p-2 rounded">{tex}</code>;
  }
}

function MethodCard({ method }) {
  const robustnessColor =
    method.robustness === 'High' ? 'bg-green-100 text-green-800' :
    method.robustness === 'Low' ? 'bg-red-100 text-red-800' :
    'bg-amber-100 text-amber-800';

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold">{method.name}</h3>
          <p className="text-sm text-slate-500">{method.summary}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${robustnessColor}`}>
            {method.robustness}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
            {method.efficiency}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
            BP: {method.breakdown}
          </span>
        </div>
      </div>

      <Formula tex={method.formula} />

      <p className="text-sm text-slate-600 mb-3">{method.explanation}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-3">
        <div>
          <p className="font-medium text-green-700 text-xs uppercase mb-1">Best for</p>
          <p className="text-slate-600 text-xs">{method.whenToUse}</p>
        </div>
        <div>
          <p className="font-medium text-red-700 text-xs uppercase mb-1">Avoid when</p>
          <p className="text-slate-600 text-xs">{method.avoid}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-3">
        <div>
          <p className="font-medium text-slate-700 mb-1">Pros</p>
          <ul className="text-slate-500 space-y-0.5">
            {method.pros.map((p, i) => <li key={i}>+ {p}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-700 mb-1">Cons</p>
          <ul className="text-slate-500 space-y-0.5">
            {method.cons.map((c, i) => <li key={i}>− {c}</li>)}
          </ul>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        Min. data points: {method.minN} |{' '}
        {method.links.map((link, i) => (
          <span key={i}>
            {i > 0 && ' | '}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              {link.label}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}

function ComparisonTable() {
  const methods = [
    { name: 'Mean', robustness: 'Low', efficiency: '100%', breakdown: '0%', minN: 1, ease: 'Easy', audit: 'Low', ssr: 'No' },
    { name: 'Median', robustness: 'High', efficiency: '64%', breakdown: '50%', minN: 1, ease: 'Easy', audit: 'High', ssr: 'Backup' },
    { name: 'Trimmed', robustness: 'Med', efficiency: '92%', breakdown: '10%', minN: 4, ease: 'Easy', audit: 'High', ssr: 'Yes' },
    { name: 'Winsorized', robustness: 'Med', efficiency: '94%', breakdown: '10%', minN: 4, ease: 'Medium', audit: 'Medium', ssr: 'OK' },
    { name: 'IQM', robustness: 'Med-Hi', efficiency: '85%', breakdown: '25%', minN: 4, ease: 'Easy', audit: 'High', ssr: 'OK' },
    { name: 'H-L', robustness: 'High', efficiency: '96%', breakdown: '29%', minN: 2, ease: 'Hard', audit: 'Medium', ssr: 'Yes' },
    { name: 'Huber', robustness: 'High', efficiency: '95%', breakdown: '~20%', minN: 3, ease: 'Hard', audit: 'Medium', ssr: 'Yes' },
    { name: 'MAD-flt', robustness: 'Med', efficiency: '~90%', breakdown: '~15%', minN: 3, ease: 'Medium', audit: 'Medium', ssr: 'OK' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pb-2 pr-3">Property</th>
            {methods.map((m) => <th key={m.name} className="pb-2 px-2 text-center">{m.name}</th>)}
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {[
            ['Robustness', 'robustness'],
            ['Efficiency', 'efficiency'],
            ['Breakdown', 'breakdown'],
            ['Min N', 'minN'],
            ['Ease', 'ease'],
            ['Audit', 'audit'],
            ['Best for SSR?', 'ssr'],
          ].map(([label, key]) => (
            <tr key={key} className="border-b border-slate-100">
              <td className="py-1.5 pr-3 font-medium text-slate-500">{label}</td>
              {methods.map((m) => {
                const val = m[key];
                let cls = '';
                if (val === 'High' || val === 'Yes') cls = 'text-green-600 font-medium';
                if (val === 'Low' || val === 'No') cls = 'text-red-500';
                return <td key={m.name} className={`py-1.5 px-2 text-center ${cls}`}>{val}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodologyTab() {
  return (
    <div className="space-y-8">
      {/* Why tiered weighting */}
      <div className="card">
        <h2 className="text-xl font-bold mb-3">Why Tiered Weighting?</h2>
        <div className="prose prose-sm max-w-none text-slate-600">
          <p>
            When computing SSR rates, data comes from diverse sources with varying reliability.
            Mixing OEM budgetary quotes (often inflated) with actual Purchase Order prices (real transactions)
            in a simple average distorts the result.
          </p>
          <p className="mt-2">
            The tiered approach separates data by trust level, computes a robust estimate within each tier,
            then blends them using governance-approved weights. The weights are configurable per analysis.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {[
              { tier: 'Purchase Order', desc: 'Actual transaction prices from recent procurements. Generally considered the most reliable.' },
              { tier: 'State Utility SSR', desc: 'Rates published by peer utilities (TGTRANSCO, KPTCL, etc.). Published benchmarks.' },
              { tier: 'OEM Budgetary Offer', desc: 'Manufacturer list/budgetary prices. May differ from actual transaction prices.' },
              { tier: 'Formula/Cost-Plus', desc: 'IEEMA formula or cost-plus calculations. Derived from raw material costs.' },
            ].map((t) => (
              <div key={t.tier} className="p-3 bg-slate-50 rounded border">
                <p className="font-semibold text-sm">{t.tier}</p>
                <p className="text-xs text-slate-500 mt-1">{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Weights should be decided by the committee based on data quality and context for each SSR cycle.
            This mirrors how financial benchmarks work: the Bank of England&apos;s SONIA rate uses a volume-weighted
            trimmed mean of actual transactions; the ECB&apos;s €STR similarly excludes outliers.
          </p>
        </div>
      </div>

      {/* Method cards */}
      <div>
        <h2 className="text-xl font-bold mb-4">The 8 Statistical Methods</h2>
        <div className="grid grid-cols-1 gap-4">
          {METHOD_INFO.map((m) => <MethodCard key={m.key} method={m} />)}
        </div>
      </div>

      {/* Comparison matrix */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">Comparison Matrix</h2>
        <ComparisonTable />
      </div>

      {/* Glossary */}
      <div className="card">
        <h2 className="text-lg font-bold mb-3">Glossary</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['Breakdown Point', 'The fraction of data that can be corrupted before the estimator gives a completely wrong result.'],
            ['Statistical Efficiency', 'How well an estimator uses the available data. 100% = optimal for normal distribution.'],
            ['CV (Coefficient of Variation)', 'Standard deviation divided by mean, expressed as a percentage. Measures relative dispersion.'],
            ['MAD', 'Median Absolute Deviation — a robust measure of spread. MAD = median(|xᵢ − median(x)|).'],
            ['Robust Statistics', 'Methods that perform well even when some data points are outliers or the distribution is non-normal.'],
            ['Location Estimator', 'A statistic that represents the "center" or "typical value" of a distribution (like mean or median).'],
            ['Outlier', 'A data point that differs significantly from other observations. May indicate error or genuine extreme.'],
            ['IQR', 'Interquartile Range — the range between the 25th and 75th percentiles. A robust measure of spread.'],
          ].map(([term, def]) => (
            <div key={term}>
              <dt className="font-semibold text-slate-700">{term}</dt>
              <dd className="text-slate-500 text-xs">{def}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* References */}
      <div className="card">
        <h2 className="text-lg font-bold mb-3">References</h2>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>Huber, P.J. & Ronchetti, E.M. (2009). Robust Statistics, 2nd Ed. Wiley.</li>
          <li>World Bank Procurement Guidance: Price Benchmarking (2023).</li>
          <li>Bank of England SONIA Methodology — trimmed mean benchmark design.</li>
          <li>CERC/SERC Tariff Order Methodology (Indian power sector references).</li>
          <li>Wikipedia: <a href="https://en.wikipedia.org/wiki/Robust_statistics" className="text-blue-500">Robust Statistics</a></li>
        </ul>
      </div>
    </div>
  );
}
