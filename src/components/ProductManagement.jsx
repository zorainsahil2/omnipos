import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import {
  fetchFilteredProducts,
  fetchFilteredProductsOffline,
  fetchFilterOptions,
  softDeleteProduct,
  updateProduct,
  sortProducts,
  stockStatus,
} from '../lib/productsApi';
import { downloadCsvTemplate } from '../lib/csvTemplate';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { EditProductModal } from './EditProductModal';
import { ImportProductsModal } from './ImportProductsModal';
import { ProductImageUploader } from './ProductImageUploader';
import './Inventory.css';

// ─── constants ──────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  search: '',
  type: 'all',
  brand: 'all',
  priceMin: '',
  priceMax: '',
  stockStatus: 'all',
};

const SORT_OPTIONS = [
  { value: 'name_asc',   label: 'Name A → Z' },
  { value: 'name_desc',  label: 'Name Z → A' },
  { value: 'price_asc',  label: 'Price Low → High' },
  { value: 'price_desc', label: 'Price High → Low' },
  { value: 'stock_asc',  label: 'Stock Low → High' },
  { value: 'stock_desc', label: 'Stock High → Low' },
];

// ─── Highlight matching text ─────────────────────────────────────────────────

const Highlight = ({ text, search }) => {
  if (!search?.trim() || !text) return <>{text || ''}</>;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="pm-highlight">{part}</mark>
          : part
      )}
    </>
  );
};

// ─── Stock badge ─────────────────────────────────────────────────────────────

const StockBadge = ({ qty, reorderLevel = 10, unit = '' }) => {
  const status = stockStatus(qty, reorderLevel);
  const label  = qty.toFixed(qty % 1 === 0 ? 0 : 2);
  if (status === 'out_of_stock') return <span className="pm-badge-out">❌ 0 {unit}</span>;
  if (status === 'low_stock')    return <span className="pm-badge-low">⚠️ {label} {unit}</span>;
  return <span className="pm-badge-stock">✅ {label} {unit}</span>;
};

// ─── Skeleton row ────────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <tr className="pm-skeleton-row">
    {[...Array(9)].map((_, i) => (
      <td key={i}><div className="pm-skeleton-cell" /></td>
    ))}
  </tr>
);

// ─── Inline Delete Cell ───────────────────────────────────────────────────────

