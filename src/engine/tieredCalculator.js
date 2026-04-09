import {
  median, hodgesLehmann, mad, cv, computeAllMethods,
} from './statistics.js';

export const TIER_ORDER = [
  'Purchase Order',
  'State Utility SSR',
  'OEM Budgetary Offer',
  'Formula/Cost-Plus',
];

export const TIER_LABELS = {
  'Purchase Order': 'PO',
  'State Utility SSR': 'SSR',
  'OEM Budgetary Offer': 'OEM',
  'Formula/Cost-Plus': 'Formula',
};

export const TIER_COLORS = {
  'Purchase Order': 'var(--tier-po)',
  'State Utility SSR': 'var(--tier-ssr)',
  'OEM Budgetary Offer': 'var(--tier-oem)',
  'Formula/Cost-Plus': 'var(--tier-formula)',
};

export const TIER_COLOR_HEX = {
  'Purchase Order': '#059669',
  'State Utility SSR': '#2563eb',
  'OEM Budgetary Offer': '#d97706',
  'Formula/Cost-Plus': '#7c3aed',
};

export const WEIGHT_PRESETS = {
  balanced: {
    label: 'Balanced',
    desc: 'Equal emphasis on transactions & benchmarks',
    weights: { 'Purchase Order': 35, 'State Utility SSR': 35, 'OEM Budgetary Offer': 20, 'Formula/Cost-Plus': 10 },
  },
  marketDriven: {
    label: 'Market-Driven',
    desc: 'Favors actual transaction prices',
    weights: { 'Purchase Order': 50, 'State Utility SSR': 25, 'OEM Budgetary Offer': 20, 'Formula/Cost-Plus': 5 },
  },
  conservative: {
    label: 'Conservative',
    desc: 'Favors published SSR benchmarks',
    weights: { 'Purchase Order': 30, 'State Utility SSR': 45, 'OEM Budgetary Offer': 15, 'Formula/Cost-Plus': 10 },
  },
  equal: {
    label: 'Equal',
    desc: 'No tier preference — all sources equal',
    weights: { 'Purchase Order': 25, 'State Utility SSR': 25, 'OEM Budgetary Offer': 25, 'Formula/Cost-Plus': 25 },
  },
};

export const DEFAULT_WEIGHTS = WEIGHT_PRESETS.balanced.weights;

/** Auto-compute weights based on data availability per tier */
export function autoWeights(sources) {
  const counts = {};
  for (const tier of TIER_ORDER) counts[tier] = 0;
  for (const s of sources) counts[s.sourceType] = (counts[s.sourceType] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return { ...DEFAULT_WEIGHTS };
  const weights = {};
  for (const tier of TIER_ORDER) {
    weights[tier] = Math.round((counts[tier] / total) * 100);
  }
  // Ensure sums to 100
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum !== 100 && sum > 0) {
    const maxTier = TIER_ORDER.reduce((a, b) => weights[a] >= weights[b] ? a : b);
    weights[maxTier] += 100 - sum;
  }
  return weights;
}

// Tier-level outlier detection: more lenient (2.5) to avoid over-flagging
// vs. MAD-filtered mean in statistics.js which uses 2.0 for tighter filtering
export const OUTLIER_DETECTION_THRESHOLD = 2.5;

const AUTO_CT_LA_PATTERNS = [
  /\bct\b/i,
  /\bcurrent\s+transformer\b/i,
  /\bla\b/i,
  /\blightning\s+arrester\b/i,
  /\bsurge\s+arrester\b/i,
  /\bmetal\s+oxide\s+arrester\b/i,
  /\bmoa\b/i,
];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function isCtLaLikeItem(itemContext = {}) {
  const haystack = [itemContext.code, itemContext.name, itemContext.category]
    .map(normalizeText)
    .join(' ');
  return AUTO_CT_LA_PATTERNS.some((pattern) => pattern.test(haystack));
}

function resolveClosingMode(closingMode, itemContext = {}) {
  if (closingMode && closingMode !== 'auto') return closingMode;
  return isCtLaLikeItem(itemContext) ? 'dev2' : 'sumP2overP';
}

