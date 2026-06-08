import React, { useState, useEffect } from 'react';
import { supabaseAdmin } from '../supabaseAdmin';
import { supabase } from '../supabaseClient';
import { COUNTRY_NAMES, getCountryConfig } from '../config/countries';
import './CreateStoreModal.css';

const INITIAL_FORM = {
  storeName: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  country: 'Pakistan',
  storeType: 'grocery',
  subscriptionPrice: '',
  subscriptionStatus: 'active',
};

export const CreateStoreModal = ({ onClose, onStoreCreated }) => {
  const [form, setForm]         = useState(INITIAL_FORM);
  const [countryInfo, setInfo]  = useState(getCountryConfig('Pakistan'));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [step, setStep]         = useState(1); // 1=form, 2=success

  // Auto-update currency/tax whenever country changes
  useEffect(() => {
    setInfo(getCountryConfig(form.country));
  }, [form.country]);

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const validate = () => {
    if (!form.storeName.trim())   return 'Store name is required.';
    if (!form.ownerName.trim())   return 'Owner full name is required.';
    if (!form.ownerEmail.trim())  return 'Owner email is required.';
    if (form.ownerPassword.length < 8) return 'Password must be at least 8 characters.';
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);

    try {
      // STEP 1: Create auth user via admin client (bypasses email confirmation)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: form.ownerEmail.trim(),
        password: form.ownerPassword,
        email_confirm: true, // auto-confirm email
        user_metadata: {
          full_name: form.ownerName.trim(),
          role: 'tenant_admin',
          // Pass skip_trigger=true so our existing trigger doesn't create a duplicate tenant
          skip_trigger: 'true',
        },
      });

      if (authError) throw new Error('Auth: ' + authError.message);

      const newUserId = authData.user.id;

      // STEP 2: Create tenant record with all super-admin-defined settings
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: form.storeName.trim(),
          country: form.country,
          currency: countryInfo.currency,
          store_type: form.storeType,
          tax_rate: countryInfo.tax,
          tax_name: countryInfo.taxName,
          subscription_price: parseFloat(form.subscriptionPrice) || 0,
          subscription_status: form.subscriptionStatus,
        })
        .select('id')
        .single();

      if (tenantError) throw new Error('Tenant: ' + tenantError.message);

      // STEP 3: Create profile linking user to tenant
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUserId,
          tenant_id: tenantData.id,
          full_name: form.ownerName.trim(),
          role: 'tenant_admin',
        });

      if (profileError) throw new Error('Profile: ' + profileError.message);

      setStep(2); // Show success screen
      onStoreCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="csm-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="csm-header">
          <div>
            <div className="csm-title">🏪 Create New Store</div>
            <div className="csm-subtitle">Fill in all details — the shopkeeper will use this email to log in.</div>
          </div>
          <button className="csm-close" onClick={onClose}>✕</button>
        </div>

        {step === 2 ? (
          /* ── Success Screen ── */
          <div className="csm-success">
            <div className="csm-success-icon">✅</div>
            <div className="csm-success-title">Store Created Successfully!</div>
            <div className="csm-success-body">
              <strong>{form.storeName}</strong> is now registered.<br />
              The shopkeeper can log in with:<br />
              <span className="csm-cred">📧 {form.ownerEmail}</span>
            </div>
            <button className="csm-btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          /* ── Form ── */
          <div className="csm-body">
            {error && <div className="csm-error">⚠️ {error}</div>}

            {/* Store Info */}
            <div className="csm-section-label">Store Details</div>
            <div className="csm-grid-2">
              <div className="csm-field">
                <label>Store Name *</label>
                <input
                  className="csm-input"
                  type="text"
                  placeholder="e.g. Ahmed General Store"
                  value={form.storeName}
                  onChange={e => set('storeName', e.target.value)}
                />
              </div>
              <div className="csm-field">
                <label>Store Type *</label>
                <div className="csm-type-toggle">
                  <button
                    className={`csm-type-btn ${form.storeType === 'grocery' ? 'active-grocery' : ''}`}
                    onClick={() => set('storeType', 'grocery')}
                    type="button"
                  >
                    🛒 Grocery
                  </button>
                  <button
                    className={`csm-type-btn ${form.storeType === 'medical' ? 'active-medical' : ''}`}
                    onClick={() => set('storeType', 'medical')}
                    type="button"
                  >
                    💊 Medical / Pharmacy
                  </button>
                </div>
              </div>
            </div>

            {/* Country & auto-filled details */}
            <div className="csm-field">
              <label>Country *</label>
              <select
                className="csm-input"
                value={form.country}
                onChange={e => set('country', e.target.value)}
              >
                {COUNTRY_NAMES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Auto-filled info pills */}
            <div className="csm-auto-pills">
              <div className="csm-pill currency">
                💰 Currency: <strong>{countryInfo.currency}</strong>
              </div>
              <div className="csm-pill tax">
                🧾 {countryInfo.taxName}: <strong>{countryInfo.tax}%</strong>
              </div>
            </div>

            {/* Subscription */}
            <div className="csm-section-label">Subscription</div>
            <div className="csm-grid-2">
              <div className="csm-field">
                <label>Monthly Price ({countryInfo.currency})</label>
                <input
                  className="csm-input"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 2000"
                  value={form.subscriptionPrice}
                  onChange={e => set('subscriptionPrice', e.target.value)}
                />
              </div>
              <div className="csm-field">
                <label>Initial Status</label>
                <select
                  className="csm-input"
                  value={form.subscriptionStatus}
                  onChange={e => set('subscriptionStatus', e.target.value)}
                >
                  <option value="active">✅ Active</option>
                  <option value="inactive">⛔ Inactive (pending payment)</option>
                </select>
              </div>
            </div>

            {/* Owner / Login Credentials */}
            <div className="csm-section-label">Owner Login Credentials</div>
            <div className="csm-field">
              <label>Owner Full Name *</label>
              <input
                className="csm-input"
                type="text"
                placeholder="e.g. Muhammad Ahmed"
                value={form.ownerName}
                onChange={e => set('ownerName', e.target.value)}
              />
            </div>
            <div className="csm-grid-2">
              <div className="csm-field">
                <label>Login Email *</label>
                <input
                  className="csm-input"
                  type="email"
                  placeholder="owner@example.com"
                  value={form.ownerEmail}
                  onChange={e => set('ownerEmail', e.target.value)}
                />
              </div>
              <div className="csm-field">
                <label>Temporary Password * (min 8 chars)</label>
                <input
                  className="csm-input"
                  type="password"
                  placeholder="Set a strong password"
                  value={form.ownerPassword}
                  onChange={e => set('ownerPassword', e.target.value)}
                />
              </div>
            </div>

            <div className="csm-note">
              📌 Share these credentials with the shopkeeper. They can change their password after first login.
            </div>

            {/* Actions */}
            <div className="csm-actions">
              <button className="csm-btn-cancel" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button className="csm-btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? '⏳ Creating Store...' : '🏪 Create Store'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
