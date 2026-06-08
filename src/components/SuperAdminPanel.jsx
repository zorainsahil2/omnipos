import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { CreateStoreModal } from './CreateStoreModal';
import './SuperAdmin.css';

/* ─── Payment gateway definitions ──────────────────────── */
const GATEWAYS = [
  {
    name: 'Stripe',
    icon: '💳',
    regions: 'USA, UK, Germany, Spain, UAE, Global',
    desc: 'Industry-standard gateway supporting 135+ currencies. Integrate via Stripe.js SDK. Webhooks handled via Supabase Edge Functions.',
    docsUrl: 'https://stripe.com/docs',
    status: 'stub',
  },
  {
    name: 'Razorpay',
    icon: '🇮🇳',
    regions: 'India, Pakistan (limited)',
    desc: 'Best-in-class for South Asia. Supports UPI, Netbanking, cards, and wallets. Simple REST API integration.',
    docsUrl: 'https://razorpay.com/docs',
    status: 'stub',
  },
  {
    name: 'HyperPay',
    icon: '🇸🇦',
    regions: 'Saudi Arabia, UAE, Qatar, Egypt, Kuwait',
    desc: 'MENA-focused payment gateway with SADAD / MADA / Fawry support.',
    docsUrl: 'https://wordpresshyperpay.docs.oppwa.com',
    status: 'stub',
  },
  {
    name: 'Manual (Cash / Bank Transfer)',
    icon: '🏦',
    regions: 'Pakistan, India, Egypt, All Countries',
    desc: 'Super Admin verifies receipt of cash or bank transfer and manually toggles subscription to Active.',
    docsUrl: null,
    status: 'manual',
  },
];

