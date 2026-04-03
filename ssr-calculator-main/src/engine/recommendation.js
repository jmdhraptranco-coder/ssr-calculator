import { cv } from './statistics.js';

export function recommendMethod(sources, tierWeights) {
  const tiersWithData = new Set(sources.map((s) => s.sourceType)).size;
  const n = sources.length;
  const values = sources.map((s) => s.rate);
  const cvValue = cv(values);

  if (tiersWithData >= 3) {
    return {
      method: 'tieredWeightedBlend',
      reason: 'Data available across 3+ tiers — tiered weighting gives the most balanced estimate',
      confidence: 'high',
    };
  }

  if (tiersWithData === 2) {
    return {
      method: 'tieredWeightedBlend',
      reason: 'Data in 2 tiers — tiered weighting applicable but verify with Hodges-Lehmann',
      confidence: 'medium',
    };
  }

  // Single tier — fall back to within-tier robust method
  // Note: for n=6-7, trimCount = floor(n*0.1) = 0, so trimmed mean equals simple mean of sorted values
  if (n >= 6) return { method: 'trimmedMean', reason: 'Sufficient data for trimmed mean analysis', confidence: 'high' };
  if (n >= 4) return { method: 'hodgesLehmann', reason: 'Best efficiency-robustness balance for moderate samples', confidence: 'medium' };
  if (n >= 2) return { method: 'median', reason: 'Too few points for advanced methods — median is safest', confidence: 'low' };
  return { method: 'singleValue', reason: 'Only one data point — no statistical method applicable', confidence: 'low' };
}
