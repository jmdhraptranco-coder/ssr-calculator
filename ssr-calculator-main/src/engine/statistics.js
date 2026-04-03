/**
 * Statistical methods for SSR rate calculation.
 * All functions take an array of numbers and return a single number.
 */

export function simpleMean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function trimmedMean(values, trimPercent = 0.1) {
  if (values.length < 4) return simpleMean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimPercent);
  if (trimCount === 0) return simpleMean(sorted);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return simpleMean(trimmed);
}

export function winsorizedMean(values, trimPercent = 0.1) {
  if (values.length < 4) return simpleMean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * trimPercent);
  if (k === 0) return simpleMean(sorted);
  const winsorized = sorted.map((v, i) => {
    if (i < k) return sorted[k];
    if (i >= sorted.length - k) return sorted[sorted.length - k - 1];
    return v;
  });
  return simpleMean(winsorized);
}

export function interquartileMean(values) {
  if (values.length < 4) return simpleMean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.ceil(sorted.length * 0.75);
  const iqrValues = sorted.slice(q1Idx, q3Idx);
  return simpleMean(iqrValues);
}

export function hodgesLehmann(values) {
  if (values.length < 2) return values[0] || 0;
  const pairwiseAverages = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i; j < values.length; j++) {
      pairwiseAverages.push((values[i] + values[j]) / 2);
    }
  }
  return median(pairwiseAverages);
}

export function huberMEstimator(values, k = 1.345, maxIter = 50) {
  if (values.length < 2) return values[0] || 0;
  let mu = median(values);
  const s = mad(values) || standardDeviation(values) || 1;

  for (let iter = 0; iter < maxIter; iter++) {
    let numerator = 0;
    let denominator = 0;
    for (const x of values) {
      const u = (x - mu) / s;
      const w = Math.abs(u) <= k ? 1 : k / Math.abs(u);
      numerator += w * x;
      denominator += w;
    }
    const newMu = numerator / denominator;
    if (Math.abs(newMu - mu) < 1e-6) break;
    mu = newMu;
  }
  return mu;
}

export function madFilteredMean(values, threshold = 2) {
  if (values.length < 3) return simpleMean(values);
  const med = median(values);
  const madVal = mad(values);
  if (madVal === 0) return simpleMean(values);
  const scaledMad = madVal * 1.4826; // consistency constant for normal
  const filtered = values.filter(
    (v) => Math.abs(v - med) <= threshold * scaledMad
  );
  return filtered.length > 0 ? simpleMean(filtered) : simpleMean(values);
}

// --- Helper functions ---

export function mad(values) {
  if (values.length < 2) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

export function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = simpleMean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function cv(values) {
  if (values.length < 2) return 0;
  const mean = simpleMean(values);
  if (mean === 0) return 0;
  return (standardDeviation(values) / mean) * 100;
}

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
}

export function iqr(values) {
  return percentile(values, 75) - percentile(values, 25);
}

export const ALL_METHODS = [
  { key: 'simpleMean', name: 'Simple Mean', fn: simpleMean, minN: 1 },
  { key: 'median', name: 'Median', fn: median, minN: 1 },
  { key: 'trimmedMean', name: 'Trimmed Mean (10%)', fn: trimmedMean, minN: 4 },
  { key: 'winsorizedMean', name: 'Winsorized Mean (10%)', fn: winsorizedMean, minN: 4 },
  { key: 'interquartileMean', name: 'Interquartile Mean', fn: interquartileMean, minN: 4 },
  { key: 'hodgesLehmann', name: 'Hodges-Lehmann', fn: hodgesLehmann, minN: 2 },
  { key: 'huberMEstimator', name: 'Huber M-Estimator', fn: huberMEstimator, minN: 3 },
  { key: 'madFilteredMean', name: 'MAD-Filtered Mean', fn: madFilteredMean, minN: 3 },
];

export function computeAllMethods(values) {
  const results = {};
  for (const method of ALL_METHODS) {
    results[method.key] =
      values.length >= method.minN ? method.fn(values) : null;
  }
  return results;
}
