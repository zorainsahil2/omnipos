import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import { updateProduct, softDeleteProduct } from '../lib/productsApi';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { EditProductModal } from './EditProductModal';
import './Inventory.css';

/* ── Inline Delete Confirm Cell ───────────────────────────────── */
const DeleteCell = ({ product, onDeleted, onError }) => {
  const [phase, setPhase]   = useState('idle');   // idle | confirm | deleting | fading
  const timerRef            = useRef(null);
  const isOnline            = useOnlineStatus();

  const startConfirm = () => {
    setPhase('confirm');
    timerRef.current = setTimeout(() => setPhase('idle'), 3000); // auto-revert in 3s
  };

  const cancelConfirm = () => {
    clearTimeout(timerRef.current);
    setPhase('idle');
  };

  const handleDelete = async () => {
    clearTimeout(timerRef.current);
    setPhase('deleting');
    try {
      if (isOnline) {
        await softDeleteProduct(product.id);
      } else {
        // Offline: only remove from local cache
        await localDb.products.delete(product.id);
      }
      setPhase('fading');
      setTimeout(() => onDeleted(product.id), 320); // wait for fade CSS
    } catch (err) {
      setPhase('idle');
      onError(err.message);
    }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (phase === 'idle') {
    return (
      <button
        className="pm-action-btn pm-delete-btn"
        onClick={startConfirm}
        title="Delete product"
        aria-label="Delete product"
      >
        🗑
      </button>
    );
  }

  if (phase === 'confirm') {
    return (
      <span className="pm-confirm-row">
        <button
          className="pm-confirm-btn"
          onClick={handleDelete}
          aria-label="Confirm delete product"
        >
          Confirm?
        </button>
        <button className="pm-cancel-btn" onClick={cancelConfirm}>Cancel</button>
      </span>
    );
  }

  if (phase === 'deleting') {
    return <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Deleting…</span>;
  }

  return null; // fading state — parent row handles animation
};

/* ── Main ProductManagement ───────────────────────────────────── */
export const ProductManagement = () => {
  const { tenant } = useAuth();
  const isOnline = useOnlineStatus();

  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [editingProduct, setEditing]  = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set()); // ids currently fading out
  const [toast, setToast]             = useState('');

  // New Product Form State
  const [name, setName]             = useState('');
  const [barcode, setBarcode]       = useState('');
  const [type, setType]             = useState('grocery');
  const [genericName, setGenericName]           = useState('');
  const [manufacturer, setManufacturer]         = useState('');
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);
  const [baseUnit, setBaseUnit]     = useState('Kg');
  const [basePrice, setBasePrice]   = useState(0);
  const [extraUnits, setExtraUnits] = useState([]);
  const [newUnitName, setNewUnitName]     = useState('');
  const [newUnitFactor, setNewUnitFactor] = useState(1);
  const [newUnitPrice, setNewUnitPrice]   = useState(0);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3500);
  };

  /* ── Fetch ── */
  const fetchProducts = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const { data: dbProducts, error: prodErr } = await supabase
          .from('products')
          .select('*, product_units(*)')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (prodErr) throw prodErr;
        setProducts(dbProducts || []);

        await localDb.products.clear();
        await localDb.productUnits.clear();
        for (const prod of dbProducts) {
          const { product_units, ...prodInfo } = prod;
          await localDb.products.put(prodInfo);
          if (product_units?.length) await localDb.productUnits.bulkPut(product_units);
        }
      } else {
        const localProds = await localDb.products.toArray();
        const enriched = [];
        for (const prod of localProds) {
          const units = await localDb.productUnits.where('product_id').equals(prod.id).toArray();
          enriched.push({ ...prod, product_units: units });
        }
        setProducts(enriched);
      }
    } catch (err) {
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenant?.id) fetchProducts();
    if (tenant?.store_type) {
      const isMedical = tenant.store_type === 'medical';
      setType(isMedical ? 'medical' : 'grocery');
      setBaseUnit(isMedical ? 'Tablet' : 'Kg');
    }
  }, [tenant, isOnline]);

  /* ── Optimistic delete ── */
  const handleProductDeleted = (productId) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    showToast('✅ Product removed from catalog.');
  };

  /* ── Optimistic edit save ── */
  const handleProductSaved = (updatedProduct) => {
    setProducts(prev =>
      prev.map(p => p.id === updatedProduct.id
        ? { ...p, ...updatedProduct }
        : p
      )
    );
    showToast('✅ Product updated successfully.');
  };

  /* ── Add extra unit ── */
  const handleAddExtraUnit = (e) => {
    e.preventDefault();
    if (!newUnitName) return;
    setExtraUnits([...extraUnits, {
      unit_name: newUnitName,
      conversion_factor: parseFloat(newUnitFactor),
      price: parseFloat(newUnitPrice),
      is_base_unit: false,
    }]);
    setNewUnitName(''); setNewUnitFactor(1); setNewUnitPrice(0);
  };

  const handleRemoveExtraUnit = (idx) => setExtraUnits(extraUnits.filter((_, i) => i !== idx));

  /* ── Create product ── */
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!name || !baseUnit) return;
    setLoading(true);
    try {
      const productId = crypto.randomUUID();
      const productPayload = {
        id: productId,
        tenant_id: tenant.id,
        name,
        barcode: barcode || null,
        type,
        is_active: true,
        generic_name: type === 'medical' ? genericName : null,
        manufacturer: type === 'medical' ? manufacturer : null,
        prescription_required: type === 'medical' ? prescriptionRequired : false,
      };
      const baseUnitPayload = {
        id: crypto.randomUUID(),
        product_id: productId,
        unit_name: baseUnit,
        is_base_unit: true,
        conversion_factor: 1.0,
        price: parseFloat(basePrice),
      };
      const extraUnitsPayload = extraUnits.map(u => ({
        id: crypto.randomUUID(),
        product_id: productId,
        unit_name: u.unit_name,
        is_base_unit: false,
        conversion_factor: u.conversion_factor,
        price: u.price,
      }));
      const allUnits = [baseUnitPayload, ...extraUnitsPayload];

      if (isOnline) {
        const { error: pErr } = await supabase.from('products').insert(productPayload);
        if (pErr) throw pErr;
        const { error: uErr } = await supabase.from('product_units').insert(allUnits);
        if (uErr) throw uErr;
      }
      await localDb.products.put(productPayload);
      await localDb.productUnits.bulkPut(allUnits);

      // Reset form
      setName(''); setBarcode(''); setGenericName(''); setManufacturer('');
      setPrescriptionRequired(false); setBasePrice(0); setExtraUnits([]);
      fetchProducts();
      showToast('✅ Product added to catalog!');
    } catch (err) {
      showToast('❌ ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inventory-layout">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '18px', right: '18px', zIndex: 600,
          background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(99,102,241,0.3)',
          padding: '11px 18px', borderRadius: '12px',
          color: toast.isError ? '#fca5a5' : '#e2e8f0',
          fontSize: '0.88rem', fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          animation: 'fadeSlideIn 0.25s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Edit modal */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditing(null)}
          onSaved={handleProductSaved}
        />
      )}

      {/* ── Product List Card ── */}
      <div className="inventory-card">
        <div className="card-title">
          <span>Active Product Catalog</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>
            {isOnline
              ? <span className="badge badge-green">Online</span>
              : <span className="badge badge-red">Offline Mode</span>
            }
          </span>
        </div>

        {loading && products.length === 0 ? (
          <p style={{ color: '#64748b' }}>Loading catalog…</p>
        ) : (
          <div className="inventory-table-container">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Barcode</th>
                  <th>Type</th>
                  <th>Base Unit</th>
                  <th>Alternate Units</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr
                    key={prod.id}
                    className={deletingIds.has(prod.id) ? 'pm-row-fading' : ''}
                  >
                    <td>
                      <div><strong>{prod.name}</strong></div>
                      {prod.type === 'medical' && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '3px' }}>
                          Gen: {prod.generic_name || 'N/A'} · Mfg: {prod.manufacturer || 'N/A'}
                        </div>
                      )}
                    </td>
                    <td>{prod.barcode || '—'}</td>
                    <td>
                      <span className={`badge ${prod.type === 'medical' ? 'badge-purple' : 'badge-blue'}`}>
                        {prod.type}
                      </span>
                    </td>
                    <td>
                      {prod.product_units?.find(u => u.is_base_unit)?.unit_name}
                      {' '}
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        ({tenant?.currency} {prod.product_units?.find(u => u.is_base_unit)?.price?.toFixed(2)})
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {prod.product_units?.filter(u => !u.is_base_unit).map(u => (
                          <span key={u.id} className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                            {u.unit_name} (×{u.conversion_factor})
                          </span>
                        ))}
                        {(prod.product_units?.filter(u => !u.is_base_unit).length === 0) && (
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>None</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="pm-actions-cell">
                        {/* Edit button */}
                        <button
                          className="pm-action-btn pm-edit-btn"
                          onClick={() => setEditing(prod)}
                          title="Edit product"
                          aria-label="Edit product"
                        >
                          ✏️
                        </button>

                        {/* Delete with inline confirm */}
                        <DeleteCell
                          product={prod}
                          onDeleted={handleProductDeleted}
                          onError={(msg) => showToast('❌ ' + msg, true)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No products found. Use the form below to add your first product.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Product Card ── */}
      <div className="inventory-card">
        <h3 className="card-title">Add New Product</h3>
        <form className="compact-form" onSubmit={handleCreateProduct}>
          <div className="form-group-sm">
            <label>Product Name *</label>
            <input type="text" placeholder="e.g. Sugar, Paracetamol" value={name}
              onChange={e => setName(e.target.value)} required />
          </div>

          <div className="form-group-sm">
            <label>Barcode / SKU (Optional)</label>
            <input type="text" placeholder="Scan or type barcode" value={barcode}
              onChange={e => setBarcode(e.target.value)} />
          </div>

          <div className="form-group-sm">
            <label>Product Type</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="grocery">Grocery Item</option>
              <option value="medical">Medical / Medicine</option>
            </select>
          </div>

          {type === 'medical' && (
            <>
              <div className="form-group-sm">
                <label>Generic Formula</label>
                <input type="text" placeholder="e.g. Ibuprofen" value={genericName}
                  onChange={e => setGenericName(e.target.value)} />
              </div>
              <div className="form-group-sm">
                <label>Manufacturer</label>
                <input type="text" placeholder="e.g. GSK, Pfizer" value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)} />
              </div>
              <div className="form-group-sm" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input type="checkbox" id="rxReq" checked={prescriptionRequired}
                  onChange={e => setPrescriptionRequired(e.target.checked)} />
                <label htmlFor="rxReq" style={{ cursor: 'pointer' }}>Requires Prescription</label>
              </div>
            </>
          )}

          <div className="form-row">
            <div className="form-group-sm">
              <label>Base Sale Unit *</label>
              <input type="text" placeholder={type === 'medical' ? 'e.g. Tablet' : 'e.g. Kg'}
                value={baseUnit} onChange={e => setBaseUnit(e.target.value)} required />
            </div>
            <div className="form-group-sm">
              <label>Base Unit Selling Price ({tenant?.currency})</label>
              <input type="number" step="0.01" min="0" value={basePrice}
                onChange={e => setBasePrice(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px', marginTop: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1' }}>
              Bulk / Alternate Packaging Units
            </label>
            {extraUnits.length > 0 && (
              <div className="unit-list">
                {extraUnits.map((u, idx) => (
                  <div key={idx} className="unit-item">
                    <span>1 <strong>{u.unit_name}</strong> = {u.conversion_factor} {baseUnit}s</span>
                    <span style={{ color: '#94a3b8' }}>Price: {tenant?.currency} {u.price.toFixed(2)}</span>
                    <span className="unit-item-remove" onClick={() => handleRemoveExtraUnit(idx)}>×</span>
                  </div>
                ))}
              </div>
            )}
            <div className="add-unit-row">
              <div className="form-group-sm">
                <label>Unit Name</label>
                <input type="text" placeholder="e.g. Bag, Box, Strip" value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)} />
              </div>
              <div className="form-group-sm">
                <label>Ratio to Base</label>
                <input type="number" step="0.01" min="0.01" placeholder="e.g. 50" value={newUnitFactor}
                  onChange={e => setNewUnitFactor(parseFloat(e.target.value) || 1)} />
              </div>
              <div className="form-group-sm">
                <label>Unit Price</label>
                <input type="number" step="0.01" min="0" value={newUnitPrice}
                  onChange={e => setNewUnitPrice(parseFloat(e.target.value) || 0)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleAddExtraUnit}>
                Add Unit
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '14px' }} disabled={loading}>
            {loading ? 'Saving…' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  );
};