/* ─── Single tenant row ─────────────────────────────────── */
const TenantRow = ({ tenant, onToggle, onPriceSave }) => {
  const [price, setPrice]   = useState(tenant.subscription_price ?? 0);
  const [saving, setSaving] = useState(false);
  const isActive = tenant.subscription_status === 'active';

  const handleSavePrice = async () => {
    setSaving(true);
    await onPriceSave(tenant.id, parseFloat(price) || 0);
    setSaving(false);
  };

  return (
    <tr>
      {/* Store name + country */}
      <td>
        <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{tenant.name}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
          {tenant.country} · {tenant.currency}
          {tenant.tax_rate > 0 && (
            <span style={{ marginLeft: '6px', color: '#475569' }}>
              · {tenant.tax_name} {tenant.tax_rate}%
            </span>
          )}
        </div>
      </td>

      {/* Store type */}
      <td>
        <span
          className={`badge ${tenant.store_type === 'medical' ? 'badge-purple' : 'badge-blue'}`}
          style={{ fontSize: '0.72rem' }}
        >
          {tenant.store_type === 'medical' ? '💊 Medical' : '🛒 Grocery'}
        </span>
      </td>

      {/* Subscription price editor */}
      <td>
        <div className="price-cell">
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{tenant.currency}</span>
          <input
            className="price-input"
            type="number"
            min="0"
            step="0.5"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />
          <button className="save-price-btn" onClick={handleSavePrice} disabled={saving}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </td>

      {/* Active toggle */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => onToggle(tenant.id, isActive)}
            />
            <span className="toggle-slider"></span>
          </label>
          <span style={{ fontSize: '0.8rem', color: isActive ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </td>

      {/* Monthly revenue */}
      <td style={{ color: '#818cf8', fontWeight: 700 }}>
        {tenant.currency} {parseFloat(tenant.subscription_price || 0).toFixed(2)}
      </td>

      {/* Joined */}
      <td style={{ color: '#64748b', fontSize: '0.8rem' }}>
        {new Date(tenant.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
};

/* ─── Main SuperAdminPanel ──────────────────────────────── */
export const SuperAdminPanel = () => {
  const [tenants, setTenants]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showCreateModal, setModal] = useState(false);
  const [filterStatus, setFilter]   = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearch]     = useState('');
  const [toast, setToast]           = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  /* ── Load all tenants ── */
  const loadTenants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error('SuperAdmin: failed to load tenants', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTenants(); }, []);

  /* ── Toggle subscription status ── */
  const handleToggle = async (tenantId, wasActive) => {
    const newStatus = wasActive ? 'inactive' : 'active';
    const { error } = await supabase
      .from('tenants')
      .update({ subscription_status: newStatus })
      .eq('id', tenantId);
    if (error) { showToast('❌ Failed to update status'); return; }
    setTenants(prev =>
      prev.map(t => t.id === tenantId ? { ...t, subscription_status: newStatus } : t)
    );
    showToast(`✅ Subscription ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
  };

  /* ── Update subscription price ── */
  const handlePriceSave = async (tenantId, newPrice) => {
    const { error } = await supabase
      .from('tenants')
      .update({ subscription_price: newPrice })
      .eq('id', tenantId);
    if (error) { showToast('❌ Failed to update price'); return; }
    setTenants(prev =>
      prev.map(t => t.id === tenantId ? { ...t, subscription_price: newPrice } : t)
    );
    showToast(`✅ Price updated to ${newPrice.toFixed(2)}`);
  };

  /* ── Filtered list ── */
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const matchStatus = filterStatus === 'all' || t.subscription_status === filterStatus;
      const matchType   = filterType === 'all' || t.store_type === filterType;
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || t.name?.toLowerCase().includes(q) || t.country?.toLowerCase().includes(q);
      return matchStatus && matchType && matchSearch;
    });
  }, [tenants, filterStatus, filterType, searchTerm]);

  /* ── Summary stats ── */
  const stats = useMemo(() => {
    const active   = tenants.filter(t => t.subscription_status === 'active');
    const inactive = tenants.filter(t => t.subscription_status !== 'active');
    const grocery  = tenants.filter(t => t.store_type === 'grocery');
    const medical  = tenants.filter(t => t.store_type === 'medical');
    const mrr      = active.reduce((s, t) => s + (t.subscription_price || 0), 0);
    return { total: tenants.length, active: active.length, inactive: inactive.length, grocery: grocery.length, medical: medical.length, mrr };
  }, [tenants]);

  /* ── Revenue by country ── */
  const revenueByCountry = useMemo(() => {
    const map = {};
    tenants
      .filter(t => t.subscription_status === 'active' && t.subscription_price > 0)
      .forEach(t => {
        const key = `${t.country} (${t.currency})`;
        map[key] = (map[key] || 0) + t.subscription_price;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [tenants]);

  return (
    <div className="admin-layout">

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 999,
          background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(99,102,241,0.3)',
          padding: '12px 20px', borderRadius: '12px', color: '#e2e8f0',
          fontSize: '0.9rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}

      {/* Create Store Modal */}
      {showCreateModal && (
        <CreateStoreModal
          onClose={() => setModal(false)}
          onStoreCreated={() => { loadTenants(); showToast('✅ New store added successfully!'); }}
        />
      )}

      {/* Hero */}
      <div className="admin-hero">
        <div>
          <div className="admin-hero-title">🛡 Super Admin Control Panel</div>
          <div className="admin-hero-sub">
            Create and manage all stores, control subscriptions, and configure gateways.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="admin-add-store-btn"
            onClick={() => setModal(true)}
          >
            ＋ Add New Store
          </button>
          <button className="admin-refresh-btn" onClick={loadTenants} disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <span className="admin-stat-icon">🏪</span>
          <span className="admin-stat-val">{stats.total}</span>
          <span className="admin-stat-lbl">Total Stores</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">✅</span>
          <span className="admin-stat-val" style={{ color: '#4ade80' }}>{stats.active}</span>
          <span className="admin-stat-lbl">Active</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">⛔</span>
          <span className="admin-stat-val" style={{ color: stats.inactive > 0 ? '#f87171' : '#f1f5f9' }}>{stats.inactive}</span>
          <span className="admin-stat-lbl">Inactive</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">🛒</span>
          <span className="admin-stat-val" style={{ color: '#93c5fd' }}>{stats.grocery}</span>
          <span className="admin-stat-lbl">Grocery Stores</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">💊</span>
          <span className="admin-stat-val" style={{ color: '#d8b4fe' }}>{stats.medical}</span>
          <span className="admin-stat-lbl">Medical Stores</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-icon">💰</span>
          <span className="admin-stat-val" style={{ color: '#818cf8' }}>{stats.mrr.toFixed(0)}</span>
          <span className="admin-stat-lbl">Est. MRR (mixed)</span>
        </div>
      </div>

      {/* Tenant Table */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span>🏪</span> All Registered Stores
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            style={{ flex: 1, minWidth: '180px', background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px 14px', color: '#f8fafc', fontSize: '0.88rem' }}
            type="text"
            placeholder="Search by store name or country..."
            value={searchTerm}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px 12px', color: '#f8fafc', fontSize: '0.88rem' }}
            value={filterStatus}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <select
            style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px 12px', color: '#f8fafc', fontSize: '0.88rem' }}
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="grocery">🛒 Grocery</option>
            <option value="medical">💊 Medical</option>
          </select>
        </div>

        <div className="tenant-table-wrap">
          <table className="tenant-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Type</th>
                <th>Monthly Price</th>
                <th>Subscription</th>
                <th>Revenue</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#475569' }}>
                    Loading stores...
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>
                    {tenants.length === 0
                      ? <span>No stores yet. Click <strong style={{ color: '#818cf8' }}>＋ Add New Store</strong> to create your first one.</span>
                      : 'No stores match the current filters.'
                    }
                  </td>
                </tr>
              ) : (
                filteredTenants.map(t => (
                  <TenantRow
                    key={t.id}
                    tenant={t}
                    onToggle={handleToggle}
                    onPriceSave={handlePriceSave}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by Country */}
      {revenueByCountry.length > 0 && (
        <div className="admin-section">
          <div className="admin-section-title"><span>📊</span> Revenue Breakdown by Country</div>
          <div className="revenue-summary">
            {revenueByCountry.map(([country, amount]) => (
              <div key={country} className="revenue-row">
                <span>{country}</span>
                <span style={{ fontWeight: 700 }}>{amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Gateways */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span>💳</span> Payment Gateway Integration Plan
        </div>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '20px', marginTop: '-8px' }}>
          Connect each gateway via Supabase Edge Functions and Vercel env variables.
        </p>
        <div className="gateway-grid">
          {GATEWAYS.map(gw => (
            <div key={gw.name} className="gateway-card">
              <div className="gateway-header">
                <div>
                  <div className="gateway-name">{gw.icon} {gw.name}</div>
                  <div className="gateway-regions">{gw.regions}</div>
                </div>
                <span className={`gateway-status-pill ${gw.status}`}>
                  {gw.status === 'stub' ? 'Ready to Integrate' : 'Active (Manual)'}
                </span>
              </div>
              <div className="gateway-desc">{gw.desc}</div>
              {gw.docsUrl ? (
                <a className="gateway-docs-link" href={gw.docsUrl} target="_blank" rel="noopener noreferrer">
                  📄 View Integration Docs →
                </a>
              ) : (
                <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>
                  ✓ Toggle is built-in above
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Manual activation guide */}
      <div className="admin-section" style={{ background: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.1)' }}>
        <div className="admin-section-title" style={{ color: '#86efac' }}>
          <span>📋</span> Manual Activation (Pakistan / India / Cash Markets)
        </div>
        <ol style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: '1.9', paddingLeft: '20px', margin: 0 }}>
          <li>Create the store above — set status to <strong>Inactive</strong> if payment is pending.</li>
          <li>Shopkeeper makes payment (cash / EasyPaisa / JazzCash / bank transfer).</li>
          <li>Shopkeeper sends payment proof (screenshot) to you.</li>
          <li>Verify amount matches the store's monthly price.</li>
          <li>Toggle the subscription to <strong style={{ color: '#4ade80' }}>Active</strong> — POS unlocks instantly.</li>
        </ol>
      </div>

    </div>
  );
};
