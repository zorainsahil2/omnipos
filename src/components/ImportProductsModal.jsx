import React, { useState, useRef, useMemo, useCallback } from 'react';
import { parseFile, validateFile } from '../lib/csvParser';
import { validateAllRows } from '../lib/csvValidator';
import { downloadCsvTemplate } from '../lib/csvTemplate';
import {
  fetchExistingSkus,
  batchInsertProducts,
  syncImportedProductsToLocal,
} from '../lib/productsApi';
import './ImportProductsModal.css';

// ─── Step indicator ──────────────────────────────────────────────────────────

const StepIndicator = ({ step }) => (
  <div className="ipm-steps">
    {[1, 2, 3].map((s, i) => (
      <React.Fragment key={s}>
        <div className={`ipm-step-dot ${step > s ? 'done' : step === s ? 'active' : ''}`}>
          {step > s ? '✓' : s}
        </div>
        {i < 2 && <div className={`ipm-step-line ${step > s ? 'done' : ''}`} />}
      </React.Fragment>
    ))}
    <div className="ipm-step-labels">
      <span className={step >= 1 ? 'active' : ''}>Upload</span>
      <span className={step >= 2 ? 'active' : ''}>Review</span>
      <span className={step >= 3 ? 'active' : ''}>Import</span>
    </div>
  </div>
);

// ─── Row status badge ────────────────────────────────────────────────────────

