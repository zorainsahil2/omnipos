# OmniPOS — Deployment Guide

## Overview

OmniPOS uses a two-service architecture:
- **Supabase** — PostgreSQL database, authentication, and row-level security
- **Vercel** — Frontend hosting with global CDN and automatic deploys

---

## Step 1: Supabase Setup

### 1.1 Create a Project
1. Go to [https://supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project** → enter a name (e.g. `omnipos-prod`) → choose your region closest to your user base → set a strong database password → click **Create Project**.

### 1.2 Run the Database Schema
1. In your Supabase project sidebar, go to **SQL Editor**.
2. Click **New Query**.
3. Open `supabase_schema.sql` from your project root and **paste the entire contents** into the editor.
4. Click **Run**. You should see `Success. No rows returned` for each statement.

### 1.3 Get Your API Keys
1. Go to **Project Settings → API** in the Supabase sidebar.
2. Copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
   - **anon / public key** → this is your `VITE_SUPABASE_ANON_KEY`

### 1.4 Create Your Super Admin Account
1. Go to **Authentication → Users** in the Supabase sidebar.
2. Click **Invite User** or **Add User** → enter your email → Create.
3. After the user is created, go to **SQL Editor** and run this to promote them to super_admin:

```sql
-- Replace with your actual user ID (visible in Auth > Users table)
UPDATE public.profiles
SET role = 'super_admin'
WHERE id = 'YOUR-USER-UUID-HERE';
```

---

## Step 2: Configure Environment Variables Locally

1. Copy the `.env.example` file to `.env.local`:
   ```
   cp .env.example .env.local
   ```
2. Fill in your real values:
   ```
   VITE_SUPABASE_URL=https://xyzabc.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
3. Run the dev server to verify:
   ```
   npm run dev
   ```

---

## Step 3: Deploy to Vercel

### 3.1 Push Code to GitHub
```bash
git init
git add .
git commit -m "feat: initial OmniPOS build"
git remote add origin https://github.com/YOUR_USERNAME/omnipos.git
git push -u origin main
```

### 3.2 Import into Vercel
1. Go to [https://vercel.com](https://vercel.com) → **Add New Project**.
2. Select your GitHub repository.
3. Vercel will auto-detect **Vite** as the framework.
4. Under **Environment Variables**, add:
   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |
5. Click **Deploy** → done!

### 3.3 Add Your Vercel Domain to Supabase
1. In Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://your-project.vercel.app`
   - **Redirect URLs**: `https://your-project.vercel.app/**`
2. Click **Save**.

---

## Step 4: Post-Deployment Verification Checklist

### ✅ Authentication
- [ ] New shopkeeper can register with store name, country, store type
- [ ] Registered user can log in and see their Tenant dashboard
- [ ] Super Admin user sees the Admin Panel (not the POS terminal)

### ✅ Multi-Tenancy (RLS)
- [ ] Register two separate shopkeeper accounts
- [ ] Confirm that each store can only see its own products and sales in the database
- [ ] Run this in Supabase SQL Editor to verify:
  ```sql
  SELECT id, name, tenant_id FROM products ORDER BY created_at DESC LIMIT 20;
  ```

### ✅ Offline / PWA
- [ ] Open the app in Chrome → go to the Billing tab → add products
- [ ] Open **DevTools → Application → Service Workers** → confirm SW is registered
- [ ] In DevTools → **Network tab** → set to **Offline**
- [ ] Try adding a product to cart and completing a sale
- [ ] Confirm a toast shows "Offline Mode — bill saved locally"
- [ ] Re-enable network → confirm the pending sale count badge appears and clears

### ✅ Grocery UoM Conversion
- [ ] Add a product (e.g. Sugar) with base unit `Kg` and price 100
- [ ] Add an alternate unit `Bag` = 50 Kg at price 4500
- [ ] In Receive Stock, receive 2 Bags at cost 3000 per Bag
- [ ] Confirm system shows `100.00 Kg` added and cost `60.00` per Kg

### ✅ Pharmacy Batch / Expiry
- [ ] Add a medicine (type: medical) with generic name and prescription flag
- [ ] Receive a batch with an expiry date 5 days from today
- [ ] Go to Pharmacy tab → confirm orange "⚠ 5d left" bubble and warning banner
- [ ] Set expiry to yesterday → confirm red "⛔ Expired" alert banner fires

### ✅ Super Admin Panel
- [ ] Log in as super_admin → confirm you land on the Admin Panel
- [ ] Toggle a shopkeeper subscription to Inactive → log in as that shopkeeper → confirm warning banner appears
- [ ] Set a custom subscription price → confirm the price updates in the table

---

## Step 5: Payment Gateway Integration (When Ready)

### Stripe (Global / UK / USA / UAE)
1. Add to Vercel env vars: `VITE_STRIPE_PUBLIC_KEY=pk_live_...`
2. Create a Supabase Edge Function: `supabase/functions/stripe-webhook/index.ts`
3. On successful payment → update `tenants.subscription_status = 'active'`

### Razorpay (India / Pakistan)
1. Add: `VITE_RAZORPAY_KEY_ID=rzp_live_...`
2. Use Razorpay Checkout.js script in a payment modal component
3. Webhook → Edge Function → activate tenant

### HyperPay (Saudi Arabia / UAE / Qatar / Egypt)
1. Add: `VITE_HYPERPAY_ENTITY_ID=...`
2. Embed HyperPay payment widget with server-side token generation
3. Webhook → Edge Function → activate tenant

---

## Build Commands Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Build production bundle to `/dist` |
| `npm run preview` | Preview production build locally |

---

## Project File Structure

```
omnipos/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── components/
│   │   ├── Login.jsx / .css         # Auth screens
│   │   ├── ProductManagement.jsx    # Product catalog + UoM editor
│   │   ├── InventoryInflow.jsx      # Bulk stock intake + batch creation
│   │   ├── PharmacyPanel.jsx / .css # Expiry alerts + generics lookup
│   │   ├── POSTerminal.jsx / .css   # Main billing terminal
│   │   ├── SuperAdminPanel.jsx / .css # Admin tenant management
│   │   └── Inventory.css
│   ├── context/
│   │   └── AuthContext.jsx          # Supabase auth + tenant context
│   ├── db/
│   │   └── localDb.js               # Dexie.js IndexedDB schema
│   ├── hooks/
│   │   ├── useOnlineStatus.js       # Online/offline detector
│   │   └── useSyncQueue.js          # Auto offline-to-Supabase sync
│   ├── App.jsx                      # Role-based routing
│   ├── main.jsx                     # PWA SW registration
│   ├── supabaseClient.js            # Supabase client init
│   └── index.css / App.css          # Global styles + dashboard CSS
├── supabase_schema.sql              # Full DB schema (run once in Supabase)
├── BLUEPRINT.md                     # Project architecture document
├── DEPLOYMENT.md                    # This file
├── vercel.json                      # Vercel SPA rewrites + headers
├── vite.config.js                   # Vite + PWA + code splitting
└── .env.example                     # Environment variable template
```
