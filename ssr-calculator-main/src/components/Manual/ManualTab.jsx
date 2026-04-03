import { useState, useMemo, useEffect, useRef } from 'react';
import { computeTieredSSR, DEFAULT_WEIGHTS, TIER_ORDER, TIER_COLORS, TIER_COLOR_HEX, WEIGHT_PRESETS } from '../../engine/tieredCalculator';
import { computeAllMethods, ALL_METHODS, cv } from '../../engine/statistics';
import { formatINR, formatPercent, getMethodColor } from '../../utils/formatters';
import { SSR_ITEMS } from '../../data/ssrItems';
import { SAMPLE_DATA } from '../../data/sampleData';
import TierBadge from '../Shared/TierBadge';

const EMPTY_SOURCE = { sourceName: '', sourceType: 'State Utility SSR', rate: '', year: '', remarks: '', excluded: false };
const STORAGE_KEY = 'ssr-calculator-manual-entry';

function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export default function ManualTab() {
  const saved = useRef(loadSaved());
  const [showRestore, setShowRestore] = useState(!!saved.current?.itemName || saved.current?.sources?.some(s => s.rate));

  const [itemName, setItemName] = useState('');
  const [sources, setSources] = useState([{ ...EMPTY_SOURCE }]);
  const [tierWeights, setTierWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [activePreset, setActivePreset] = useState('balanced');
  const [suggestions, setSuggestions] = useState([]);
  const [matchedItem, setMatchedItem] = useState(null);
  const [showRemarks, setShowRemarks] = useState({});
  const [rateFocused, setRateFocused] = useState({});

  // D4: Auto-save on change (debounced)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorage({ itemName, sources, tierWeights, activePreset });
    }, 1000);
    return () => clearTimeout(saveTimer.current);
  }, [itemName, sources, tierWeights, activePreset]);

  const restoreSaved = () => {
    const data = saved.current;
    if (!data) return;
    if (data.itemName) setItemName(data.itemName);
    if (data.sources?.length) setSources(data.sources.map(s => ({ ...EMPTY_SOURCE, ...s })));
    if (data.tierWeights) setTierWeights(data.tierWeights);
    if (data.activePreset) setActivePreset(data.activePreset);
    setShowRestore(false);
  };

  const addSource = () => setSources([...sources, { ...EMPTY_SOURCE }]);

  const updateSource = (idx, field, value) => {
    setSources(sources.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const removeSource = (idx) => {
    if (sources.length > 1) setSources(sources.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    if (!confirm('Clear all entered data? This cannot be undone.')) return;
    setItemName('');
    setSources([{ ...EMPTY_SOURCE }]);
    setTierWeights({ ...DEFAULT_WEIGHTS });
    setActivePreset('balanced');
    setMatchedItem(null);
    setShowRemarks({});
    setRateFocused({});
    setShowRestore(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const toggleExclude = (idx) => {
    setSources(sources.map((s, i) => i === idx ? { ...s, excluded: !s.excluded } : s));
  };

  const loadSample = () => {
    const sample = SAMPLE_DATA[0];
    setItemName(sample.name);
    setSources(sample.sources.map((s) => ({ ...s, rate: String(s.rate) })));
    const matched = SSR_ITEMS.find(
      (item) => item.name.toLowerCase().includes(sample.name.toLowerCase().slice(0, 20))
    );
    setMatchedItem(matched || null);
  };

  const handleItemSearch = (val) => {
    setItemName(val);
    setMatchedItem(null);
    if (val.length >= 2) {
      const lowerVal = val.toLowerCase();
      const matches = SSR_ITEMS.filter(
        (item) => item.name.toLowerCase().includes(lowerVal) || item.code.toLowerCase().includes(lowerVal)
      ).slice(0, 8);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (item) => {
    setItemName(item.name);
    setMatchedItem(item);
    setSuggestions([]);
  };

  const sortByTier = () => {
    const tierOrder = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i]));
    setSources([...sources].sort((a, b) => (tierOrder[a.sourceType] ?? 99) - (tierOrder[b.sourceType] ?? 99)));
  };

  const applyPreset = (key) => {
    const preset = WEIGHT_PRESETS[key];
    if (!preset) return;
    setTierWeights({ ...preset.weights });
    setActivePreset(key);
  };

  const isFormEmpty = sources.length === 1 && !sources[0].sourceName && !sources[0].rate && !itemName;

  const validSources = useMemo(() =>
    sources.filter((s) => s.rate && parseFloat(String(s.rate).replace(/,/g, '')) > 0 && !s.excluded)
      .map((s) => ({ ...s, rate: parseFloat(String(s.rate).replace(/,/g, '')) })),
    [sources]
  );

  const excludedCount = sources.filter((s) => s.excluded).length;

  const analysis = useMemo(() => {
    if (validSources.length < 2) return null;
    const values = validSources.map((s) => s.rate);
    const allMethods = computeAllMethods(values);
    const tiered = computeTieredSSR(validSources, tierWeights);
    return { allMethods, tiered, cv: cv(values), values };
  }, [validSources, tierWeights]);

  const maxVal = analysis
    ? Math.max(...analysis.values, ...Object.values(analysis.allMethods).filter(Boolean), analysis.tiered.finalValue)
    : 0;

  const weightTotal = Object.values(tierWeights).reduce((a, b) => a + b, 0);

  // Helpers for rate input formatting
  const getRateDisplay = (rawRate, idx) => {
    if (rateFocused[idx]) return rawRate;
    const num = parseFloat(String(rawRate).replace(/,/g, ''));
    if (!rawRate || isNaN(num)) return rawRate;
    return formatINR(num).replace('₹', '');
  };

  const isSourceComplete = (s) => {
    const num = parseFloat(String(s.rate).replace(/,/g, ''));
    return !isNaN(num) && num > 0 && s.sourceType;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Data entry */}
      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Item Data Entry</h2>
            <div className="flex gap-2">
              {!isFormEmpty && (
                <button onClick={clearAll} className="btn-ghost text-xs text-red-500 hover:text-red-700">
                  Clear All
                </button>
              )}
              <button onClick={loadSample} className="btn-secondary text-xs">Load Sample</button>
            </div>
          </div>

          {/* Restore saved data banner */}
          {showRestore && isFormEmpty && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <p className="text-xs text-amber-800">You have unsaved work from a previous session.</p>
              <div className="flex gap-2">
                <button onClick={restoreSaved} className="btn-primary text-xs py-1">Restore</button>
                <button onClick={() => setShowRestore(false)} className="btn-ghost text-xs text-amber-600">Dismiss</button>
              </div>
            </div>
          )}

          {/* Onboarding banner for empty state */}
          {isFormEmpty && !showRestore && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-800 font-medium">New here? Load sample data to see how the calculator works.</p>
              <button onClick={loadSample} className="btn-primary mt-2 text-sm">
                Load Sample Data
              </button>
            </div>
          )}

          <div className="mb-4 relative">
            <label className="block text-xs font-medium text-slate-600 mb-1">Item Name</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => handleItemSearch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              placeholder="e.g. 420kV Circuit Breaker with PIR or item code"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                {suggestions.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(item)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-blue-700">{item.code}</span>
                        <span className="text-slate-600 ml-2">{item.name.slice(0, 55)}</span>
                      </div>
                      {item.previousSSR && (
                        <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                          Prev: {formatINR(item.previousSSR.value)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.category} {item.voltageLevel && `· ${item.voltageLevel}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source header with sort */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">
              Data Sources ({sources.length})
              {excludedCount > 0 && <span className="text-red-400 ml-1">({excludedCount} excluded)</span>}
            </label>
            {sources.length > 1 && (
              <button onClick={sortByTier} className="text-xs text-blue-600 hover:text-blue-800">
                Sort by Tier
              </button>
            )}
          </div>

          <div className="space-y-3">
            {sources.map((s, i) => {
              const complete = isSourceComplete(s);
              const rateVal = s.rate ? parseFloat(String(s.rate).replace(/,/g, '')) : NaN;
              const rateInvalid = s.rate && isNaN(rateVal);
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border transition-colors ${s.excluded ? 'opacity-50' : ''}`}
                  style={{
                    borderLeft: `4px solid ${s.excluded ? '#d1d5db' : (TIER_COLOR_HEX[s.sourceType] || '#d1d5db')}`,
                    backgroundColor: s.excluded ? '#f9fafb' : (complete ? '#f8fafc' : '#fefefe'),
                    borderTopColor: '#e2e8f0',
                    borderRightColor: '#e2e8f0',
                    borderBottomColor: '#e2e8f0',
                  }}
                >
                  {/* Source header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                      <TierBadge tier={s.sourceType} small />
                      {s.excluded && <span className="text-[10px] text-red-400 font-medium">EXCLUDED</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleExclude(i)}
                        className={`text-sm px-1 transition-colors ${s.excluded ? 'text-red-400 hover:text-green-600' : 'text-slate-300 hover:text-red-400'}`}
                        title={s.excluded ? 'Include this source' : 'Exclude from calculation (what-if)'}
                      >
                        {s.excluded ? '◉' : '○'}
                      </button>
                      <button
                        onClick={() => removeSource(i)}
                        className="text-slate-300 hover:text-red-500 text-lg leading-none transition-colors"
                        title="Remove source"
                        disabled={sources.length === 1}
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Row 1: Source name + Tier */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">Source Name</label>
                      <input
                        type="text"
                        value={s.sourceName}
                        onChange={(e) => updateSource(i, 'sourceName', e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-sm"
                        placeholder="e.g. TGTRANSCO SSR 2025-26"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">
                        Source Type <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={s.sourceType}
                        onChange={(e) => updateSource(i, 'sourceType', e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-sm"
                      >
                        {TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Rate + Year */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">
                        Rate in INR <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                        <input
                          type="text"
                          value={getRateDisplay(s.rate, i)}
                          onChange={(e) => updateSource(i, 'rate', e.target.value.replace(/[^\d.]/g, ''))}
                          onFocus={() => setRateFocused((f) => ({ ...f, [i]: true }))}
                          onBlur={() => setRateFocused((f) => ({ ...f, [i]: false }))}
                          className={`w-full pl-6 pr-2 py-1.5 border rounded text-sm font-mono ${
                            rateInvalid ? 'border-red-400 bg-red-50' : ''
                          }`}
                          placeholder="e.g. 4190400"
                        />
                      </div>
                      {rateInvalid && (
                        <p className="text-xs text-red-500 mt-0.5">Enter a valid numeric value</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">Year <span className="text-slate-300">(opt)</span></label>
                      <input
                        type="text"
                        value={s.year}
                        onChange={(e) => updateSource(i, 'year', e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-sm"
                        placeholder="2025-26"
                      />
                    </div>
                  </div>

                  {/* Remarks (collapsible) */}
                  {showRemarks[i] ? (
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Remarks</label>
                      <input
                        type="text"
                        value={s.remarks}
                        onChange={(e) => updateSource(i, 'remarks', e.target.value)}
                        className="w-full px-2 py-1.5 border rounded text-sm"
                        placeholder="Optional notes about this source"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowRemarks((r) => ({ ...r, [i]: true }))}
                      className="text-xs text-slate-400 hover:text-slate-600 mt-1.5"
                    >
                      + Add remarks
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={addSource} className="mt-3 btn-secondary w-full text-sm">
            + Add Data Source
          </button>

          {validSources.length < 2 && (
            <p className="text-xs text-slate-400 mt-2">
              Add at least 3 data sources for full analysis (2 for basic methods)
            </p>
          )}
          {validSources.length === 2 && (
            <p className="text-xs text-amber-600 mt-2">
              Only 2 sources. Methods requiring 3+ (Huber, MAD-filtered) are unavailable. Add 1 more for full analysis.
            </p>
          )}
        </div>
      </div>

      {/* Right: Tier weights + Live analysis */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {/* Tier weight configuration — always visible above analysis */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Tier Weights</h3>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`preset-chip text-xs ${activePreset === key ? 'active' : ''}`}
                title={preset.desc}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {TIER_ORDER.map((tier) => (
              <div key={tier} className="flex items-center gap-1.5">
                <TierBadge tier={tier} small />
                <input
                  type="range"
                  min={0} max={100}
                  value={tierWeights[tier] || 0}
                  onChange={(e) => {
                    setTierWeights((w) => ({ ...w, [tier]: parseInt(e.target.value) }));
                    setActivePreset(null);
                  }}
                  className="flex-1 h-1.5"
                  style={{ accentColor: TIER_COLOR_HEX[tier] }}
                />
                <span className="text-xs w-8 text-right font-medium tabular-nums">{tierWeights[tier]}%</span>
              </div>
            ))}
          </div>
          <p className={`text-xs mt-2 ${Math.abs(weightTotal - 100) >= 0.5 ? 'text-amber-600' : 'text-slate-400'}`}>
            Total: {weightTotal}%
            {Math.abs(weightTotal - 100) >= 0.5 && ' — will be normalized proportionally'}
          </p>
        </div>

        {analysis ? (
          <>
            {/* Results summary */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-3">Tiered Weighted Result</h3>
              <p className="text-3xl font-bold text-[#00529B]">{formatINR(analysis.tiered.finalValue)}</p>
              <p className="text-xs text-slate-400 mt-1">
                Based on {validSources.length} sources across {analysis.tiered.tierBreakdown.length} tier{analysis.tiered.tierBreakdown.length !== 1 ? 's' : ''}
              </p>

              {/* Previous SSR comparison */}
              {matchedItem?.previousSSR && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Previous SSR ({matchedItem.previousSSR.year})</span>
                    <span className="font-mono">{formatINR(matchedItem.previousSSR.value)}</span>
                  </div>
                  {(() => {
                    const pctChange = ((analysis.tiered.finalValue - matchedItem.previousSSR.value) / matchedItem.previousSSR.value) * 100;
                    const absChange = Math.abs(pctChange);
                    const statusClass = absChange <= 15 ? 'text-green-600' : absChange <= 30 ? 'text-amber-600' : 'text-red-600';
                    return (
                      <div className={`flex items-center justify-between text-xs mt-1 ${statusClass} font-medium`}>
                        <span>Change from previous</span>
                        <span>{pctChange > 0 ? '+' : ''}{formatPercent(pctChange)}</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <p className="text-xs text-slate-500 mt-2" title="Coefficient of Variation — measures how spread out the source values are relative to the mean. Higher = more dispersion.">
                Coefficient of Variation (CV): <span className={analysis.cv > 60 ? 'text-red-600 font-medium' : ''}>{formatPercent(analysis.cv)}</span>
                {analysis.cv <= 15 && <span className="text-green-600 ml-1">Low spread</span>}
                {analysis.cv > 15 && analysis.cv <= 40 && <span className="text-slate-400 ml-1">Moderate spread</span>}
                {analysis.cv > 40 && analysis.cv <= 60 && <span className="text-amber-600 ml-1">High spread</span>}
                {analysis.cv > 60 && <span className="text-red-600 ml-1">Very high spread — review sources</span>}
              </p>
            </div>

            {/* Method comparison bars */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-1">Method Comparison</h3>
              {/* Method spread indicator */}
              {(() => {
                const methodVals = Object.values(analysis.allMethods).filter(Boolean);
                if (methodVals.length < 2) return null;
                const min = Math.min(...methodVals);
                const max = Math.max(...methodVals);
                const spread = ((max - min) / ((max + min) / 2)) * 100;
                const spreadClass = spread > 20 ? 'text-red-600' : spread > 10 ? 'text-amber-600' : 'text-slate-500';
                return (
                  <p className={`text-xs mb-3 ${spreadClass}`}>
                    Methods range from {formatINR(min)} to {formatINR(max)} — spread of {formatPercent(spread)}
                  </p>
                );
              })()}
              <div className="space-y-2">
                {ALL_METHODS.map((m) => {
                  const val = analysis.allMethods[m.key];
                  if (val == null) return null;
                  return (
                    <div key={m.key} className="flex items-center gap-2">
                      <span className="text-xs w-36 truncate text-slate-600">
                        {m.name}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(val / maxVal) * 100}%`,
                            backgroundColor: getMethodColor(m.key),
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono w-20 text-right">{formatINR(val)}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-xs w-36 text-slate-600">Tiered Blend</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(analysis.tiered.finalValue / maxVal) * 100}%`,
                        backgroundColor: getMethodColor('tieredWeightedBlend'),
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-20 text-right">
                    {formatINR(analysis.tiered.finalValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Data distribution */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-3">Source Values</h3>
              <div className="space-y-1">
                {validSources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TierBadge tier={s.sourceType} small />
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(s.rate / maxVal) * 100}%`,
                          backgroundColor: TIER_COLORS[s.sourceType],
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono w-20 text-right">{formatINR(s.rate)}</span>
                    <span className="text-xs text-slate-400 w-24 truncate">{s.sourceName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier breakdown with formula */}
            {analysis.tiered.tierBreakdown.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold mb-3">Tier Contributions</h3>
                {analysis.tiered.tierBreakdown.map((tb) => (
                  <div key={tb.tier} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-50 last:border-0">
                    <TierBadge tier={tb.tier} />
                    <span className="text-slate-500">{tb.sources.length} src × {(tb.weight * 100).toFixed(0)}%</span>
                    <span className="font-mono">{formatINR(tb.estimate)}</span>
                    <span className="font-mono text-slate-500">→ {formatINR(tb.contribution)}</span>
                  </div>
                ))}
                {/* Explicit formula */}
                <div className="mt-3 pt-3 border-t border-slate-200 bg-slate-50 -mx-5 -mb-5 px-5 py-3 rounded-b-lg">
                  <p className="text-xs font-mono text-slate-600">
                    SSR = {analysis.tiered.tierBreakdown.map((tb) =>
                      `${(tb.weight * 100).toFixed(0)}% × ${formatINR(tb.estimate)}`
                    ).join(' + ')}
                  </p>
                  <p className="text-sm font-mono font-bold text-slate-800 mt-1">
                    = {formatINR(analysis.tiered.finalValue)}
                  </p>
                </div>
              </div>
            )}

            {/* Flags with improved guidance */}
            {analysis.tiered.diagnostics.flags.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                {analysis.tiered.diagnostics.flags.map((f, i) => <p key={i}>⚠ {f}</p>)}
                {analysis.cv > 60 && (
                  <div className="mt-2 pt-2 border-t border-amber-200 text-xs text-amber-700">
                    <p className="font-medium mb-1">High dispersion — consider checking:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Are all sources for the same voltage level and configuration?</li>
                      <li>Are OEM budgetary offers for the exact same specification?</li>
                      <li>Do older rates need year-on-year escalation adjustment?</li>
                      <li>Review flagged outlier values above for data entry errors</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="card text-center py-12 text-slate-400">
            <p className="text-lg">Enter data sources to see live analysis</p>
            <p className="text-sm mt-2">Add at least 2 values with source types</p>
          </div>
        )}
      </div>
    </div>
  );
}
