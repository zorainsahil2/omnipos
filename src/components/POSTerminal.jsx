import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { localDb, db, getSalesQueueCount } from '../db/localDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { useAuth } from '../context/AuthContext';
import { CategorySidebar } from './billing/CategorySidebar';
import { ProductGrid } from './billing/ProductGrid';
import { useBillingProducts } from '../hooks/useBillingProducts';
import { useProductCountByCategory } from '../hooks/useProductCountByCategory';
import './POS.css';

/* ─── Utility ─────────────────────────────────────────── */
const formatCurrency = (amount, currency) =>
  `${currency || ''} ${Number(amount || 0).toFixed(2)}`;

const nowISO = () => new Date().toISOString();

/* ─── Receipt Modal ────────────────────────────────────── */
const ReceiptModal = ({ sale, tenant, onClose }) => {
  const handlePrint = () => window.print();

  return (
    <div className="receipt-overlay" onClick={onClose}>
      <div className="receipt-modal" onClick={e => e.stopPropagation()}>
        <div className="receipt-header">
          <div className="receipt-logo">OmniPOS</div>
          <div className="receipt-store-name">{tenant?.name}</div>
          <div className="receipt-date">
            {tenant?.country} · {new Date(sale.created_at).toLocaleString()}
          </div>
        </div>

        <hr className="receipt-divider" />

        {sale.items.map((item, idx) => (
          <div key={idx} className="receipt-item-row">
            <div>
              <div className="receipt-item-name">{item.product_name}</div>
              <div className="receipt-item-detail">
                {item.quantity} × {item.unit_name} @ {formatCurrency(item.unit_price, tenant?.currency)}
              </div>
            </div>
            <div className="receipt-item-amount">
              {formatCurrency(item.total_price, tenant?.currency)}
            </div>
          </div>
        ))}

        <hr className="receipt-divider" />

        <div className="receipt-total-block">
          <div className="receipt-total-row">
            <span>Subtotal</span>
            <span>{formatCurrency(sale.subtotal, tenant?.currency)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="receipt-total-row">
              <span>Discount</span>
              <span style={{ color: '#86efac' }}>- {formatCurrency(sale.discount, tenant?.currency)}</span>
            </div>
          )}
          {sale.tax_amount > 0 && (
            <div className="receipt-total-row">
              <span>Tax</span>
              <span>{formatCurrency(sale.tax_amount, tenant?.currency)}</span>
            </div>
          )}
          <div className="receipt-total-row grand">
            <span>Total</span>
            <span>{formatCurrency(sale.total_amount, tenant?.currency)}</span>
          </div>
        </div>

        <div className="receipt-payment-badge">
          ✓ Paid via {sale.payment_method?.replace('_', ' ').toUpperCase()}
        </div>

        <div className="receipt-footer">
          Thank you for your business!<br />
          {tenant?.country} · OmniPOS Retail System
        </div>

        <div className="receipt-actions">
          <button className="receipt-print-btn" onClick={handlePrint}>🖨 Print</button>
          <button className="receipt-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Main POSTerminal ─────────────────────────────────── */
export const POSTerminal = () => {
  const { tenant, profile } = useAuth();
  const isOnline = useOnlineStatus();
  useSyncQueue(); // Auto-flush offline queue on reconnect

  // Product/inventory state
  const [batches, setBatches]     = useState([]);
  const [searchQuery, setSearch]  = useState('');
  const [loadingData, setLoading] = useState(false);

  // Cart state
  const [cart, setCart]           = useState([]);  // [{product, unit, qty, batchId, unitPrice, costPrice}]
  const [discount, setDiscount]   = useState(0);
  const [taxPct, setTaxPct]       = useState(0);
  const [payMethod, setPayMethod] = useState('cash');

  // UI state
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt]         = useState(null);
  const [queueCount, setQueueCount]   = useState(0);
  const searchRef = useRef(null);

  // ── Category Sidebar & Favourites states ──
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Hooks for fetching/filtering and badges
  const { products: filteredProducts, loading: loadingFiltered } = useBillingProducts(selectedCategory, searchQuery, refreshKey);
  const productCountByCategory = useProductCountByCategory(refreshKey);

  /* ── Load products + batches ── */
  const loadInventory = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const { data: prods }   = await supabase.from('products').select('*, product_units(*)');
        const { data: batchArr} = await supabase.from('inventory_batches').select('*');
        setBatches(batchArr || []);

        // Sync to local
        await localDb.products.clear();
        await localDb.productUnits.clear();
        await localDb.inventoryBatches.clear();
        for (const p of (prods || [])) {
          const { product_units, ...info } = p;
          await localDb.products.put(info);
          if (product_units?.length) await localDb.productUnits.bulkPut(product_units);
        }
        if (batchArr?.length) await localDb.inventoryBatches.bulkPut(batchArr);
      } else {
        setBatches(await localDb.inventoryBatches.toArray());
      }
    } catch (err) {
      console.error('POS load error:', err.message);
    } finally {
      setLoading(false);
      setRefreshKey(prev => prev + 1);
    }
  };

  const refreshQueue = async () => setQueueCount(await getSalesQueueCount());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tenant?.id) { loadInventory(); refreshQueue(); } }, [tenant, isOnline]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Keyboard shortcut: '/' or 'F2' focuses search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        (e.key === '/' || e.key === 'F2') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ── Available stock per product ── */
  const stockMap = useMemo(() => {
    const map = {};
    for (const bat of batches) {
      map[bat.product_id] = (map[bat.product_id] || 0) + bat.quantity;
    }
    return map;
  }, [batches]);

  const handleCategorySelect = (catName) => {
    setSelectedCategory(catName);
    setSearch(''); // Clear search on category change
  };

  const handleToggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleToggleFavourite = async (productId, newValue) => {
    // Optimistic local IndexedDB update
    try {
      await db.products.update(productId, { is_favourite: newValue });
      setRefreshKey(prev => prev + 1); // update UI counts/lists instantly
    } catch (err) {
      console.warn('[handleToggleFavourite] Dexie update failed:', err.message);
    }

    if (isOnline) {
      // Remote DB update in background
      supabase
        .from('products')
        .update({ is_favourite: newValue })
        .eq('id', productId)
        .then(({ error }) => {
          if (error) {
            console.error('[handleToggleFavourite] Supabase update failed, reverting:', error.message);
            // Revert local state
            db.products.update(productId, { is_favourite: !newValue }).then(() => {
              setRefreshKey(prev => prev + 1);
            });
          }
        });
    }
  };

  /* ── Add product to cart ── */
  const addToCart = (product) => {
    const baseUnit = product.product_units?.find(u => u.is_base_unit);
    if (!baseUnit) return;

    const existingIdx = cart.findIndex(
      c => c.product.id === product.id && c.unit.id === baseUnit.id
    );

    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx].qty += 1;
      setCart(updated);
    } else {
      // Find cheapest/first available batch (FIFO)
      const productBatches = batches.filter(b => b.product_id === product.id && b.quantity > 0);
      const batch = productBatches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];

      setCart([...cart, {
        product,
        unit: baseUnit,
        qty: 1,
        batchId: batch?.id || null,
        unitPrice: baseUnit.price,
        costPrice: batch?.purchase_cost || 0,
      }]);
    }
  };

  /* ── Cart manipulation ── */
  const updateQty = (idx, delta) => {
    const updated = [...cart];
    updated[idx].qty = Math.max(0.25, +(updated[idx].qty + delta).toFixed(2));
    setCart(updated);
  };

  const changeUnit = (idx, unitId) => {
    const updated = [...cart];
    const unit = updated[idx].product.product_units.find(u => u.id === unitId);
    if (unit) { updated[idx].unit = unit; updated[idx].unitPrice = unit.price; }
    setCart(updated);
  };

  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const clearCart = () => setCart([]);

  /* ── Totals ── */
  const subtotal   = cart.reduce((s, c) => s + c.unitPrice * c.qty * c.unit.conversion_factor, 0);
  const taxAmount  = subtotal * (taxPct / 100);
  const grandTotal = Math.max(0, subtotal - discount + taxAmount);

  /* ── Checkout ── */
  const handleCheckout = async () => {
    if (cart.length === 0 || checkingOut) return;
    setCheckingOut(true);

    try {
      const createdAt = nowISO();
      const saleId    = crypto.randomUUID();

      const saleItems = cart.map(c => ({
        id: crypto.randomUUID(),
        sale_id: saleId,
        product_id: c.product.id,
        batch_id: c.batchId,
        quantity: c.qty * c.unit.conversion_factor,
        unit_id: c.unit.id,
        unit_price: c.unitPrice,
        cost_price: c.costPrice,
        total_price: c.unitPrice * c.qty * c.unit.conversion_factor,
        product_name: c.product.name,
        unit_name: c.unit.unit_name,
      }));

      const salePayload = {
        id: saleId,
        tenant_id: tenant.id,
        cashier_id: profile.id,
        total_amount: grandTotal,
        discount,
        tax_amount: taxAmount,
        payment_method: payMethod,
        created_at: createdAt,
      };

      if (isOnline) {
        // Save directly to Supabase
        await supabase.from('sales').insert(salePayload);
        await supabase.from('sale_items').insert(saleItems.map(({ product_name: _, unit_name: __, ...si }) => si));

        // Deduct stock per batch in Supabase
        for (const c of cart) {
          if (c.batchId) {
            const deductQty = c.qty * c.unit.conversion_factor;
            const currentBatch = batches.find(b => b.id === c.batchId);
            if (currentBatch) {
              await supabase
                .from('inventory_batches')
                .update({ quantity: Math.max(0, currentBatch.quantity - deductQty) })
                .eq('id', c.batchId);
            }
          }
        }
      } else {
        // Save to offline queue
        await localDb.salesQueue.add({
          ...salePayload,
          items: saleItems,
          synced: 0,
        });
      }

      // Deduct from local IndexedDB batches either way
      for (const c of cart) {
        if (c.batchId) {
          const deductQty = c.qty * c.unit.conversion_factor;
          const localBatch = await localDb.inventoryBatches.get(c.batchId);
          if (localBatch) {
            await localDb.inventoryBatches.update(c.batchId, {
              quantity: Math.max(0, localBatch.quantity - deductQty),
            });
          }
        }
      }

      // Build receipt object
      setReceipt({
        ...salePayload,
        subtotal,
        items: saleItems,
      });

      clearCart();
      refreshQueue();
      loadInventory();
    } catch (err) {
      alert('Checkout failed: ' + err.message);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div>
      {/* Top status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.4rem', margin: 0 }}>🧾 Billing Terminal</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {queueCount > 0 && (
            <span className="queue-badge">📤 {queueCount} offline sale{queueCount > 1 ? 's' : ''} pending sync</span>
          )}
          {isOnline
            ? <span className="online-pill">🟢 Online</span>
            : <span className="offline-pill">🟡 Offline Mode — bills saved locally</span>
          }
        </div>
      </div>

      <div className={`pos-layout ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        
        {/* Category Sidebar */}
        <CategorySidebar
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          productCountByCategory={productCountByCategory}
        />

        {/* ─── Center: Product Search & Grid ─── */}
        <div className="pos-search-panel">
          <div className="pos-search-bar">
            <span className="pos-search-icon">🔍</span>
            <input
              ref={searchRef}
              className="pos-search-input"
              type="text"
              placeholder="Search products (Press '/' or F2 to focus)..."
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="pos-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <ProductGrid
            products={filteredProducts}
            stockMap={stockMap}
            onAddToCart={addToCart}
            onToggleFavourite={handleToggleFavourite}
            formatCurrency={(amount) => formatCurrency(amount, tenant?.currency)}
            loading={loadingFiltered || loadingData}
          />
        </div>

        {/* ─── Right: Cart ─── */}
        <div className="pos-cart-panel">
          <div className="cart-header">
            <span>🛒 Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})</span>
            {cart.length > 0 && (
              <button className="cart-clear-btn" onClick={clearCart}>Clear All</button>
            )}
          </div>

          {/* Cart items */}
          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-cart-icon">🛒</div>
                <div className="empty-cart-text">Tap a product to add it to the bill</div>
              </div>
            ) : (
              cart.map((c, idx) => (
                <div key={idx} className="cart-item">
                  <div className="cart-item-row1">
                    <div className="cart-item-name">{c.product.name}</div>
                    <span className="cart-item-remove" onClick={() => removeFromCart(idx)}>✕</span>
                  </div>

                  {c.product.prescription_required && (
                    <div className="cart-rx-warning">📋 Prescription required before dispensing</div>
                  )}

                  <div className="cart-item-row2">
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => updateQty(idx, -0.5)}>−</button>
                      <span className="qty-value">{c.qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(idx,  0.5)}>+</button>
                    </div>

                    {c.product.product_units?.length > 1 && (
                      <select
                        className="cart-unit-select"
                        value={c.unit.id}
                        onChange={e => changeUnit(idx, e.target.value)}
                      >
                        {c.product.product_units.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.unit_name} ({formatCurrency(u.price, tenant?.currency)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="cart-item-total">
                    {formatCurrency(c.unitPrice * c.qty * c.unit.conversion_factor, tenant?.currency)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart footer */}
          {cart.length > 0 && (
            <div className="cart-footer">
              <div className="cart-total-row">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, tenant?.currency)}</span>
              </div>

              {/* Discount */}
              <div className="cart-total-row">
                <span>Discount ({tenant?.currency})</span>
                <div className="discount-row">
                  <input
                    className="discount-input"
                    type="number"
                    min="0"
                    step="0.5"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="cart-total-row">
                <span>Tax %</span>
                <div className="discount-row">
                  <input
                    className="discount-input"
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={taxPct}
                    onChange={e => setTaxPct(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="cart-total-row grand">
                <span>Total</span>
                <span>{formatCurrency(grandTotal, tenant?.currency)}</span>
              </div>

              {/* Payment method */}
              <select
                className="payment-select"
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
              >
                <option value="cash">💵 Cash</option>
                <option value="card">💳 Card / POS Machine</option>
                <option value="bank_transfer">🏦 Bank Transfer</option>
                <option value="mobile_wallet">📱 Mobile Wallet</option>
              </select>

              <button
                className="checkout-btn"
                onClick={handleCheckout}
                disabled={checkingOut || cart.length === 0}
              >
                {checkingOut
                  ? 'Processing...'
                  : isOnline
                    ? `Checkout — ${formatCurrency(grandTotal, tenant?.currency)}`
                    : `💾 Save Offline — ${formatCurrency(grandTotal, tenant?.currency)}`
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Receipt modal */}
      {receipt && (
        <ReceiptModal
          sale={receipt}
          tenant={tenant}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};
