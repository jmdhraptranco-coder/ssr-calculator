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
      <div className="calc-mode-header">
        <span className="calc-mode-title">Price Variation and Closing Strategy</span>
        <button
          type="button"
          className="calc-mode-help"
          title="PV scales the final value. Closing selects the base formula used before PV."
          aria-label="PV and Closing help"
        >
          ?
        </button>
      </div>
      <div className="calc-mode-row">
        <div className="calc-mode-group">
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
        </div>

        <div className="calc-mode-group">
          <label className="calc-mode-label" htmlFor="closing-mode-select">
            Closing Formula
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
      <p className="calc-mode-note">Final SSR = Base Closing Value × PV Factor</p>
    </div>
  );
}
