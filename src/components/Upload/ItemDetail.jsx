import { formatINR, formatPercent, getMethodColor } from '../../utils/formatters';
import { ALL_METHODS } from '../../engine/statistics';
import TierBadge from '../Shared/TierBadge';
import { TIER_COLORS } from '../../engine/tieredCalculator';

export default function ItemDetail({ result, onClose }) {
  const maxVal = Math.max(
    ...Object.values(result.allMethods).filter(Boolean),
    ...result.tierBreakdown.flatMap((t) => t.sources)
  );

  const methodVals = Object.values(result.allMethods || {}).filter(Boolean);
  const methodMin = methodVals.length >= 2 ? Math.min(...methodVals) : null;
  const methodMax = methodVals.length >= 2 ? Math.max(...methodVals) : null;
  const methodSpread = methodMin != null ? ((methodMax - methodMin) / ((methodMax + methodMin) / 2)) * 100 : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{result.code}</h3>
          <p className="text-sm text-slate-500">{result.name}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
      </div>

      {/* Tier breakdown */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Tier Breakdown</h4>
        <div className="space-y-3">
          {result.tierBreakdown.map((tb) => (
            <div key={tb.tier} className="p-3 bg-slate-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TierBadge tier={tb.tier} />
                  <span className="text-sm text-slate-600">
                    {tb.sources.length} source{tb.sources.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{formatINR(tb.estimate)}</span>
                  <span className="text-xs text-slate-400 ml-2">× {(tb.weight * 100).toFixed(0)}%</span>
                  <span className="text-xs text-slate-500 ml-2">= {formatINR(tb.contribution)}</span>
                </div>
              </div>
              {/* Source value bars */}
              <div className="space-y-1">
                {tb.sources.map((val, j) => {
                  const outlierInfo = tb.outliers.find((o) => o.value === val);
                  return (
                    <div
                      key={j}
                      className="flex items-center gap-2"
                      title={outlierInfo ? `Outlier: ${outlierInfo.reason}. Excluded from tier estimate. Verify this source.` : ''}
                    >
                      <div className="flex-1 bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(val / maxVal) * 100}%`,
                            backgroundColor: outlierInfo ? '#ef4444' : TIER_COLORS[tb.tier],
                            opacity: outlierInfo ? 0.5 : 1,
                          }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-24 text-right ${outlierInfo ? 'line-through text-red-400' : ''}`}>
                        {formatINR(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {tb.outliers.length > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  {tb.outliers.length} outlier{tb.outliers.length > 1 ? 's' : ''} excluded from tier estimate.
                  {tb.tier === 'OEM Budgetary Offer' && ' OEM offers often run higher than actual transaction prices.'}
                  {' '}Verify flagged source{tb.outliers.length > 1 ? 's' : ''} for accuracy.
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Explicit tiered formula (C2) */}
        {result.tierBreakdown?.length > 0 && (
          <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
            <h4 className="text-xs font-medium text-slate-500 mb-1.5">Calculation</h4>
            <p className="text-xs font-mono text-slate-600">
              SSR = {result.tierBreakdown.map((tb) =>
                `${(tb.weight * 100).toFixed(0)}% × ${formatINR(tb.estimate)}`
              ).join(' + ')}
            </p>
            <p className="text-sm font-mono font-bold text-slate-800 mt-1">
              = {formatINR(result.finalValue)}
            </p>
          </div>
        )}
      </div>

      {/* Method comparison */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Method Comparison</h4>
        {methodSpread != null && (
          <p className={`text-xs mb-3 ${methodSpread > 20 ? 'text-red-600' : methodSpread > 10 ? 'text-amber-600' : 'text-slate-500'}`}>
            Spread: {formatPercent(methodSpread)} ({formatINR(methodMin)} to {formatINR(methodMax)})
          </p>
        )}
        <div className="space-y-2">
          {ALL_METHODS.map((m) => {
            const val = result.allMethods[m.key];
            if (val == null) return null;
            return (
              <div key={m.key} className="flex items-center gap-3">
                <span className="text-xs w-40 text-slate-600">
                  {m.name}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(val / maxVal) * 100}%`,
                      backgroundColor: getMethodColor(m.key),
                    }}
                  />
                </div>
                <span className="text-xs font-mono w-24 text-right">{formatINR(val)}</span>
              </div>
            );
          })}
          {/* Tiered blend */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-xs w-40 text-slate-600">
              Tiered Blend
            </span>
            <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(result.finalValue / maxVal) * 100}%`,
                  backgroundColor: getMethodColor('tieredWeightedBlend'),
                }}
              />
            </div>
            <span className="text-xs font-mono w-24 text-right">{formatINR(result.finalValue)}</span>
          </div>
        </div>
      </div>

      {/* Diagnostics */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-slate-500">CV:</span>
          <span className={`ml-2 font-medium ${result.cv > 60 ? 'text-red-600' : 'text-slate-900'}`}>
            {formatPercent(result.cv)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Sources:</span>
          <span className="ml-2 font-medium">{result.tierBreakdown?.length || 0} tiers</span>
        </div>
      </div>

      {result.diagnostics?.flags?.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          {result.diagnostics.flags.map((f, i) => <p key={i}>⚠ {f}</p>)}
          {result.cv > 60 && (
            <div className="mt-2 pt-2 border-t border-amber-200 text-xs">
              <p className="font-medium mb-1">High dispersion — consider checking:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Are all sources for the same voltage level and configuration?</li>
                <li>Are OEM budgetary offers for the exact same specification?</li>
                <li>Do older rates need year-on-year escalation adjustment?</li>
                <li>Review flagged outlier values for data entry errors</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
