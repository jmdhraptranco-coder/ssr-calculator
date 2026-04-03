import { formatINR } from '../../utils/formatters';

export default function StatCard({ label, value, format = 'inr', subtitle, status }) {
  const statusColors = {
    green: 'border-l-green-500',
    amber: 'border-l-amber-500',
    red: 'border-l-red-500',
  };

  const formatted = format === 'inr' ? formatINR(value)
    : format === 'percent' ? (value != null ? value.toFixed(1) + '%' : '—')
    : format === 'number' ? (value != null ? value.toLocaleString('en-IN') : '—')
    : String(value ?? '—');

  return (
    <div className={`card border-l-4 ${statusColors[status] || 'border-l-slate-300'}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{formatted}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
