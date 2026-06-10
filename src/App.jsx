import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { ProductManagement } from './components/ProductManagement';
import { InventoryInflow } from './components/InventoryInflow';
import { PharmacyPanel } from './components/PharmacyPanel';
import { POSTerminal } from './components/POSTerminal';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import './App.css';
import './styles/images.css';
import './styles/billing-layout.css';

/* ─── Super Admin App Shell ─────────────────────────────── */
function SuperAdminShell({ profile, signOut }) {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="logo-badge" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>SA</span>
          <span className="brand-name">OmniPOS Admin</span>
        </div>
        <div className="user-nav">
          <div className="user-info-text">
            <p className="user-name">{profile?.full_name || 'Super Admin'}</p>
            <p className="user-role" style={{ color: '#f59e0b' }}>Super Administrator</p>
          </div>
          <button className="logout-btn" onClick={signOut}>Log Out</button>
        </div>
      </header>
      <main className="dashboard-content">
        <SuperAdminPanel />
      </main>
    </div>
  );
}

/* ─── Tenant (Shopkeeper) App Shell ─────────────────────── */
function TenantShell({ profile, tenant, signOut }) {
  const [activeTab, setActiveTab] = useState('billing');
  const isSubscribed = tenant?.subscription_status === 'active';
  // store_type is set by Super Admin — always read from tenant record
  const isMedical    = tenant?.store_type === 'medical';

  const tabs = [
    { key: 'billing',  label: '🧾 Billing' },
    { key: 'catalog',  label: '📦 Products' },
    { key: 'inflow',   label: '📥 Receive Stock' },
    ...(isMedical ? [{ key: 'pharmacy', label: '💊 Pharmacy' }] : []),
    { key: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="logo-badge">{isMedical ? 'Rx' : 'POS'}</span>
          <span className="brand-name">{tenant?.name || 'OmniPOS'}</span>
        </div>

        {isSubscribed && (
          <nav className="tab-header" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="user-nav">
          <div className="user-info-text">
            <p className="user-name">{profile?.full_name || 'Cashier'}</p>
            <p className="user-role">{profile?.role || 'Staff'}</p>
          </div>
          <button className="logout-btn" onClick={signOut}>Log Out</button>
        </div>
      </header>

      <main className="dashboard-content">
        {/* Subscription suspended */}
        {!isSubscribed && (
          <div className="sub-warning-banner">
            <div>
              <div className="sub-warning-title">⛔ Subscription Inactive</div>
              <div className="sub-warning-desc">
                Your subscription is suspended. Please contact your administrator to reactivate your account.
              </div>
            </div>
            <div style={{ fontSize: '1.5rem' }}>⚠️</div>
          </div>
        )}

        {/* Tab panels */}
        {isSubscribed && activeTab === 'billing'  && <POSTerminal />}
        {isSubscribed && activeTab === 'catalog'  && <ProductManagement />}
        {isSubscribed && activeTab === 'inflow'   && <InventoryInflow />}
        {isSubscribed && activeTab === 'pharmacy' && isMedical && <PharmacyPanel />}

        {/* Settings overview */}
        {isSubscribed && activeTab === 'settings' && (
          <>
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
                {isMedical ? '💊 Pharmacy' : '🛒 Grocery'} Store — Settings
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Configuration and subscription details for your store.</p>
            </section>

            <div className="overview-grid">
              <div className="metric-card">
                <span className="metric-label">Store ID</span>
                <span className="metric-value" style={{ fontSize: '0.9rem', wordBreak: 'break-all', color: '#818cf8' }}>
                  {tenant?.id}
                </span>
                <span className="metric-meta">Supabase tenant scope</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Store Type</span>
                <span className="metric-value" style={{ textTransform: 'capitalize' }}>
                  {isMedical ? '💊 Medical / Pharmacy' : '🛒 Grocery'}
                </span>
                <span className="metric-meta">
                  {isMedical ? 'Batch, expiry & Rx features active' : 'UoM bulk conversion active'}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Country & Currency</span>
                <span className="metric-value">{tenant?.country}</span>
                <span className="metric-meta">Currency: {tenant?.currency}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Subscription Price</span>
                <span className="metric-value">{tenant?.currency} {tenant?.subscription_price?.toFixed(2)}</span>
                <span className="metric-meta">Custom rate set by Super Admin</span>
              </div>
            </div>

            <div style={{
              background: 'rgba(30,41,59,0.2)', border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '30px', textAlign: 'center', marginTop: '24px'
            }}>
              <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>Steps 1–7 Complete ✅</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '600px', margin: '0 auto' }}>
                All core modules are live. Final step: Deploy to Vercel and run QA verification.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Root AppContent ───────────────────────────────────── */
function AppContent() {
  const { user, profile, tenant, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Initializing Terminal...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  /* Route by role */
  if (profile?.role === 'super_admin') {
    return <SuperAdminShell profile={profile} signOut={signOut} />;
  }

  return (
    <TenantShell
      user={user}
      profile={profile}
      tenant={tenant}
      signOut={signOut}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
