import { useState, useCallback, useMemo } from 'react';
import { generateTemplate } from '../../utils/excelExporter';
import { parseUploadedFile } from '../../utils/excelParser';
import { computeTieredSSR, DEFAULT_WEIGHTS, TIER_ORDER, WEIGHT_PRESETS, autoWeights, TIER_COLOR_HEX } from '../../engine/tieredCalculator';
import { ALL_METHODS } from '../../engine/statistics';
import { formatINR, formatPercent, getMethodDisplayName, getMethodColor } from '../../utils/formatters';
import { exportResults } from '../../utils/excelExporter';
import TierBadge from '../Shared/TierBadge';
import { SSR_ITEMS } from '../../data/ssrItems';

export default function UploadTab() {
  const [parsedData, setParsedData] = useState(null);
  const [previewItems, setPreviewItems] = useState(null); // D1: preview state
  const [tierWeights, setTierWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [activePreset, setActivePreset] = useState('balanced');
  const [results, setResults] = useState(null);
  const [overrides, setOverrides] = useState({}); // D2: { itemIndex: { method, reason } }
  const [expandedItem, setExpandedItem] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterTier, setFilterTier] = useState(null);

  const handleFile = useCallback(async (file) => {
    setLoading(true);
    setErrors([]);
    setResults(null);
    setPreviewItems(null);
    setExpandedItem(null);
    setOverrides({});
    try {
      const data = await parseUploadedFile(file);
      setParsedData(data);
      setErrors(data.errors || []);
      if (data.customWeights) {
        setTierWeights(data.customWeights);
        setActivePreset(null);
      }
      // D1: Show preview instead of auto-calculating
      if (data.items?.length > 0) {
        setPreviewItems(data.items);
      }
    } catch (err) {
      setErrors([{ row: 0, message: `Failed to parse: ${err.message}` }]);
    }
    setLoading(false);
  }, []);

  const updatePreviewSourceType = useCallback((itemIdx, sourceIdx, newType) => {
    setPreviewItems((items) => items.map((item, i) => {
      if (i !== itemIdx) return item;
      return {
        ...item,
        sources: item.sources.map((s, j) => j === sourceIdx ? { ...s, sourceType: newType } : s),
      };
    }));
  }, []);

  const confirmAndCalculate = useCallback(() => {
    if (!previewItems || !parsedData) return;
    const data = { ...parsedData, items: previewItems };
    setParsedData(data);
    calculateResults(data, tierWeights);
    setPreviewItems(null);
  }, [previewItems, parsedData, tierWeights]);

  const calculateResults = useCallback((data, weights) => {
    if (!data?.items?.length) return;
    const itemResults = data.items.map((item) => {
      const tierResult = computeTieredSSR(item.sources, weights);
      const prevItem = SSR_ITEMS.find(
        (si) => si.code === item.code || si.name.toLowerCase().includes(item.name?.toLowerCase()?.slice(0, 20))
      );
      const prev = data.previousSSR?.[item.code] || prevItem?.previousSSR;
      let percentChange = null;
      if (prev?.value) {
        percentChange = ((tierResult.finalValue - prev.value) / prev.value) * 100;
      }
      return {
        ...item,
        ...tierResult,
        previousSSR: prev,
        percentChange,
        cv: tierResult.diagnostics.cv,
        totalSources: item.sources.length,
      };
    });
    setResults(itemResults);
  }, []);

  const handleOverride = useCallback((itemIndex, method, reason) => {
    setOverrides((prev) => ({
      ...prev,
      [itemIndex]: { method, reason },
    }));
  }, []);

  const getEffectiveValue = useCallback((result, itemIndex) => {
    const override = overrides[itemIndex];
    if (!override?.method || override.method === 'tieredWeightedBlend') return result.finalValue;
    return result.allMethods?.[override.method] ?? result.finalValue;
  }, [overrides]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const applyPreset = useCallback((key) => {
    const preset = WEIGHT_PRESETS[key];
    if (!preset) return;
    setTierWeights({ ...preset.weights });
    setActivePreset(key);
    if (parsedData && results) calculateResults(parsedData, preset.weights);
  }, [parsedData, results, calculateResults]);

  const applyAutoWeights = useCallback(() => {
    if (!parsedData?.items) return;
    const allSources = parsedData.items.flatMap((i) => i.sources);
    const w = autoWeights(allSources);
    setTierWeights(w);
    setActivePreset('auto');
    if (results) calculateResults(parsedData, w);
  }, [parsedData, results, calculateResults]);

  const updateWeight = useCallback((tier, val) => {
    const newWeights = { ...tierWeights, [tier]: val };
    setTierWeights(newWeights);
    setActivePreset(null);
    if (parsedData && results) calculateResults(parsedData, newWeights);
  }, [tierWeights, parsedData, results, calculateResults]);

  const handleExport = () => {
    if (results && parsedData) {
      // Merge overrides into results for export
      const exportData = results.map((r, i) => {
        const override = overrides[i];
        if (!override?.method) return r;
        return {
          ...r,
          overrideReason: override.reason,
          selectedMethod: getMethodDisplayName(override.method),
          finalValue: getEffectiveValue(r, i),
        };
      });
      exportResults(exportData, tierWeights, parsedData.items);
    }
  };

  const tierSummary = useMemo(() => {
    if (!results) return {};
    const counts = {};
    for (const r of results) {
      for (const s of r.tierBreakdown || []) {
        counts[s.tier] = (counts[s.tier] || 0) + s.sources.length;
      }
    }
    return counts;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (!filterTier) return results;
    return results.filter((r) =>
      r.tierBreakdown?.some((tb) => tb.tier === filterTier)
    );
  }, [results, filterTier]);

  // Preview tier summary
  const previewTierCounts = useMemo(() => {
    if (!previewItems) return {};
    const counts = {};
    for (const item of previewItems) {
      for (const s of item.sources) {
        counts[s.sourceType] = (counts[s.sourceType] || 0) + 1;
      }
    }
    return counts;
  }, [previewItems]);

  const weightTotal = Object.values(tierWeights).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4 fade-in">
      {/* Upload section - always visible */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Upload Rate Data</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Items in rows, sources as columns. Download the template for the expected format.
            </p>
          </div>
          <button onClick={generateTemplate} className="btn-secondary text-xs">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Template
          </button>
        </div>
        <div
          className={`dropzone p-8 text-center ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}
        >
          {loading ? (
            <p className="text-gray-500 text-sm">Processing...</p>
          ) : (
            <>
              <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-500 text-sm">Drop Excel file here or click to browse</p>
              <p className="text-xs text-gray-300 mt-1">.xlsx, .xls, .csv</p>
            </>
          )}
          <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />
        </div>
        {errors.length > 0 && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
            {errors.slice(0, 5).map((e, i) => <p key={i}>Row {e.row}: {e.message}</p>)}
            {errors.length > 5 && <p className="text-red-400">...and {errors.length - 5} more</p>}
          </div>
        )}
      </div>

      {/* D1: Data preview step */}
      {previewItems && !results && (
        <div className="card fade-in">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Data Preview</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Review source categorization before calculating. Click a source type to change it.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreviewItems(null); setParsedData(null); }} className="btn-ghost text-xs text-gray-500">
                Cancel
              </button>
              <button onClick={confirmAndCalculate} className="btn-primary text-xs">
                Looks Good, Calculate
              </button>
            </div>
          </div>

          {/* Preview summary bar */}
          <div className="flex items-center gap-4 mb-3 p-2.5 bg-gray-50 rounded-lg text-xs">
            <span className="text-gray-500">
              <strong>{previewItems.length}</strong> items · <strong>{previewItems.reduce((s, i) => s + i.sources.length, 0)}</strong> sources
            </span>
            <span className="text-gray-300">|</span>
            {TIER_ORDER.map((t) => previewTierCounts[t] ? (
              <span key={t} className="flex items-center gap-1">
                <TierBadge tier={t} small />
                <span className="text-gray-500">{previewTierCounts[t]}</span>
              </span>
            ) : null)}
            <span className="text-gray-300">|</span>
            <span className="text-gray-400">{parsedData?.format === 'column' ? 'Column format' : 'Row format'}</span>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-100 text-left text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Source Type</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.slice(0, 50).map((item, itemIdx) =>
                  item.sources.map((s, srcIdx) => (
                    <tr key={`${itemIdx}-${srcIdx}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                      {srcIdx === 0 && (
                        <td className="px-3 py-1.5 text-gray-900 font-medium" rowSpan={item.sources.length}>
                          {item.name?.slice(0, 40) || item.code}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-gray-500">{s.sourceName?.slice(0, 30)}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={s.sourceType}
                          onChange={(e) => updatePreviewSourceType(itemIdx, srcIdx, e.target.value)}
                          className="text-xs px-1.5 py-0.5 border rounded bg-white"
                        >
                          {TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatINR(s.rate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {previewItems.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-2">Showing first 50 items. All {previewItems.length} will be calculated.</p>
            )}
          </div>
        </div>
      )}

      {/* Results section - shown after calculate */}
      {results && results.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card py-3">
              <p className="text-xs text-gray-400">Items</p>
              <p className="text-xl font-bold text-gray-900">{results.length}</p>
              <p className="text-xs text-gray-300 mt-0.5">{parsedData?.format === 'column' ? 'Column format' : 'Row format'}</p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-400">Total Sources</p>
              <p className="text-xl font-bold text-gray-900">
                {results.reduce((s, r) => s + r.totalSources, 0)}
              </p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Within 15%
              </p>
              <p className="text-xl font-bold text-green-600">
                {results.filter((r) => r.percentChange != null && Math.abs(r.percentChange) <= 15).length}
              </p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>15-30% change
              </p>
              <p className="text-xl font-bold text-amber-500">
                {results.filter((r) => r.percentChange != null && Math.abs(r.percentChange) > 15 && Math.abs(r.percentChange) <= 30).length}
              </p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>&gt;30% change
              </p>
              <p className="text-xl font-bold text-red-500">
                {results.filter((r) => r.percentChange != null && Math.abs(r.percentChange) > 30).length}
              </p>
              <p className="text-xs text-gray-300 mt-0.5">Needs justification</p>
            </div>
          </div>

          {/* Weight configuration */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Tier Weights</h3>
              <button onClick={handleExport} className="btn-primary text-xs">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Results
              </button>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`preset-chip ${activePreset === key ? 'active' : ''}`}
                  title={preset.desc}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={applyAutoWeights}
                className={`preset-chip ${activePreset === 'auto' ? 'active' : ''}`}
                title="Weight by data availability"
              >
                Auto (data-driven)
              </button>
            </div>

            {/* Weight sliders */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {TIER_ORDER.map((tier) => (
                <div key={tier}>
                  <div className="flex items-center justify-between mb-1.5">
                    <TierBadge tier={tier} />
                    <span className="text-sm font-semibold text-gray-700">{tierWeights[tier]}%</span>
                  </div>
                  <input
                    type="range"
                    min={0} max={100}
                    value={tierWeights[tier] || 0}
                    onChange={(e) => updateWeight(tier, parseInt(e.target.value))}
                    className="w-full"
                    style={{ accentColor: TIER_COLOR_HEX[tier] }}
                  />
                  <p className="text-xs text-gray-300 mt-0.5">
                    {tierSummary[tier] || 0} data points
                  </p>
                </div>
              ))}
            </div>
            {Math.abs(weightTotal - 100) >= 0.5 && (
              <p className="text-xs text-amber-600 mt-2">
                Total: {weightTotal}% — weights will be normalized proportionally to sum to 100%
              </p>
            )}
            {activePreset === 'auto' && (
              <p className="text-xs text-amber-600 mt-2">
                Auto weights are based on data count, not reliability. Tiers with more data get higher weights, which may not reflect source quality. Consider a preset for governance-defensible weights.
              </p>
            )}
          </div>

          {/* Filter by tier */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Filter:</span>
            <button
              onClick={() => setFilterTier(null)}
              className={`text-xs px-2 py-1 rounded-full ${!filterTier ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              All ({results.length})
            </button>
            {TIER_ORDER.map((t) => tierSummary[t] ? (
              <button
                key={t}
                onClick={() => setFilterTier(filterTier === t ? null : t)}
                className={`text-xs px-2 py-1 rounded-full ${filterTier === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                <TierBadge tier={t} small /> {tierSummary[t]}
              </button>
            ) : null)}
          </div>

          {/* Results table */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Sources</th>
                  <th className="px-4 py-2.5 font-medium">Tiers</th>
                  <th className="px-4 py-2.5 font-medium text-right">Calculated SSR</th>
                  <th className="px-4 py-2.5 font-medium text-right">Prev SSR</th>
                  <th className="px-4 py-2.5 font-medium text-right">Change</th>
                  <th className="px-4 py-2.5 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => {
                  const pctAbs = r.percentChange != null ? Math.abs(r.percentChange) : null;
                  const statusClass = pctAbs == null ? '' : pctAbs <= 15 ? 'status-green' : pctAbs <= 30 ? 'status-amber' : 'status-red';
                  const isExpanded = expandedItem === i;
                  const hasOverride = !!overrides[i]?.method;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                      onClick={() => setExpandedItem(isExpanded ? null : i)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900 text-xs">
                          {r.name?.slice(0, 50) || r.code}
                          {hasOverride && <span className="ml-1 text-amber-500" title="Method overridden">*</span>}
                        </div>
                        {r.code && <div className="text-xs text-gray-300">{r.code}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.totalSources}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-0.5 flex-wrap">
                          {r.tierBreakdown?.map((tb) => (
                            <TierBadge key={tb.tier} tier={tb.tier} small />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-gray-900">
                        {formatINR(getEffectiveValue(r, i))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">
                        {r.previousSSR ? formatINR(r.previousSSR.value) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-medium ${statusClass}`}>
                        {r.percentChange != null
                          ? `${r.percentChange > 0 ? '+' : ''}${formatPercent(r.percentChange)}`
                          : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-gray-300">
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded item detail */}
          {expandedItem != null && filteredResults[expandedItem] && (
            <ItemDetailInline
              result={filteredResults[expandedItem]}
              itemIndex={expandedItem}
              override={overrides[expandedItem]}
              onOverride={handleOverride}
              onClose={() => setExpandedItem(null)}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {!results && !previewItems && !loading && (
        <div className="card text-center py-10">
          <svg className="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-sm font-medium text-gray-700">No data yet</h3>
          <p className="text-xs text-gray-400 mt-1">Upload an Excel file with rate data to get started</p>
          <div className="mt-4 text-left max-w-md mx-auto">
            <p className="text-xs font-medium text-gray-500 mb-2">Template format:</p>
            <div className="p-2.5 bg-gray-50 rounded-lg text-xs">
              <p className="font-medium text-gray-700">Column-oriented (one sheet)</p>
              <p className="text-gray-400 mt-0.5">Each row is an item (code + name). Each column is a source (SSRs, POs, OEM offers, etc.). Download the template for sample data.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline expanded detail for a single item with override support (D2) */
function ItemDetailInline({ result, itemIndex, override, onOverride, onClose }) {
  const allRates = result.tierBreakdown?.flatMap((t) => t.sources) || [];
  const maxVal = Math.max(...allRates, ...(Object.values(result.allMethods || {}).filter(Boolean)), result.finalValue || 0);
  const methodVals = Object.values(result.allMethods || {}).filter(Boolean);
  const methodMin = methodVals.length >= 2 ? Math.min(...methodVals) : null;
  const methodMax = methodVals.length >= 2 ? Math.max(...methodVals) : null;
  const methodSpread = methodMin != null ? ((methodMax - methodMin) / ((methodMax + methodMin) / 2)) * 100 : null;

  const dominantTier = result.tierBreakdown?.reduce((best, tb) =>
    (!best || tb.contribution > best.contribution) ? tb : best, null
  );

  const [overrideMethod, setOverrideMethod] = useState(override?.method || '');
  const [overrideReason, setOverrideReason] = useState(override?.reason || '');

  const handleApplyOverride = () => {
    if (overrideMethod) {
      onOverride(itemIndex, overrideMethod, overrideReason.trim());
    }
  };

  const handleClearOverride = () => {
    setOverrideMethod('');
    setOverrideReason('');
    onOverride(itemIndex, null, '');
  };

  return (
    <div className="card fade-in">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{result.name || result.code}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {result.totalSources} sources · CV {formatPercent(result.cv)}
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost text-gray-400 text-lg leading-none">&times;</button>
      </div>

      {/* Plain-English summary */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
        Based on {result.totalSources} data source{result.totalSources !== 1 ? 's' : ''} across {result.tierBreakdown?.length || 0} tier{(result.tierBreakdown?.length || 0) !== 1 ? 's' : ''},
        the tiered weighted SSR value is <strong>{formatINR(result.finalValue)}</strong>.
        {result.percentChange != null && (
          <> This is <strong>{result.percentChange > 0 ? '+' : ''}{formatPercent(result.percentChange)}</strong> compared to the previous SSR
          {result.previousSSR?.year && <> ({result.previousSSR.year})</>}.</>
        )}
        {dominantTier && (
          <> The {dominantTier.tier} tier ({dominantTier.sources.length} source{dominantTier.sources.length !== 1 ? 's' : ''}, weight {(dominantTier.weight * 100).toFixed(0)}%) was the dominant contributor.</>
        )}
        {methodSpread != null && (
          <> Methods range from {formatINR(methodMin)} to {formatINR(methodMax)} — a spread of {formatPercent(methodSpread)}. Review all methods below to select the most appropriate one.</>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tier breakdown */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tier Breakdown</h4>
          <div className="space-y-2.5">
            {result.tierBreakdown?.map((tb) => (
              <div key={tb.tier} className="p-2.5 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={tb.tier} />
                    <span className="text-xs text-gray-400">{tb.sources.length} pts</span>
                  </div>
                  <div className="text-xs text-right">
                    <span className="font-medium text-gray-700">{formatINR(tb.estimate)}</span>
                    <span className="text-gray-300 ml-1">× {(tb.weight * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {tb.sources.map((val, j) => {
                    const outlierInfo = tb.outliers?.find((o) => o.value === val);
                    return (
                      <span
                        key={j}
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          outlierInfo ? 'bg-red-100 text-red-500 line-through' : 'bg-white text-gray-600 border border-gray-100'
                        }`}
                        title={outlierInfo ? `Outlier: ${outlierInfo.reason}. Excluded from tier estimate. Verify this source.` : ''}
                      >
                        {formatINR(val)}
                      </span>
                    );
                  })}
                </div>
                {tb.outliers?.length > 0 && (
                  <p className="text-xs text-red-500 mt-1.5">
                    {tb.outliers.length} outlier{tb.outliers.length > 1 ? 's' : ''} excluded.
                    {tb.tier === 'OEM Budgetary Offer' && ' OEM offers often run higher than transaction prices.'}
                    {' '}Verify for accuracy.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Tiered formula */}
          {result.tierBreakdown?.length > 0 && (
            <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-xs font-medium text-gray-500 mb-1.5">Calculation</h4>
              <p className="text-xs font-mono text-gray-600">
                SSR = {result.tierBreakdown.map((tb) =>
                  `${(tb.weight * 100).toFixed(0)}% × ${formatINR(tb.estimate)}`
                ).join(' + ')}
              </p>
              <p className="text-sm font-mono font-bold text-gray-800 mt-1">
                = {formatINR(result.finalValue)}
              </p>
            </div>
          )}
        </div>

        {/* Method comparison */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Method Comparison</h4>
          {methodSpread != null && (
            <p className={`text-xs mb-2 ${methodSpread > 20 ? 'text-red-600' : methodSpread > 10 ? 'text-amber-600' : 'text-gray-500'}`}>
              Spread: {formatPercent(methodSpread)} ({formatINR(methodMin)} to {formatINR(methodMax)})
            </p>
          )}
          <div className="space-y-1.5">
            {ALL_METHODS.map((m) => {
              const val = result.allMethods?.[m.key];
              if (val == null) return null;
              const isOverridden = override?.method === m.key;
              return (
                <div key={m.key} className="flex items-center gap-2">
                  <span className={`text-xs w-28 truncate ${isOverridden ? 'font-semibold text-amber-600' : 'text-gray-500'}`}>
                    {m.name} {isOverridden && '(selected)'}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${maxVal > 0 ? (val / maxVal) * 100 : 0}%`,
                        backgroundColor: getMethodColor(m.key),
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-20 text-right text-gray-500">{formatINR(val)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1.5 border-t border-gray-100">
              <span className="text-xs w-28 text-gray-500">Tiered Blend</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maxVal > 0 ? (result.finalValue / maxVal) * 100 : 0}%`,
                    backgroundColor: getMethodColor('tieredWeightedBlend'),
                  }}
                />
              </div>
              <span className="text-xs font-mono w-20 text-right text-gray-500">
                {formatINR(result.finalValue)}
              </span>
            </div>
          </div>

          {/* Method selection */}
          <div className="mt-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Select Method</h4>
            <select
              value={overrideMethod}
              onChange={(e) => setOverrideMethod(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border rounded bg-white mb-2"
            >
              <option value="">Tiered Weighted Blend — {formatINR(result.finalValue)}</option>
              {ALL_METHODS.map((m) => {
                const val = result.allMethods?.[m.key];
                if (val == null) return null;
                return <option key={m.key} value={m.key}>{m.name} — {formatINR(val)}</option>;
              })}
            </select>
            {overrideMethod && (
              <>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border rounded bg-white resize-none"
                  rows={2}
                  placeholder="Remarks (optional)"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleApplyOverride}
                    className="btn-primary text-xs"
                  >
                    Apply Selection
                  </button>
                  {override?.method && (
                    <button onClick={handleClearOverride} className="btn-ghost text-xs text-red-500">
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}
            {override?.method && !overrideMethod && (
              <div className="mt-1 text-xs text-gray-500">
                Selected: {getMethodDisplayName(override.method)}
                {override.reason && <> — {override.reason}</>}
                <button onClick={handleClearOverride} className="ml-2 text-red-500 underline">Remove</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flags with CV guidance */}
      {result.diagnostics?.flags?.length > 0 && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          {result.diagnostics.flags.map((f, i) => <p key={i}>⚠ {f}</p>)}
          {result.cv > 60 && (
            <div className="mt-2 pt-2 border-t border-amber-200">
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
