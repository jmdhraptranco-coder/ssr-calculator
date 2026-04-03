import { TIER_COLOR_HEX, TIER_LABELS } from '../../engine/tieredCalculator';

export default function TierBadge({ tier, small = false }) {
  const color = TIER_COLOR_HEX[tier] || '#6b7280';
  const label = TIER_LABELS[tier] || tier;

  return (
    <span
      className="badge"
      style={{
        backgroundColor: color + '18',
        color: color,
        fontSize: small ? '0.625rem' : '0.6875rem',
        padding: small ? '0.0625rem 0.375rem' : '0.125rem 0.5rem',
      }}
    >
      {label}
    </span>
  );
}
