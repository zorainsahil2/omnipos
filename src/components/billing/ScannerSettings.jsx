/**
 * ScannerSettings Modal Panel
 * Props:
 *   enabled: boolean
 *   onToggleEnabled: (val: boolean) => void
 *   timeGap: number
 *   onTimeGapChange: (val: number) => void
 *   minLength: number
 *   onMinLengthChange: (val: number) => void
 *   testMode: boolean
 *   onToggleTestMode: (val: boolean) => void
 *   lastTestScan: { barcode: string, found: boolean, name?: string } | null
 *   onClose: () => void
 */
export function ScannerSettings({
  enabled,
  onToggleEnabled,
  timeGap,
  onTimeGapChange,
  minLength = 3,
  onMinLengthChange,
  testMode,
  onToggleTestMode,
  lastTestScan,
  onClose
}) {
  return (
    <div className="scanner-settings-overlay" onClick={onClose}>
      <div className="scanner-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="scanner-settings-header">
          <h3>⚡ Barcode Scanner Settings</h3>
          <button type="button" className="scanner-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="scanner-settings-body">
          {/* Scanner Toggle */}
          <div className="settings-section">
            <label className="settings-label">Scanner Mode</label>
            <div className="settings-toggle-group">
              <label className={`toggle-btn ${enabled ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scanner_mode"
                  checked={enabled}
                  onChange={() => onToggleEnabled(true)}
                  style={{ display: 'none' }}
                />
                🟢 Enabled
              </label>
              <label className={`toggle-btn ${!enabled ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scanner_mode"
                  checked={!enabled}
                  onChange={() => onToggleEnabled(false)}
                  style={{ display: 'none' }}
                />
                🔴 Disabled
              </label>
            </div>
          </div>

          {/* Timing Gap Slider */}
          <div className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="settings-label">Character Input Delay</label>
              <span className="settings-value-badge">{timeGap} ms</span>
            </div>
            <p className="settings-help-text">
              Max millisecond delay between keys. Fast (50ms) is ideal for USB. Increase if scanner is slow.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Fast (20ms)</span>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={timeGap}
                onChange={e => onTimeGapChange(parseInt(e.target.value))}
                className="scanner-range-slider"
                disabled={!enabled}
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>Slow (200ms)</span>
            </div>
          </div>

          {/* Min Length */}
          <div className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="settings-label">Min Barcode Length</label>
              <span className="settings-value-badge">{minLength} chars</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={minLength}
              onChange={e => onMinLengthChange(parseInt(e.target.value))}
              className="scanner-range-slider"
              disabled={!enabled}
            />
          </div>

          {/* Test Scanner Mode */}
          <div className="settings-section test-scanner-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="settings-label">Test Mode</label>
              <button
                type="button"
                className={`test-toggle-btn ${testMode ? 'active' : ''}`}
                onClick={() => onToggleTestMode(!testMode)}
                disabled={!enabled}
              >
                {testMode ? '🔬 Test Mode ON' : '🔬 Test Mode OFF'}
              </button>
            </div>
            <p className="settings-help-text" style={{ marginBottom: '12px' }}>
              When ON, scans are analyzed and outputted below without adding the product to your bill.
            </p>

            {testMode && (
              <div className="scanner-test-box">
                {lastTestScan ? (
                  <div className="test-scan-result">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="test-scan-code">Code: <code>{lastTestScan.barcode}</code></span>
                      <span className={`test-scan-status ${lastTestScan.found ? 'found' : 'not-found'}`}>
                        {lastTestScan.found ? '✅ Found' : '❌ Not Found'}
                      </span>
                    </div>
                    {lastTestScan.found && (
                      <div className="test-scan-product">
                        Product: <strong>{lastTestScan.name}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="test-scan-placeholder">Ready to scan... Scan a barcode now!</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