function closingByDev2(values) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const epsilon = 1e-12;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const value of values) {
    const deviation = Math.abs(value - avg);
    const weight = 1 / Math.max(deviation * deviation, epsilon);
    weightedSum += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : avg;
}

function closingBySumP2overP(values) {
  if (values.length === 0) return 0;
  const denominator = values.reduce((a, b) => a + b, 0);
  if (denominator === 0) return 0;
  const numerator = values.reduce((acc, v) => acc + (v * v), 0);
  return numerator / denominator;
}

function computeClosingValue(values, closingMode) {
  if (closingMode === 'dev2') return closingByDev2(values);
  return closingBySumP2overP(values);
}

function detectOutliers(values) {
  if (values.length < 3) return { clean: values, outliers: [] };
  const med = median(values);
  const madVal = mad(values);
  if (madVal === 0) return { clean: values, outliers: [] };
  const scaledMad = madVal * 1.4826;
  const threshold = OUTLIER_DETECTION_THRESHOLD;
  const clean = [];
  const outliers = [];
  for (const v of values) {
    const z = Math.abs(v - med) / scaledMad;
    if (z > threshold) {
      outliers.push({ value: v, zScore: z, reason: `MAD z-score ${z.toFixed(1)} > ${threshold}` });
    } else {
      clean.push(v);
    }
  }
  return { clean: clean.length > 0 ? clean : values, outliers };
}

function withinTierEstimate(values) {
  if (values.length === 0) return { estimate: 0, method: 'none' };
  if (values.length === 1) return { estimate: values[0], method: 'single value' };
  // H-L for all n >= 2: 96% Gaussian efficiency with 29% breakdown point
  return { estimate: hodgesLehmann(values), method: 'Hodges-Lehmann' };
}

export function computeTieredSSR(sources, tierWeights, options = {}) {
  const {
    closingMode = 'auto',
    pvFactor: rawPvFactor = 1,
    itemContext = {},
  } = options;

  const pvFactor = Number.isFinite(Number(rawPvFactor)) ? Number(rawPvFactor) : 1;
  const closingModeApplied = resolveClosingMode(closingMode, itemContext);

  // Group by tier
  const byTier = {};
  for (const tier of TIER_ORDER) {
    byTier[tier] = sources
      .filter((s) => s.sourceType === tier)
      .map((s) => s.rate);
  }

  // Normalize weights for tiers that have data
  const tiersWithData = TIER_ORDER.filter((t) => byTier[t].length > 0);
  const totalWeight = tiersWithData.reduce((sum, t) => sum + (tierWeights[t] || 0), 0);

  const tierBreakdown = [];
  let finalValue = 0;

  for (const tier of TIER_ORDER) {
    const values = byTier[tier];
    if (values.length === 0) continue;

    const { clean, outliers } = detectOutliers(values);
    const { estimate, method } = withinTierEstimate(clean);
    const rawWeight = tierWeights[tier] || 0;
    const normalizedWeight = totalWeight > 0 ? rawWeight / totalWeight : 0;
    const contribution = estimate * normalizedWeight;

    finalValue += contribution;

    tierBreakdown.push({
      tier,
      weight: normalizedWeight,
      rawWeight: rawWeight,
      sources: values,
      cleanValues: clean,
      outliers,
      estimate,
      method,
      contribution,
    });
  }

  const allValues = sources.map((s) => s.rate);
  const allMethods = computeAllMethods(allValues);

  const cvValue = cv(allValues);
  const flags = [];
  if (cvValue > 60) flags.push('High dispersion (CV > 60%) — review source categorization');
  for (const tb of tierBreakdown) {
    if (tb.sources.length === 1) {
      flags.push(`Single-source tier: ${tb.tier} — treat with caution`);
    }
  }

  const baseValue = computeClosingValue(allValues, closingModeApplied);
  const finalValueWithPv = baseValue * pvFactor;

  return {
    finalValue: finalValueWithPv,
    tieredValue: finalValue,
    baseValue,
    pvFactor,
    closingModeApplied,
    tierBreakdown,
    allMethods,
    diagnostics: {
      cv: cvValue,
      totalSources: sources.length,
      sourcesPerTier: Object.fromEntries(TIER_ORDER.map((t) => [t, byTier[t].length])),
      flags,
    },
  };
}
