import { useState, useEffect, useRef } from 'react';
import { updateProduct } from '../lib/productsApi';
import { useAuth } from '../context/AuthContext';
import { ProductImageUploader } from './ProductImageUploader';
import './EditProductModal.css';

/**
 * EditProductModal
 * Props:
 *   product  — the product object to edit
 *   onClose  — called when modal is dismissed
 *   onSaved  — called with the updated product after save
 */
export const EditProductModal = ({ product, onClose, onSaved }) => {
  const { tenant } = useAuth();

  // Form state — pre-filled from product
  const [name, setName]                   = useState(product.name || '');
  const [barcode, setBarcode]             = useState(product.barcode || '');
  const [genericName, setGenericName]     = useState(product.generic_name || '');
  const [manufacturer, setManufacturer]   = useState(product.manufacturer || '');
  const [prescriptionReq, setPrescReq]    = useState(product.prescription_required || false);
  const [imageUrl, setImageUrl]           = useState(product.image_url || null);
  const [category, setCategory]           = useState(product.category || (product.type === 'medical' ? 'Medical' : 'Grocery'));

  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  const firstInputRef = useRef(null);

  // Auto-focus first input when modal opens
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // ESC key closes modal
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validate = () => {
    if (!name.trim()) return 'Product name cannot be empty.';
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    setSaving(true);

    try {
      const fields = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        image_url: imageUrl,
        category: category,
        ...(product.type === 'medical' && {
          generic_name: genericName.trim() || null,
          manufacturer: manufacturer.trim() || null,
          prescription_required: prescriptionReq,
        }),
      };

      const updated = await updateProduct(product.id, fields);
      onSaved(updated);
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="epm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit product"
    >
      <div className="epm-box" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="epm-header">
          <h2 className="epm-title">✏️ Edit Product</h2>
          <button className="epm-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {/* Error banner */}
        {formError && (
          <div className="epm-error" role="alert">{formError}</div>
        )}

        <form className="epm-form" onSubmit={handleSave} noValidate>

          <div className="epm-top-row">
            <ProductImageUploader
              productId={product.id}
              currentImageUrl={imageUrl}
              onImageChange={setImageUrl}
              tenantId={tenant?.id}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, width: '100%' }}>
              {/* Product Name */}
              <div className="epm-field">
                <label htmlFor="epm-name">Product Name *</label>
                <input
                  id="epm-name"
                  ref={firstInputRef}
                  type="text"
                  className="epm-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sugar, Paracetamol"
                />
              </div>

              {/* Barcode */}
              <div className="epm-field">
                <label htmlFor="epm-barcode">Barcode / SKU</label>
                <input
                  id="epm-barcode"
                  type="text"
                  className="epm-input"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {/* Category */}
              <div className="epm-field">
                <label htmlFor="epm-category">Category *</label>
                <select
                  id="epm-category"
                  className="epm-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#f8fafc' }}
                >
                  <option value="Grocery">Grocery</option>
                  <option value="Medical">Medical</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Drinks">Drinks</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Medical-only fields */}
          {product.type === 'medical' && (
            <>
              <div className="epm-divider-label">Medical Details</div>

              <div className="epm-row-2">
                <div className="epm-field">
                  <label htmlFor="epm-generic">Generic Formula</label>
                  <input
                    id="epm-generic"
                    type="text"
                    className="epm-input"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    placeholder="e.g. Ibuprofen"
                  />
                </div>
                <div className="epm-field">
                  <label htmlFor="epm-mfg">Manufacturer</label>
                  <input
                    id="epm-mfg"
                    type="text"
                    className="epm-input"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="e.g. GSK, Pfizer"
                  />
                </div>
              </div>

              <label className="epm-checkbox-row">
                <input
                  type="checkbox"
                  checked={prescriptionReq}
                  onChange={(e) => setPrescReq(e.target.checked)}
                />
                <span>Requires Prescription (Schedule H / X)</span>
              </label>
            </>
          )}

          {/* Read-only info */}
          <div className="epm-readonly-row">
            <span>Type: <strong>{product.type}</strong></span>
            <span>Base Unit:&nbsp;
              <strong>
                {product.product_units?.find(u => u.is_base_unit)?.unit_name || '—'}&nbsp;
                ({tenant?.currency} {product.product_units?.find(u => u.is_base_unit)?.price?.toFixed(2)})
              </strong>
            </span>
          </div>
          <p className="epm-hint">
            📌 To change units or pricing, delete this product and re-add it with updated units.
          </p>

          {/* Actions */}
          <div className="epm-actions">
            <button
              type="button"
              className="epm-btn-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="epm-btn-save"
              disabled={saving}
            >
              {saving
                ? <><span className="epm-spinner"></span> Saving…</>
                : '💾 Save Changes'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
