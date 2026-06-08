import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

const currencyMap = {
  Pakistan: 'PKR',
  India: 'INR',
  UAE: 'AED',
  'Saudi Arabia': 'SAR',
  Qatar: 'QAR',
  Egypt: 'EGP',
  USA: 'USD',
  UK: 'GBP',
  Germany: 'EUR',
  Spain: 'EUR',
};

export const Login = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [storeType, setStoreType] = useState('grocery');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (isRegister) {
      // Sign Up Process
      try {
        const currency = currencyMap[country] || 'USD';
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              tenant_name: storeName,
              country,
              currency,
              store_type: storeType,
              role: 'tenant_admin',
            },
          },
        });

        if (error) throw error;

        if (data?.user?.identities?.length === 0) {
          setErrorMsg('This email is already registered. Please login.');
        } else {
          setSuccessMsg('Registration successful! Please check your email to confirm registration or log in.');
        }
      } catch (err) {
        setErrorMsg(err.message || 'An error occurred during registration.');
      } finally {
        setLoading(false);
      }
    } else {
      // Sign In Process
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      } catch (err) {
        setErrorMsg(err.message || 'Invalid login credentials.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">OmniPOS</div>
          <p className="auth-subtitle">
            {isRegister
              ? 'Register your retail store & start billing'
              : 'Sign in to access your shop billing terminal'}
          </p>
        </div>

        {errorMsg && <div className="error-banner">⚠ {errorMsg}</div>}
        {successMsg && <div className="success-banner">✓ {successMsg}</div>}

        <form className="auth-form" onSubmit={handleAuth}>
          {isRegister && (
            <>
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="storeName">Store/Business Name</label>
                <input
                  id="storeName"
                  type="text"
                  placeholder="Green Grocery or Alpha Pharmacy"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="storeType">Business Type</label>
                  <select
                    id="storeType"
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value)}
                  >
                    <option value="grocery">Grocery Store</option>
                    <option value="medical">Medical / Pharmacy</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {Object.keys(currencyMap).map((c) => (
                      <option key={c} value={c}>
                        {c} ({currencyMap[c]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="name@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Processing...' : isRegister ? 'Register Store' : 'Sign In'}
          </button>
        </form>

        <div className="auth-toggle">
          {isRegister ? 'Already have a store?' : "Don't have a retail store account?"}
          <span
            className="auth-toggle-link"
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            {isRegister ? 'Sign In' : 'Register Now'}
          </span>
        </div>
      </div>
    </div>
  );
};
