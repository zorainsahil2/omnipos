import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { localDb } from '../db/localDb';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import './Pharmacy.css';
import './Inventory.css';

// Utility: calculate days until expiry
const daysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  return Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
};

const ExpiryBubble = ({ days }) => {
  if (days === null) return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No Expiry</span>;
  if (days < 0)    return <span className="expiry-bubble expired">⛔ Expired {Math.abs(days)}d ago</span>;
  if (days <= 7)   return <span className="expiry-bubble critical">🔴 {days}d left</span>;
  if (days <= 30)  return <span className="expiry-bubble soon">⚠ {days}d left</span>;
  return <span className="expiry-bubble ok">✓ {days}d left</span>;
};

export const PharmacyPanel = () => {
  const { tenant } = useAuth();
  const isOnline = useOnlineStatus();
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [genericSearch, setGenericSearch] = useState('');
  const [activeSection, setActiveSection] = useState('alerts');

  const loadData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const { data: dbProds, error: pErr } = await supabase
          .from('products')
          .select('*')
          .eq('type', 'medical');
        if (pErr) throw pErr;

        const { data: dbBatches, error: bErr } = await supabase
          .from('inventory_batches')
          .select('*, products(name, type, generic_name, manufacturer, prescription_required)')
          .eq('products.type', 'medical');
        if (bErr) throw bErr;

        setProducts(dbProds || []);
        setBatches((dbBatches || []).filter(b => b.products?.type === 'medical'));
      } else {
        const localProds = await localDb.products.where('type').equals('medical').toArray();
        setProducts(localProds);

        const allBatches = await localDb.inventoryBatches.toArray();
        const enriched = [];
        for (const bat of allBatches) {
          const prod = await localDb.products.get(bat.product_id);
          if (prod?.type === 'medical') {
            enriched.push({ ...bat, products: prod });
          }
        }
        setBatches(enriched);
      }
    } catch (err) {
      console.error('Error loading pharmacy data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenant?.id) loadData();
  }, [tenant, isOnline]);

  // Computed stats
  const stats = useMemo(() => {
    const expiredBatches = batches.filter(b => daysUntilExpiry(b.expiry_date) !== null && daysUntilExpiry(b.expiry_date) < 0);
    const criticalBatches = batches.filter(b => { const d = daysUntilExpiry(b.expiry_date); return d !== null && d >= 0 && d <= 7; });
    const soonBatches = batches.filter(b => { const d = daysUntilExpiry(b.expiry_date); return d !== null && d > 7 && d <= 30; });
    const rxProducts = products.filter(p => p.prescription_required);
    return { expiredBatches, criticalBatches, soonBatches, rxProducts, totalMedical: products.length };
  }, [batches, products]);

  // Filtered generics list
  const filteredGenerics = useMemo(() => {
    if (!genericSearch) return products;
    const q = genericSearch.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.generic_name?.toLowerCase().includes(q) ||
      p.manufacturer?.toLowerCase().includes(q)
    );
  }, [products, genericSearch]);

  // Sort batches: expired first, then critical, then soon, then ok
  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      const da = daysUntilExpiry(a.expiry_date) ?? 9999;
      const db = daysUntilExpiry(b.expiry_date) ?? 9999;
      return da - db;
    });
  }, [batches]);

  const getBatchCardClass = (days) => {
    if (days === null) return '';
    if (days < 0) return 'expired-card';
    if (days <= 30) return 'soon-card';
    return '';
  };

  return (
    <div>
      {/* Summary Stats */}
      <div className="pharmacy-stats-row">
        <div className="pharm-stat-card">
          <span className="pharm-stat-icon">💊</span>
          <span className="pharm-stat-value">{stats.totalMedical}</span>
          <span className="pharm-stat-label">Total Medicines</span>
        </div>
        <div className="pharm-stat-card" style={{ borderColor: stats.expiredBatches.length > 0 ? 'rgba(239,68,68,0.3)' : '' }}>
          <span className="pharm-stat-icon">⛔</span>
          <span className="pharm-stat-value" style={{ color: stats.expiredBatches.length > 0 ? '#fca5a5' : '#f1f5f9' }}>
            {stats.expiredBatches.length}
          </span>
          <span className="pharm-stat-label">Expired Batches</span>
        </div>
        <div className="pharm-stat-card" style={{ borderColor: stats.criticalBatches.length > 0 ? 'rgba(239,68,68,0.2)' : '' }}>
          <span className="pharm-stat-icon">🔴</span>
          <span className="pharm-stat-value" style={{ color: stats.criticalBatches.length > 0 ? '#fca5a5' : '#f1f5f9' }}>
            {stats.criticalBatches.length}
          </span>
          <span className="pharm-stat-label">Critical (within 7d)</span>
        </div>
        <div className="pharm-stat-card" style={{ borderColor: stats.soonBatches.length > 0 ? 'rgba(245,158,11,0.2)' : '' }}>
          <span className="pharm-stat-icon">⚠️</span>
          <span className="pharm-stat-value" style={{ color: stats.soonBatches.length > 0 ? '#fcd34d' : '#f1f5f9' }}>
            {stats.soonBatches.length}
          </span>
          <span className="pharm-stat-label">Expiring (30d)</span>
        </div>
        <div className="pharm-stat-card">
          <span className="pharm-stat-icon">📋</span>
          <span className="pharm-stat-value" style={{ color: '#d8b4fe' }}>{stats.rxProducts.length}</span>
          <span className="pharm-stat-label">Prescription Required</span>
        </div>
      </div>

      {/* Critical Alert Banners */}
      {stats.expiredBatches.length > 0 && (
        <div className="pharmacy-alert-banner expired">
          <span className="alert-icon">⛔</span>
          <div className="alert-body">
            <div className="alert-title expired">EXPIRED STOCK ALERT</div>
            <div className="alert-detail">
              {stats.expiredBatches.length} batch(es) have expired. Remove them from active sale immediately to avoid legal violations.
              Medicines: {stats.expiredBatches.map(b => b.products?.name).join(', ')}
            </div>
          </div>
        </div>
      )}

      {stats.criticalBatches.length > 0 && (
        <div className="pharmacy-alert-banner expiring-soon">
          <span className="alert-icon">🔴</span>
          <div className="alert-body">
            <div className="alert-title expiring-soon">CRITICAL EXPIRY — Within 7 Days</div>
            <div className="alert-detail">
              {stats.criticalBatches.map(b => `${b.products?.name} (${daysUntilExpiry(b.expiry_date)}d left, Batch: ${b.batch_number || 'N/A'})`).join(' • ')}
            </div>
          </div>
        </div>
      )}

      {stats.rxProducts.length > 0 && (
        <div className="pharmacy-alert-banner prescription">
          <span className="alert-icon">📋</span>
          <div className="alert-body">
            <div className="alert-title prescription">PRESCRIPTION-ONLY MEDICINES IN STOCK</div>
            <div className="alert-detail">
              {stats.rxProducts.length} medicine(s) require a valid prescription before dispensing (Schedule H / Schedule X).
            </div>
          </div>
        </div>
      )}

      {/* Section Toggle Tabs */}
      <div className="tab-header" style={{ marginBottom: '20px' }}>
        <button className={`tab-btn ${activeSection === 'alerts' ? 'active' : ''}`} onClick={() => setActiveSection('alerts')}>
          Batch Status
        </button>
        <button className={`tab-btn ${activeSection === 'generics' ? 'active' : ''}`} onClick={() => setActiveSection('generics')}>
          Generics Lookup
        </button>
      </div>

      {/* BATCH STATUS SECTION */}
      {activeSection === 'alerts' && (
        <>
          <div className="pharm-section-title">
            <span>🧪</span> All Medical Batches — Sorted by Expiry
          </div>
          {loading ? (
            <p style={{ color: '#64748b' }}>Loading batches...</p>
          ) : sortedBatches.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '30px' }}>
              No medical batches found. Receive medical stock from the Receive Stock tab.
            </p>
          ) : (
            <div className="batch-detail-grid">
              {sortedBatches.map((bat) => {
                const days = daysUntilExpiry(bat.expiry_date);
                return (
                  <div key={bat.id} className={`batch-detail-card ${getBatchCardClass(days)}`}>
                    <div>
                      <div className="batch-product-name">{bat.products?.name}</div>
                      {bat.products?.generic_name && (
                        <div className="batch-generic-name">Generic: {bat.products.generic_name}</div>
                      )}
                    </div>

                    <div className="batch-meta-row">
                      <span className="batch-meta-label">Batch #</span>
                      <span>{bat.batch_number || 'N/A'}</span>
                    </div>

                    <div className="batch-meta-row">
                      <span className="batch-meta-label">Manufacturer</span>
                      <span>{bat.products?.manufacturer || 'N/A'}</span>
                    </div>

                    <div className="batch-meta-row">
                      <span className="batch-meta-label">Qty Remaining</span>
                      <span>{bat.quantity?.toFixed(2)} units</span>
                    </div>

                    <div className="batch-meta-row">
                      <span className="batch-meta-label">Cost/Unit</span>
                      <span>{tenant?.currency} {bat.purchase_cost?.toFixed(2)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ExpiryBubble days={days} />
                      <span className={`rx-badge ${bat.products?.prescription_required ? 'required' : 'not-required'}`}>
                        {bat.products?.prescription_required ? '📋 Rx Required' : 'OTC'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* GENERICS LOOKUP SECTION */}
      {activeSection === 'generics' && (
        <>
          <div className="pharm-section-title">
            <span>🔬</span> Generics & Manufacturer Reference
          </div>
          <div className="generic-search-bar">
            <input
              className="generic-search-input"
              type="text"
              placeholder="Search by medicine name, generic formula, or manufacturer..."
              value={genericSearch}
              onChange={(e) => setGenericSearch(e.target.value)}
            />
          </div>

          <div className="generics-table-wrapper">
            <table className="generics-table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th>Generic Formula</th>
                  <th>Manufacturer</th>
                  <th>Prescription</th>
                </tr>
              </thead>
              <tbody>
                {filteredGenerics.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td style={{ color: '#818cf8' }}>{p.generic_name || <span style={{ color: '#475569' }}>Not Set</span>}</td>
                    <td>{p.manufacturer || <span style={{ color: '#475569' }}>Unknown</span>}</td>
                    <td>
                      <span className={`rx-badge ${p.prescription_required ? 'required' : 'not-required'}`}>
                        {p.prescription_required ? '📋 Rx Required' : 'OTC'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredGenerics.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#475569' }}>
                      No results found for "{genericSearch}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
