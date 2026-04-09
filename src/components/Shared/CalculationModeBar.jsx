export const CLOSING_OPTIONS = [
  { value: 'auto', label: 'Auto (MOOSE default)' },
  { value: 'dev2', label: '1/DEV^2 (CT/LA)' },
  { value: 'sumP2overP', label: 'SP^2/SP (MOOSE)' },
];

export default function CalculationModeBar({
  pvValue,
  onPvChange,
  closingMode,
  onClosingModeChange,
}) {
  return (
    <div className="calc-mode-bar mb-4">
      <div className="calc-mode-row">
        <label className="calc-mode-label" htmlFor="price-variation-input">
          Price Variation (PV)
        </label>
        <input
          id="price-variation-input"
          type="number"
          min="0"
          step="0.01"
          value={pvValue}
          onChange={(e) => onPvChange(e.target.value)}
          className="calc-mode-pv-input"
        />
        <button
          type="button"
          className="calc-mode-help"
          title="PV and Closing mode are UI configuration controls for calculation strategy."
          aria-label="PV and Closing help"
        >
          ?
        </button>

        <label className="calc-mode-label" htmlFor="closing-mode-select">
          Closing
        </label>
        <select
          id="closing-mode-select"
          value={closingMode}
          onChange={(e) => onClosingModeChange(e.target.value)}
          className="calc-mode-select"
        >
          {CLOSING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