const DeleteCell = ({ product, onDeleted, onError }) => {
  const [phase, setPhase] = useState('idle');
  const timerRef          = useRef(null);
  const isOnline          = useOnlineStatus();

  const startConfirm = () => {
    setPhase('confirm');
    timerRef.current = setTimeout(() => setPhase('idle'), 3000);
  };
  const cancelConfirm = () => { clearTimeout(timerRef.current); setPhase('idle'); };

  const handleDelete = async () => {
    clearTimeout(timerRef.current);
    setPhase('deleting');
    try {
      if (isOnline) {
        await softDeleteProduct(product.id);
      } else {
        await localDb.products.delete(product.id);
      }
      setPhase('fading');
      setTimeout(() => onDeleted(product.id), 320);
    } catch (err) {
      setPhase('idle');
      onError(err.message);
    }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (phase === 'idle')
    return (
      <button className="pm-action-btn pm-delete-btn" onClick={startConfirm}
        title="Delete product" aria-label="Delete product">🗑</button>
    );

  if (phase === 'confirm')
    return (
      <span className="pm-confirm-row">
        <button className="pm-confirm-btn" onClick={handleDelete}
          aria-label="Confirm delete product">Confirm?</button>
        <button className="pm-cancel-btn" onClick={cancelConfirm}>Cancel</button>
      </span>
    );

  if (phase === 'deleting')
    return <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Deleting…</span>;

  return null;
};

// ─── Active filter count ──────────────────────────────────────────────────────

const countActiveFilters = (f) =>
  [f.search, f.type !== 'all', f.brand !== 'all',
   f.priceMin !== '', f.priceMax !== '', f.stockStatus !== 'all']
    .filter(Boolean).length;

// ─── Main Component ───────────────────────────────────────────────────────────

export const ProductManagement = () => {
  const { tenant }  = useAuth();
  const isOnline    = useOnlineStatus();

  // ── Filter state ──
  const [filters, setFilters]   = useState(DEFAULT_FILTERS);
  const [sortBy, setSortBy]     = useState('name_asc');
  const debouncedSearch         = useDebounce(filters.search, 300);

  // ── Data state ──
  const [rawProducts, setRaw]   = useState([]);  // unfiltered server results
  const [filterOptions, setOpts]= useState({ brands: [] });
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState('');

  // ── Import modal state ──
  const [showImport, setShowImport] = useState(false);

  // ── Edit / delete state ──
  const [editingProduct, setEditing] = useState(null);

  // ── Add-form state ──
  const [name, setName]               = useState('');
  const [barcode, setBarcode]         = useState('');
  const [sku, setSku]                 = useState('');
  const [brand, setBrand]             = useState('');
  const [type, setType]               = useState('grocery');
  const [category, setCategory]       = useState('Grocery');
  const [genericName, setGenericName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [prescriptionReq, setPrescReq]  = useState(false);
  const [baseUnit, setBaseUnit]       = useState('Kg');
  const [basePrice, setBasePrice]     = useState(0);
  const [reorderLevel, setReorderLevel] = useState(10);
  const [extraUnits, setExtraUnits]   = useState([]);
  const [newUnitName, setNewUnitName]   = useState('');
  const [newUnitFactor, setNewUnitFactor] = useState(1);
  const [newUnitPrice, setNewUnitPrice]   = useState(0);
  const [formLoading, setFormLoading] = useState(false);

  // ── Image states ──
  const [addProductId, setAddProductId] = useState(() => crypto.randomUUID());
  const [addImageUrl, setAddImageUrl]   = useState(null);
  const [lightboxUrl, setLightboxUrl]   = useState(null);

  // ── Derived ──
  const activeFilterCount = countActiveFilters({ ...filters, search: debouncedSearch });
  const hasFilters = activeFilterCount > 0;

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3500);
  };

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const activeFilters = { ...filters, search: debouncedSearch };
      let data;
      if (isOnline) {
        data = await fetchFilteredProducts(activeFilters);
        // Cache products locally
        for (const p of data) {
          const { product_units, inventory_batches, ...info } = p;
          await localDb.products.put(info);
          if (product_units?.length) await localDb.productUnits.bulkPut(product_units);
        }
      } else {
        data = await fetchFilteredProductsOffline(activeFilters);
      }
      setRaw(data);
    } catch (err) {
      showToast('❌ ' + err.message, true);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, isOnline, debouncedSearch, filters.type, filters.brand,
      filters.priceMin, filters.priceMax, filters.stockStatus]);

  // Load filter options (brands list)
  const loadFilterOptions = useCallback(async () => {
    if (!isOnline) return;
    try {
      const opts = await fetchFilterOptions();
      setOpts(opts);
    } catch { /* silent */ }
  }, [isOnline]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  useEffect(() => {
    if (tenant?.store_type) {
      const isMedical = tenant.store_type === 'medical';
      setType(isMedical ? 'medical' : 'grocery');
      setBaseUnit(isMedical ? 'Tablet' : 'Kg');
      setCategory(isMedical ? 'Medical' : 'Grocery');
    }
  }, [tenant]);

  // ── Sorted final list ────────────────────────────────────────────────────────
  const products = useMemo(() => sortProducts(rawProducts, sortBy), [rawProducts, sortBy]);

  // ── Filter helpers ───────────────────────────────────────────────────────────
  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  // ── Optimistic UI ────────────────────────────────────────────────────────────
  const handleProductDeleted = (id) => {
    setRaw(prev => prev.filter(p => p.id !== id));
    showToast('✅ Product removed from catalog.');
  };
  const handleProductSaved = (updated) => {
    setRaw(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    showToast('✅ Product updated successfully.');
  };

  // ── Add product ──────────────────────────────────────────────────────────────
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

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!name || !baseUnit) return;
    setFormLoading(true);
    try {
      const productId = addProductId;
      const productPayload = {
        id: productId, tenant_id: tenant.id, name,
        barcode: barcode || null,
        sku: sku || null,
        brand: brand || null,
        type, is_active: true,
        reorder_level: parseFloat(reorderLevel) || 10,
        generic_name:         type === 'medical' ? genericName    : null,
        manufacturer:         type === 'medical' ? manufacturer   : null,
        prescription_required: type === 'medical' ? prescriptionReq : false,
        image_url:            addImageUrl,
        category:             category,
      };
      const baseUnitPayload = {
        id: crypto.randomUUID(), product_id: productId,
        unit_name: baseUnit, is_base_unit: true, conversion_factor: 1.0,
        price: parseFloat(basePrice),
      };
      const extraUnitsPayload = extraUnits.map(u => ({
        id: crypto.randomUUID(), product_id: productId,
        unit_name: u.unit_name, is_base_unit: false,
        conversion_factor: u.conversion_factor, price: u.price,
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
      setName(''); setBarcode(''); setSku(''); setBrand('');
      setGenericName(''); setManufacturer(''); setPrescReq(false);
      setBasePrice(0); setReorderLevel(10); setExtraUnits([]);
      setAddImageUrl(null);
      setAddProductId(crypto.randomUUID());
      setCategory(type === 'medical' ? 'Medical' : 'Grocery');
      await loadProducts();
      await loadFilterOptions();
      showToast('✅ Product added to catalog!');
    } catch (err) {
      showToast('❌ ' + err.message, true);
    } finally {
      setFormLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="inventory-layout">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '18px', right: '18px', zIndex: 600,
          background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(99,102,241,0.3)',
          padding: '11px 18px', borderRadius: '12px',
          color: toast.isError ? '#fca5a5' : '#e2e8f0',
          fontSize: '0.88rem', fontWeight: 600, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          animation: 'fadeSlideIn 0.25s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Edit Modal */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditing(null)}
          onSaved={handleProductSaved}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportProductsModal
          tenantId={tenant?.id}
          onClose={() => setShowImport(false)}
          onImportComplete={loadProducts}
        />
      )}

      {/* ── Product List Card ────────────────────────────────────── */}
      <div className="inventory-card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-title">
          <span>📦 Product Catalog</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>
              {isOnline
                ? <span className="badge badge-green">Online</span>
                : <span className="badge badge-red">Offline</span>
              }
            </span>
            <button
              className="pm-import-header-btn pm-download-btn"
              onClick={downloadCsvTemplate}
              title="Download CSV template"
            >
              ↓ Template
            </button>
            <button
              className="pm-import-header-btn pm-import-btn"
              onClick={() => setShowImport(true)}
              disabled={!isOnline}
              title={isOnline ? 'Bulk import products from CSV/XLSX' : 'Import requires internet connection'}
            >
              ↑ Import CSV
            </button>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div className="pm-filter-bar">
          {/* Row 1: Search + Type + Brand */}
          <div className="pm-filter-row">
            <div className="pm-search-wrap">
              <span className="pm-search-icon">🔍</span>
              <input
                className="pm-search-input"
                type="text"
                placeholder="Search by name, barcode or SKU…"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                disabled={loading}
              />
              {filters.search && (
                <button className="pm-search-clear" onClick={() => setFilter('search', '')}
                  aria-label="Clear search">✕</button>
              )}
            </div>

            <select className="pm-select" value={filters.type}
              onChange={e => setFilter('type', e.target.value)} disabled={loading}>
              <option value="all">All Types</option>
              <option value="grocery">🛒 Grocery</option>
              <option value="medical">💊 Medical</option>
            </select>

            <select className="pm-select" value={filters.brand}
              onChange={e => setFilter('brand', e.target.value)} disabled={loading}>
              <option value="all">All Brands</option>
              {filterOptions.brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Row 2: Price + Stock + active badge + clear */}
          <div className="pm-filter-row pm-filter-row2">
            <div className="pm-price-range">
              <span className="pm-filter-label">Price:</span>
              <input className="pm-num-input" type="number" min="0" placeholder="Min"
                value={filters.priceMin} onChange={e => setFilter('priceMin', e.target.value)}
                disabled={loading} />
              <span style={{ color: '#475569' }}>—</span>
              <input className="pm-num-input" type="number" min="0" placeholder="Max"
                value={filters.priceMax} onChange={e => setFilter('priceMax', e.target.value)}
                disabled={loading} />
              <span className="pm-currency">{tenant?.currency}</span>
            </div>

            <select className="pm-select" value={filters.stockStatus}
              onChange={e => setFilter('stockStatus', e.target.value)} disabled={loading}>
              <option value="all">All Stock</option>
              <option value="in_stock">✅ In Stock</option>
              <option value="low_stock">⚠️ Low Stock</option>
              <option value="out_of_stock">❌ Out of Stock</option>
            </select>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
              {activeFilterCount > 0 && (
                <span className="pm-filter-count">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>
              )}
              {hasFilters && (
                <button className="pm-clear-btn" onClick={clearFilters} disabled={loading}>
                  ✕ Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Results Header ── */}
        <div className="pm-results-header">
          <span className="pm-result-count">
            {loading
              ? 'Loading…'
              : <>Showing <strong>{products.length}</strong> product{products.length !== 1 ? 's' : ''}</>
            }
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pm-filter-label">Sort:</span>
            <select className="pm-select pm-select-sm" value={sortBy}
              onChange={e => setSortBy(e.target.value)} disabled={loading}>
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="inventory-table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>#</th>
                <th style={{ width: '50px' }}>Img</th>
                <th>Product Name</th>
                <th>SKU / Barcode</th>
                <th>Type</th>
                <th>Brand</th>
                <th>Base Price</th>
                <th>Stock</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="pm-empty-state">
                      <div className="pm-empty-icon">🔍</div>
                      <div className="pm-empty-title">No products found</div>
                      <div className="pm-empty-sub">
                        {hasFilters
                          ? 'Try adjusting your filters'
                          : 'Add your first product using the form below'
                        }
                      </div>
                      {hasFilters && (
                        <button className="pm-clear-btn pm-empty-clear" onClick={clearFilters}>
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((prod, idx) => {
                  const units      = prod.product_units || [];
                  const baseUnit_  = units.find(u => u.is_base_unit);
                  const price      = baseUnit_?.price ?? 0;
                  const batches    = prod.inventory_batches || [];
                  const totalQty   = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
                  const altUnits   = units.filter(u => !u.is_base_unit);

                  return (
                    <tr key={prod.id}>
                      <td style={{ color: '#475569', fontSize: '0.78rem' }}>{idx + 1}</td>
                      <td>
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="product-thumb"
                            loading="lazy"
                            onClick={() => setLightboxUrl(prod.image_url)}
                          />
                        ) : (
                          <div className="product-thumb-placeholder">📦</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#f1f5f9' }}>
                          <Highlight text={prod.name} search={debouncedSearch} />
                        </div>
                        {prod.type === 'medical' && prod.generic_name && (
                          <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '2px' }}>
                            {prod.generic_name}
                            {prod.prescription_required && (
                              <span className="badge badge-purple" style={{ fontSize: '0.65rem', marginLeft: '5px' }}>Rx</span>
                            )}
                          </div>
                        )}
                        {altUnits.length > 0 && (
                          <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                            {altUnits.map(u => (
                              <span key={u.id} className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                                {u.unit_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {prod.sku
                          ? <><Highlight text={prod.sku} search={debouncedSearch} /><br /></>
                          : null
                        }
                        {prod.barcode
                          ? <span style={{ color: '#475569' }}><Highlight text={prod.barcode} search={debouncedSearch} /></span>
                          : <span style={{ color: '#334155' }}>—</span>
                        }
                      </td>
                      <td>
                        <span className={`badge ${prod.type === 'medical' ? 'badge-purple' : 'badge-blue'}`}>
                          {prod.type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {prod.brand || <span style={{ color: '#334155' }}>—</span>}
                      </td>
                      <td style={{ fontWeight: 600, color: '#818cf8' }}>
                        {tenant?.currency} {price.toFixed(2)}
                        {baseUnit_ && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>
                            &nbsp;/{baseUnit_.unit_name}
                          </span>
                        )}
                      </td>
                      <td>
                        <StockBadge
                          qty={totalQty}
                          reorderLevel={prod.reorder_level ?? 10}
                          unit={baseUnit_?.unit_name || ''}
                        />
                      </td>
                      <td>
                        <div className="pm-actions-cell">
                          <button
                            className="pm-action-btn pm-edit-btn"
                            onClick={() => setEditing(prod)}
                            title="Edit product" aria-label="Edit product"
                          >
                            ✏️
                          </button>
                          <DeleteCell
                            product={prod}
                            onDeleted={handleProductDeleted}
                            onError={(msg) => showToast('❌ ' + msg, true)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Product Form Card ──────────────────────────────────── */}
      <div className="inventory-card">
        <h3 className="card-title">➕ Add New Product</h3>
        <form className="compact-form" onSubmit={handleCreateProduct}>

          <div className="form-row" style={{ gridTemplateColumns: 'auto 1fr', gap: '20px', alignItems: 'start' }}>
            <ProductImageUploader
              productId={addProductId}
              currentImageUrl={addImageUrl}
              onImageChange={setAddImageUrl}
              tenantId={tenant?.id}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, width: '100%' }}>
              {/* Name */}
              <div className="form-group-sm" style={{ margin: 0 }}>
                <label>Product Name *</label>
                <input type="text" placeholder="e.g. Sugar, Paracetamol 500mg"
                  value={name} onChange={e => setName(e.target.value)} required />
              </div>
            </div>
          </div>

          {/* SKU + Barcode */}
          <div className="form-row">
            <div className="form-group-sm">
              <label>SKU</label>
              <input type="text" placeholder="e.g. SKU-001"
                value={sku} onChange={e => setSku(e.target.value)} />
            </div>
            <div className="form-group-sm">
              <label>Barcode (Optional)</label>
              <input type="text" placeholder="Scan or type"
                value={barcode} onChange={e => setBarcode(e.target.value)} />
            </div>
          </div>

          {/* Brand + Type + Category */}
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-group-sm">
              <label>Brand</label>
              <input type="text" placeholder="e.g. Nestle, GSK"
                value={brand} onChange={e => setBrand(e.target.value)} />
            </div>
            <div className="form-group-sm">
              <label>Product Type</label>
              <select value={type} onChange={e => {
                setType(e.target.value);
                if (e.target.value === 'medical') setCategory('Medical');
                else if (e.target.value === 'grocery' && category === 'Medical') setCategory('Grocery');
              }}>
                <option value="grocery">Grocery Item</option>
                <option value="medical">Medical / Medicine</option>
              </select>
            </div>
            <div className="form-group-sm">
              <label>Category *</label>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="Grocery">Grocery</option>
                <option value="Medical">Medical</option>
                <option value="Bakery">Bakery</option>
                <option value="Dairy">Dairy</option>
                <option value="Drinks">Drinks</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Medical fields */}
          {type === 'medical' && (
            <>
              <div className="form-row">
                <div className="form-group-sm">
                  <label>Generic Formula</label>
                  <input type="text" placeholder="e.g. Ibuprofen"
                    value={genericName} onChange={e => setGenericName(e.target.value)} />
                </div>
                <div className="form-group-sm">
                  <label>Manufacturer</label>
                  <input type="text" placeholder="e.g. GSK, Pfizer"
                    value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
                </div>
              </div>
              <div className="form-group-sm" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="rxReqAdd" checked={prescriptionReq}
                  onChange={e => setPrescReq(e.target.checked)} />
                <label htmlFor="rxReqAdd" style={{ cursor: 'pointer' }}>Requires Prescription (Rx)</label>
              </div>
            </>
          )}

          {/* Base Unit + Price + Reorder */}
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-group-sm">
              <label>Base Unit *</label>
              <input type="text"
                placeholder={type === 'medical' ? 'Tablet' : 'Kg'}
                value={baseUnit} onChange={e => setBaseUnit(e.target.value)} required />
            </div>
            <div className="form-group-sm">
              <label>Selling Price ({tenant?.currency})</label>
              <input type="number" step="0.01" min="0" value={basePrice}
                onChange={e => setBasePrice(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group-sm">
              <label>Reorder At (qty)</label>
              <input type="number" step="1" min="0" value={reorderLevel}
                onChange={e => setReorderLevel(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* Extra Units */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px', marginTop: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1' }}>
              Bulk / Alternate Units
            </label>
            {extraUnits.length > 0 && (
              <div className="unit-list">
                {extraUnits.map((u, idx) => (
                  <div key={idx} className="unit-item">
                    <span>1 <strong>{u.unit_name}</strong> = {u.conversion_factor} {baseUnit}s</span>
                    <span style={{ color: '#94a3b8' }}>Price: {tenant?.currency} {u.price.toFixed(2)}</span>
                    <span className="unit-item-remove" onClick={() => setExtraUnits(extraUnits.filter((_, i) => i !== idx))}>×</span>
                  </div>
                ))}
              </div>
            )}
            <div className="add-unit-row">
              <div className="form-group-sm">
                <label>Unit Name</label>
                <input type="text" placeholder="e.g. Box, Strip"
                  value={newUnitName} onChange={e => setNewUnitName(e.target.value)} />
              </div>
              <div className="form-group-sm">
                <label>Ratio to Base</label>
                <input type="number" step="0.01" min="0.01" placeholder="50"
                  value={newUnitFactor} onChange={e => setNewUnitFactor(parseFloat(e.target.value) || 1)} />
              </div>
              <div className="form-group-sm">
                <label>Unit Price</label>
                <input type="number" step="0.01" min="0"
                  value={newUnitPrice} onChange={e => setNewUnitPrice(parseFloat(e.target.value) || 0)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleAddExtraUnit}>
                Add Unit
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '14px' }} disabled={formLoading}>
            {formLoading ? 'Saving…' : 'Save Product'}
          </button>
        </form>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <img src={lightboxUrl} alt="Product large preview" className="lightbox-img" />
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}
    </div>
  );
};