const RowStatus = ({ row }) => {
  if (row.isDuplicate && row.errors.length === 0)
    return <span className="ipm-badge ipm-badge-dup">⚠ Duplicate SKU</span>;
  if (row.errors.length > 0)
    return <span className="ipm-badge ipm-badge-err">✕ {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1}` : ''}</span>;
  return <span className="ipm-badge ipm-badge-ok">✓ Valid</span>;
};

// ─── Main component ──────────────────────────────────────────────────────────

export const ImportProductsModal = ({ tenantId, onClose, onImportComplete }) => {
  // Step
  const [step, setStep] = useState(1);

  // Step 1
  const [isDragOver, setIsDragOver]  = useState(false);
  const [parseError, setParseError]  = useState('');
  const [parsing, setParsing]        = useState(false);
  const fileInputRef = useRef(null);

  // Step 2
  const [validatedRows, setValidated]    = useState([]);
  const [duplicateAction, setDupAction]  = useState('skip');  // 'skip' | 'overwrite'
  const [rowFilter, setRowFilter]        = useState('all');    // 'all' | 'errors' | 'duplicates'
  const [rowSearch, setRowSearch]        = useState('');

  // Step 3
  const [progress, setProgress]  = useState({ inserted: 0, total: 0, failed: 0 });
  const [done, setDone]          = useState(false);
  const [failedList, setFailed]  = useState([]);
  const [importing, setImporting] = useState(false);

  // ── Derived counts ──
  const validRows     = useMemo(() => validatedRows.filter(r => r.isValid), [validatedRows]);
  const errorRows     = useMemo(() => validatedRows.filter(r => r.errors.length > 0), [validatedRows]);
  const duplicateRows = useMemo(() => validatedRows.filter(r => r.isDuplicate), [validatedRows]);

  // Rows that will actually be imported
  const rowsToImport = useMemo(() => {
    const dbDuplicatesIncluded = duplicateAction === 'overwrite'
      ? validRows  // also include DB-duplicate valid rows
      : validRows.filter(r => r.duplicateType !== 'db');
    return dbDuplicatesIncluded;
  }, [validRows, duplicateAction]);

  // Filtered table rows in Step 2
  const filteredRows = useMemo(() => {
    let rows = validatedRows;
    if (rowFilter === 'errors')     rows = rows.filter(r => r.errors.length > 0 && !r.isDuplicate);
    if (rowFilter === 'duplicates') rows = rows.filter(r => r.isDuplicate);
    if (rowSearch.trim()) {
      const q = rowSearch.toLowerCase();
      rows = rows.filter(r =>
        r.data.name?.toLowerCase().includes(q) ||
        r.data.sku?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [validatedRows, rowFilter, rowSearch]);

  // ── File parsing ──────────────────────────────────────────────────────────

  const processFile = useCallback(async (file) => {
    const fileErr = validateFile(file);
    if (fileErr) { setParseError(fileErr); return; }

    setParseError('');
    setParsing(true);
    try {
      const parsed     = await parseFile(file);
      if (!parsed.length) throw new Error('File is empty or has no data rows.');

      const existingSkus = await fetchExistingSkus();
      const validated    = validateAllRows(parsed, existingSkus);
      setValidated(validated);
      setStep(2);
    } catch (err) {
      setParseError(err.message || 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!rowsToImport.length) return;
    setStep(3);
    setImporting(true);
    setDone(false);
    setProgress({ inserted: 0, total: rowsToImport.length, failed: 0 });
    setFailed([]);

    try {
      const result = await batchInsertProducts(
        rowsToImport,
        tenantId,
        ({ inserted, total, failed }) => {
          setProgress({ inserted, total, failed });
        }
      );

      setFailed(result.failed);
      setProgress({ inserted: result.inserted, total: rowsToImport.length, failed: result.failed.length });

      // Sync offline cache
      await syncImportedProductsToLocal(tenantId);

      setDone(true);
    } catch (err) {
      setParseError(err.message);
      setDone(true);
    } finally {
      setImporting(false);
    }
  };

  const handleViewProducts = () => {
    onImportComplete?.();
    onClose();
  };

  // ── Prevent close during import ───────────────────────────────────────────

  const canClose = !importing;
  const handleOverlayClick = () => { if (canClose) onClose(); };

  // ── Render ────────────────────────────────────────────────────────────────

  const pct = progress.total > 0
    ? Math.round((progress.inserted / progress.total) * 100)
    : 0;

  return (
    <div className="ipm-overlay" onClick={handleOverlayClick}>
      <div className="ipm-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ipm-header">
          <h2 className="ipm-title">
            {step === 1 && '📤 Import Products'}
            {step === 2 && `📋 Review Import — ${validatedRows.length} rows found`}
            {step === 3 && (done ? '🎉 Import Complete' : '⏳ Importing…')}
          </h2>
          <button className="ipm-close" onClick={onClose} disabled={!canClose} aria-label="Close">✕</button>
        </div>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* ═══════════════════════════════════════════════════════
            STEP 1 — UPLOAD
        ═══════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="ipm-body">
            <div
              className={`ipm-drop-zone ${isDragOver ? 'dragover' : ''} ${parsing ? 'loading' : ''}`}
              onClick={() => !parsing && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
            >
              {parsing ? (
                <>
                  <div className="ipm-drop-spinner" />
                  <p className="ipm-drop-subtitle">Parsing file & checking duplicates…</p>
                </>
              ) : (
                <>
                  <div className="ipm-drop-icon">📄</div>
                  <p className="ipm-drop-title">Drag & drop CSV or XLSX here</p>
                  <p className="ipm-drop-subtitle">or click to browse</p>
                  <p className="ipm-drop-meta">Supported: .csv, .xlsx · Max size: 5 MB</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {parseError && (
              <div className="ipm-error-box" role="alert">{parseError}</div>
            )}

            <div className="ipm-template-row">
              <span className="ipm-template-hint">ℹ️ First time? Download the template</span>
              <button className="ipm-template-btn" onClick={downloadCsvTemplate}>
                ↓ Download CSV Template
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            STEP 2 — REVIEW
        ═══════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="ipm-body">
            {/* Summary pills */}
            <div className="ipm-summary">
              <div className="ipm-summary-pill ipm-pill-ok">
                <strong>{validRows.length}</strong> valid
              </div>
              <div className="ipm-summary-pill ipm-pill-err">
                <strong>{errorRows.length}</strong> error{errorRows.length !== 1 ? 's' : ''}
              </div>
              <div className="ipm-summary-pill ipm-pill-dup">
                <strong>{duplicateRows.length}</strong> duplicate{duplicateRows.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Row filter + search */}
            <div className="ipm-review-controls">
              <div className="ipm-filter-tabs">
                {[
                  { key: 'all',        label: 'All rows' },
                  { key: 'errors',     label: '❌ Errors' },
                  { key: 'duplicates', label: '⚠ Duplicates' },
                ].map(t => (
                  <button
                    key={t.key}
                    className={`ipm-tab ${rowFilter === t.key ? 'active' : ''}`}
                    onClick={() => setRowFilter(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input
                className="ipm-row-search"
                type="text"
                placeholder="Search name or SKU…"
                value={rowSearch}
                onChange={e => setRowSearch(e.target.value)}
              />
            </div>

            {/* Review table */}
            <div className="ipm-table-wrap">
              <table className="ipm-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>Row</th>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                        No rows match the current filter.
                      </td>
                    </tr>
                  )}
                  {filteredRows.map(row => (
                    <tr
                      key={row.rowIndex}
                      className={
                        row.errors.length > 0 ? 'ipm-row-err' :
                        row.isDuplicate ? 'ipm-row-dup' : ''
                      }
                    >
                      <td style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                        {row.rowNumber}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {row.data.name || <span style={{ color: '#64748b' }}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#94a3b8' }}>
                        {row.data.sku || '—'}
                      </td>
                      <td>
                        <span className={`ipm-type-badge ipm-type-${row.normType}`}>
                          {row.normType || row.data.type || '—'}
                        </span>
                      </td>
                      <td style={{ color: '#818cf8', fontWeight: 600 }}>
                        {row.data.selling_price ? `${row.data.selling_price}` : '—'}
                      </td>
                      <td><RowStatus row={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Duplicate action */}
            {duplicateRows.length > 0 && (
              <div className="ipm-dup-action">
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  ⚠ Duplicate SKUs:
                </span>
                <button
                  className={`ipm-dup-btn ${duplicateAction === 'skip' ? 'active' : ''}`}
                  onClick={() => setDupAction('skip')}
                >
                  Skip (default)
                </button>
                <button
                  className={`ipm-dup-btn ${duplicateAction === 'overwrite' ? 'active' : ''}`}
                  onClick={() => setDupAction('overwrite')}
                >
                  Overwrite
                </button>
              </div>
            )}

            {/* Footer actions */}
            <div className="ipm-footer">
              <button className="ipm-btn-cancel" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className="ipm-btn-import"
                onClick={handleImport}
                disabled={rowsToImport.length === 0}
              >
                Import {rowsToImport.length} Valid Row{rowsToImport.length !== 1 ? 's' : ''} →
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            STEP 3 — PROGRESS & RESULT
        ═══════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="ipm-body">
            {/* Progress bar */}
            <div className="ipm-progress-wrap">
              <div className="ipm-progress-track">
                <div className="ipm-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="ipm-progress-label">
                {done
                  ? `${progress.inserted} / ${progress.total} rows processed`
                  : `${progress.inserted} / ${progress.total} rows inserted…`
                }
              </p>
            </div>

            {/* Live stats */}
            <div className="ipm-result-stats">
              <div className="ipm-stat ipm-stat-ok">
                <span className="ipm-stat-num">{progress.inserted}</span>
                <span className="ipm-stat-label">inserted</span>
              </div>
              <div className="ipm-stat ipm-stat-err">
                <span className="ipm-stat-num">{progress.failed}</span>
                <span className="ipm-stat-label">failed</span>
              </div>
            </div>

            {/* Failed list */}
            {done && failedList.length > 0 && (
              <div className="ipm-failed-list">
                <p style={{ color: '#fca5a5', fontWeight: 700, marginBottom: '6px' }}>
                  Failed rows:
                </p>
                {failedList.map((f, i) => (
                  <div key={i} className="ipm-failed-row">
                    Row {f.rowNumber} · SKU: {f.sku || '—'} → {f.reason}
                  </div>
                ))}
              </div>
            )}

            {/* Done state */}
            {done && (
              <div className="ipm-done-msg">
                {progress.inserted > 0
                  ? `🎉 ${progress.inserted} product${progress.inserted !== 1 ? 's' : ''} successfully imported!`
                  : '⚠ No products were imported.'
                }
              </div>
            )}

            {/* Footer */}
            {done && (
              <div className="ipm-footer">
                <button className="ipm-btn-cancel" onClick={onClose}>Close</button>
                <button className="ipm-btn-import" onClick={handleViewProducts}>
                  View Products →
                </button>
              </div>
            )}

            {/* Importing indicator */}
            {!done && (
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem', marginTop: '8px' }}>
                Please wait, do not close this window…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
