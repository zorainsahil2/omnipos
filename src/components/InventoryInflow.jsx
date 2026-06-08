import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import './Inventory.css';

export const InventoryInflow = () => {
  const { tenant } = useAuth();
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Stock Inflow Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [quantityEntered, setQuantityEntered] = useState(0);
  const [costPerUnitEntered, setCostPerUnitEntered] = useState(0);
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        // Fetch products and units
        const { data: dbProducts, error: prodErr } = await supabase
          .from('products')
          .select('*, product_units(*)');
        if (prodErr) throw prodErr;

        setProducts(dbProducts || []);

        // Fetch active batches
        const { data: dbBatches, error: batErr } = await supabase
          .from('inventory_batches')
          .select('*, products(name, type)');
        if (batErr) throw batErr;

        setBatches(dbBatches || []);

        // Sync Dexie
        await localDb.inventoryBatches.clear();
        if (dbBatches && dbBatches.length > 0) {
          // Remove products nested object before putting in Dexie
          const dexieBatches = dbBatches.map(({ products, ...bat }) => bat);
          await localDb.inventoryBatches.bulkPut(dexieBatches);
        }
      } else {
        // Offline: Read from Dexie
        const localProds = await localDb.products.toArray();
        const enrichedProds = [];
        for (const p of localProds) {
          const units = await localDb.productUnits.where('product_id').equals(p.id).toArray();
          enrichedProds.push({ ...p, product_units: units });
        }
        setProducts(enrichedProds);

        const localBatches = await localDb.inventoryBatches.toArray();
        const enrichedBatches = [];
        for (const bat of localBatches) {
          const prod = await localDb.products.get(bat.product_id);
          enrichedBatches.push({
            ...bat,
            products: prod ? { name: prod.name, type: prod.type } : { name: 'Unknown', type: 'grocery' }
          });
        }
        setBatches(enrichedBatches);
      }
    } catch (err) {
      console.error('Error loading inventory data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenant?.id) {
      loadData();
    }
  }, [tenant, isOnline]);

  // Set default unit when product changes
  useEffect(() => {
    if (selectedProductId) {
      const prod = products.find((p) => p.id === selectedProductId);
      const baseUnit = prod?.product_units?.find((u) => u.is_base_unit);
      if (baseUnit) {
        setSelectedUnitId(baseUnit.id);
      }
    } else {
      setSelectedUnitId('');
    }
  }, [selectedProductId, products]);

  const handleStockInflow = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !selectedUnitId || quantityEntered <= 0) {
      alert('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const product = products.find((p) => p.id === selectedProductId);
      const unit = product.product_units.find((u) => u.id === selectedUnitId);

      // Calculations
      const conversionFactor = parseFloat(unit.conversion_factor);
      const baseUnitsAdded = parseFloat(quantityEntered) * conversionFactor;
      const purchaseCostPerBase = parseFloat(costPerUnitEntered) / conversionFactor;

      const batchPayload = {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        product_id: selectedProductId,
        batch_number: batchNumber || null,
        expiry_date: expiryDate || null,
        purchase_cost: purchaseCostPerBase,
        quantity: baseUnitsAdded,
      };

      if (isOnline) {
        const { error } = await supabase
          .from('inventory_batches')
          .insert(batchPayload);
        if (error) throw error;
      }

      // Save to local cache
      await localDb.inventoryBatches.put(batchPayload);

      // Reset form
      setSelectedProductId('');
      setSelectedUnitId('');
      setQuantityEntered(0);
      setCostPerUnitEntered(0);
      setBatchNumber('');
      setExpiryDate('');

      // Refresh list
      loadData();
    } catch (err) {
      alert('Error updating inventory: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductUnits = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    return prod?.product_units || [];
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedUnit = selectedProduct?.product_units?.find((u) => u.id === selectedUnitId);
  const conversionFactor = selectedUnit ? parseFloat(selectedUnit.conversion_factor) : 1;

  return (
    <div className="inventory-layout">
      {/* Batches list */}
      <div className="inventory-card">
        <h3 className="card-title">Current Inventory Batches</h3>
        <div className="inventory-table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch #</th>
                <th>Expiry</th>
                <th>Qty (Base Unit)</th>
                <th>Cost/Base Unit</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((bat) => (
                <tr key={bat.id}>
                  <td>
                    <strong>{bat.products?.name}</strong>
                    <span className={`badge ${bat.products?.type === 'medical' ? 'badge-purple' : 'badge-blue'}`} style={{ marginLeft: '8px', fontSize: '0.65rem' }}>
                      {bat.products?.type}
                    </span>
                  </td>
                  <td>{bat.batch_number || <span style={{ color: '#64748b' }}>N/A</span>}</td>
                  <td>
                    {bat.expiry_date ? (
                      <span className={new Date(bat.expiry_date) < new Date() ? 'badge badge-red' : ''}>
                        {bat.expiry_date}
                      </span>
                    ) : (
                      <span style={{ color: '#64748b' }}>N/A</span>
                    )}
                  </td>
                  <td>{bat.quantity.toFixed(2)}</td>
                  <td>{tenant?.currency} {bat.purchase_cost.toFixed(2)}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    No inventory recorded yet. Complete stock inflow to populate batches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Inflow Form */}
      <div className="inventory-card">
        <h3 className="card-title">Stock Inflow (Bulk intake)</h3>
        <form className="compact-form" onSubmit={handleStockInflow}>
          <div className="form-group-sm">
            <label>Select Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              required
            >
              <option value="">-- Choose Product --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </div>

          {selectedProductId && (
            <>
              <div className="form-row">
                <div className="form-group-sm">
                  <label>Purchase Packaging Unit *</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    required
                  >
                    {getProductUnits().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name} (Conversion: x{u.conversion_factor})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group-sm">
                  <label>Quantity Received *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={quantityEntered}
                    onChange={(e) => setQuantityEntered(parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
              </div>

              <div className="form-group-sm">
                <label>Purchase Cost per Unit ({tenant?.currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={costPerUnitEntered}
                  onChange={(e) => setCostPerUnitEntered(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              {/* Dynamic conversion stats preview */}
              {selectedUnit && (
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', padding: '12px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: '600', color: '#818cf8', marginBottom: '4px' }}>Conversion Preview:</div>
                  <div>Base Units Added: <strong>{(quantityEntered * conversionFactor).toFixed(2)}</strong></div>
                  <div>Cost price calculated per base unit: <strong>{tenant?.currency} {(costPerUnitEntered / conversionFactor).toFixed(4)}</strong></div>
                </div>
              )}

              <div className="form-group-sm">
                <label>Batch Number {selectedProduct?.type === 'medical' ? '*' : '(Optional)'}</label>
                <input
                  type="text"
                  placeholder="e.g. BAT-2026-09"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  required={selectedProduct?.type === 'medical'}
                />
              </div>

              <div className="form-group-sm">
                <label>Expiry Date {selectedProduct?.type === 'medical' ? '*' : '(Optional)'}</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required={selectedProduct?.type === 'medical'}
                />
              </div>
            </>
          )}

          <button type="submit" className="btn-primary" disabled={loading || !selectedProductId}>
            {loading ? 'Processing...' : 'Receive Stock'}
          </button>
        </form>
      </div>
    </div>
  );
};
