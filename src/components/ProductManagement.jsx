import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import './Inventory.css';

export const ProductManagement = () => {
  const { tenant } = useAuth();
  const isOnline = useOnlineStatus();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // New Product Form State
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [type, setType] = useState('grocery');
  
  // Pharmacy fields
  const [genericName, setGenericName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);

  // Unit conversions builder state
  const [baseUnit, setBaseUnit] = useState('Kg');
  const [basePrice, setBasePrice] = useState(0);
  const [extraUnits, setExtraUnits] = useState([]);
  
  // Adding single extra unit form state
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitFactor, setNewUnitFactor] = useState(1);
  const [newUnitPrice, setNewUnitPrice] = useState(0);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        // Fetch from Supabase
        const { data: dbProducts, error: prodErr } = await supabase
          .from('products')
          .select('*, product_units(*)');

        if (prodErr) throw prodErr;

        setProducts(dbProducts || []);

        // Cache in Dexie
        await localDb.products.clear();
        await localDb.productUnits.clear();

        for (const prod of dbProducts) {
          const { product_units, ...prodInfo } = prod;
          await localDb.products.put(prodInfo);
          if (product_units && product_units.length > 0) {
            await localDb.productUnits.bulkPut(product_units);
          }
        }
      } else {
        // Offline: Read from Dexie
        const localProds = await localDb.products.toArray();
        const enrichedProds = [];
        for (const prod of localProds) {
          const units = await localDb.productUnits
            .where('product_id')
            .equals(prod.id)
            .toArray();
          enrichedProds.push({ ...prod, product_units: units });
        }
        setProducts(enrichedProds);
      }
    } catch (err) {
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenant?.id) {
      fetchProducts();
    }
    // Set default base unit depending on store type
    if (tenant?.id && tenant.name) {
      const isMedical = tenant.store_type === 'medical' || window.location.href.includes('medical');
      setType(isMedical ? 'medical' : 'grocery');
      setBaseUnit(isMedical ? 'Tablet' : 'Kg');
    }
  }, [tenant, isOnline]);

  const handleAddExtraUnit = (e) => {
    e.preventDefault();
    if (!newUnitName) return;
    setExtraUnits([
      ...extraUnits,
      {
        unit_name: newUnitName,
        conversion_factor: parseFloat(newUnitFactor),
        price: parseFloat(newUnitPrice),
        is_base_unit: false,
      },
    ]);
    setNewUnitName('');
    setNewUnitFactor(1);
    setNewUnitPrice(0);
  };

  const handleRemoveExtraUnit = (idx) => {
    setExtraUnits(extraUnits.filter((_, i) => i !== idx));
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!name || !baseUnit) return;

    setLoading(true);
    try {
      let productId = crypto.randomUUID();

      const productPayload = {
        id: productId,
        tenant_id: tenant.id,
        name,
        barcode: barcode || null,
        type,
        generic_name: type === 'medical' ? genericName : null,
        manufacturer: type === 'medical' ? manufacturer : null,
        prescription_required: type === 'medical' ? prescriptionRequired : false,
      };

      const baseUnitPayload = {
        id: crypto.randomUUID(),
        product_id: productId,
        unit_name: baseUnit,
        is_base_unit: true,
        conversion_factor: 1.0000,
        price: parseFloat(basePrice),
      };

      const extraUnitsPayload = extraUnits.map((u) => ({
        id: crypto.randomUUID(),
        product_id: productId,
        unit_name: u.unit_name,
        is_base_unit: false,
        conversion_factor: u.conversion_factor,
        price: u.price,
      }));

      const allUnits = [baseUnitPayload, ...extraUnitsPayload];

      if (isOnline) {
        // 1. Save to Supabase
        const { error: prodErr } = await supabase
          .from('products')
          .insert(productPayload);
        if (prodErr) throw prodErr;

        const { error: unitsErr } = await supabase
          .from('product_units')
          .insert(allUnits);
        if (unitsErr) throw unitsErr;
      }

      // 2. Cache in local Dexie DB
      await localDb.products.put(productPayload);
      await localDb.productUnits.bulkPut(allUnits);

      // Reset Form
      setName('');
      setBarcode('');
      setGenericName('');
      setManufacturer('');
      setPrescriptionRequired(false);
      setBasePrice(0);
      setExtraUnits([]);

      // Refresh list
      fetchProducts();
    } catch (err) {
      alert('Error creating product: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inventory-layout">
      {/* Products list card */}
      <div className="inventory-card">
        <div className="card-title">
          <span>Active Product Catalog</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>
            Connection State: {isOnline ? <span className="badge badge-green">Online</span> : <span className="badge badge-red">Offline Mode</span>}
          </span>
        </div>

        {loading && products.length === 0 ? (
          <p>Loading catalog...</p>
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
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr key={prod.id}>
                    <td>
                      <div><strong>{prod.name}</strong></div>
                      {prod.type === 'medical' && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                          Gen: {prod.generic_name || 'N/A'} | Mfg: {prod.manufacturer || 'N/A'}
                        </div>
                      )}
                    </td>
                    <td>{prod.barcode || 'N/A'}</td>
                    <td>
                      <span className={`badge ${prod.type === 'medical' ? 'badge-purple' : 'badge-blue'}`}>
                        {prod.type}
                      </span>
                    </td>
                    <td>
                      {prod.product_units?.find((u) => u.is_base_unit)?.unit_name} (Price: {tenant?.currency} {prod.product_units?.find((u) => u.is_base_unit)?.price?.toFixed(2)})
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {prod.product_units
                          ?.filter((u) => !u.is_base_unit)
                          .map((u) => (
                            <span key={u.id} className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                              {u.unit_name} (x{u.conversion_factor})
                            </span>
                          ))}
                        {prod.product_units?.filter((u) => !u.is_base_unit).length === 0 && (
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>None</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                      No products found. Use the form to list your first item.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add product card */}
      <div className="inventory-card">
        <h3 className="card-title">Add New Product</h3>
        <form className="compact-form" onSubmit={handleCreateProduct}>
          <div className="form-group-sm">
            <label>Product Name *</label>
            <input
              type="text"
              placeholder="e.g. Sugar, Paracetamol"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group-sm">
            <label>Barcode / SKU (Optional)</label>
            <input
              type="text"
              placeholder="Scan or type barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </div>

          <div className="form-group-sm">
            <label>Product Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="grocery">Grocery Item</option>
              <option value="medical">Medical / Medicine</option>
            </select>
          </div>

          {/* Pharmacy specific fields */}
          {type === 'medical' && (
            <>
              <div className="form-group-sm">
                <label>Generic Formula (Formula Name)</label>
                <input
                  type="text"
                  placeholder="e.g. Ibuprofen, Paracetamol"
                  value={genericName}
                  onChange={(e) => setGenericName(e.target.value)}
                />
              </div>

              <div className="form-group-sm">
                <label>Manufacturer</label>
                <input
                  type="text"
                  placeholder="e.g. GSK, Pfizer"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                />
              </div>

              <div className="form-group-sm" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="rxReq"
                  checked={prescriptionRequired}
                  onChange={(e) => setPrescriptionRequired(e.target.checked)}
                />
                <label htmlFor="rxReq" style={{ cursor: 'pointer' }}>Requires Prescription</label>
              </div>
            </>
          )}

          {/* Base Unit settings */}
          <div className="form-row">
            <div className="form-group-sm">
              <label>Base Sale Unit *</label>
              <input
                type="text"
                placeholder={type === 'medical' ? 'e.g. Tablet, Pill' : 'e.g. Kg, Gram, Piece'}
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                required
              />
            </div>

            <div className="form-group-sm">
              <label>Base Unit Selling Price ({tenant?.currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Unit Conversion Configuration */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', marginTop: '10px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1' }}>
              Bulk / Alternate Packaging Units
            </label>
            
            {extraUnits.length > 0 && (
              <div className="unit-list">
                {extraUnits.map((u, idx) => (
                  <div key={idx} className="unit-item">
                    <span>
                      1 <strong>{u.unit_name}</strong> = {u.conversion_factor} {baseUnit}s
                    </span>
                    <span style={{ color: '#94a3b8' }}>
                      Price: {tenant?.currency} {u.price.toFixed(2)}
                    </span>
                    <span className="unit-item-remove" onClick={() => handleRemoveExtraUnit(idx)}>
                      &times;
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="add-unit-row">
              <div className="form-group-sm">
                <label>Unit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Bag, Box, Strip"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                />
              </div>

              <div className="form-group-sm">
                <label>Ratio to Base</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 50"
                  value={newUnitFactor}
                  onChange={(e) => setNewUnitFactor(parseFloat(e.target.value) || 1)}
                />
              </div>

              <div className="form-group-sm">
                <label>Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newUnitPrice}
                  onChange={(e) => setNewUnitPrice(parseFloat(e.target.value) || 0)}
                />
              </div>

              <button type="button" className="btn-secondary" onClick={handleAddExtraUnit}>
                Add Unit
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '15px' }} disabled={loading}>
            {loading ? 'Saving...' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  );
};
