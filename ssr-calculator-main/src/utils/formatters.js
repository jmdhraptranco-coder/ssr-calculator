export function formatINR(value) {
  if (value == null || isNaN(value)) return '—';
  const num = Math.round(value);
  const str = num.toString();
  if (str.length <= 3) return '₹' + str;
  let result = str.slice(-3);
  let remaining = str.slice(0, -3);
  while (remaining.length > 2) {
    result = remaining.slice(-2) + ',' + result;
    remaining = remaining.slice(0, -2);
  }
  if (remaining.length > 0) {
    result = remaining + ',' + result;
  }
  return '₹' + result;
}

export function formatPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';
  return value.toFixed(decimals) + '%';
}

export const METHOD_DISPLAY_NAMES = {
  tieredWeightedBlend: 'Tiered Weighted Blend',
  simpleMean: 'Simple Mean',
  median: 'Median',
  trimmedMean: 'Trimmed Mean (10%)',
  winsorizedMean: 'Winsorized Mean (10%)',
  interquartileMean: 'Interquartile Mean',
  hodgesLehmann: 'Hodges-Lehmann Estimator',
  huberMEstimator: 'Huber M-Estimator',
  madFilteredMean: 'MAD-Filtered Mean',
  singleValue: 'Single Value',
};

export function getMethodDisplayName(key) {
  return METHOD_DISPLAY_NAMES[key] || key;
}

export const METHOD_COLORS = {
  simpleMean: '#6366f1',       // indigo
  median: '#0ea5e9',           // sky
  trimmedMean: '#14b8a6',      // teal
  winsorizedMean: '#22c55e',   // green
  interquartileMean: '#eab308',// yellow
  hodgesLehmann: '#f97316',    // orange
  huberMEstimator: '#ef4444',  // red
  madFilteredMean: '#ec4899',  // pink
  tieredWeightedBlend: '#8b5cf6', // violet
};

export function getMethodColor(key) {
  return METHOD_COLORS[key] || '#94a3b8';
}

export function formatNumber(value, decimals = 0) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
