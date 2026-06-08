# OmniPOS - Multi-Tenant Grocery & Medical Retail POS

OmniPOS is a modern, offline-first, multi-tenant Point of Sale (POS) system designed for retail businesses, specifically tailored for grocery stores and pharmacies (medical stores). The system operates on a SaaS (Software-as-a-Service) model where shopkeepers sign up, and the Super Admin can configure custom subscription prices or manually/automatically manage subscription statuses. 

---

## Core Features (Enhanced)

### 1. Multi-Tenant Architecture & Subscriptions
* **Data Isolation:** Every shopkeeper (tenant) has their own dashboard, inventory, and transaction records, strictly isolated using **Supabase Row Level Security (RLS)**.
* **Flexible Subscriptions:**
  * Single subscription plan per tenant, but with **dynamic custom pricing** set manually by the Super Admin.
  * **Hybrid Payments:** Supports automatic online payment gateways (Stripe/Razorpay, localized by country) and manual override by Super Admin (for Cash/Bank Transfer validation in countries like Pakistan, India, Egypt).
* **Super Admin Control Panel:** Manage tenants, view subscription states, toggle manual activation, and change custom monthly subscription fees.

### 2. Offline-First POS Billing (PWA)
* **Continuous Billing:** Shopkeepers can continue searching inventory and generating sales receipts even if the internet goes down.
* **IndexedDB Local Storage:** Synchronizes active inventory items, customer lists, and system settings to the local browser database.
* **Automatic Sync Engine:** Queues offline transactions and uploads them to the server automatically once the internet connection is restored.

### 3. Grocery Store Module (Bulk to Unit Conversion)
* **Unit of Measure (UoM) Engine:** Define custom conversions (e.g., 1 Bag = 50 Kg, 1 Box = 12 Packets, 1 Tin = 5 Liters).
* **Bulk Inventory Inflow:** Shopkeepers buy goods in bulk (e.g., purchase 5 Bags of sugar).
* **Fractional Sales Outflow:** Sales can be billed in fractional/smaller units (e.g., selling 1.5 Kg of sugar).
* **Real-time Profit & Cost Tracking:** Calculates profit margin automatically based on the weighted purchase cost of bulk goods vs. the selling price of individual fractional units.

### 4. Medical Store (Pharmacy) Module
* **Batch & Expiry Management:** Track item stock by batch number and expiry dates.
* **Prescription & Schedule Alerts:** Tag dangerous or regulated drugs (e.g., Schedule H/X alerts) that require prescription verification.
* **Strip to Tablet Conversion:** Define packaging conversions (e.g., 1 Strip = 10 Tablets) so pills can be sold individually while updating the box/strip stock.
* **Generics & Manufacturer Info:** Track generic names (formulas) and manufacturers for alternate medicine recommendations.

### 5. Reporting & Analytics
* **Dashboard:** Visual representation of sales, expenses, profits, and top-selling products.
* **Stock Alerts:** Automated alerts for low stock levels and near-expiry items.

---

## Tech Stack

* **Frontend Hosting & Framework:** **React (Vite)** + **Vanilla CSS** hosted on **Vercel**.
* **Database & Auth (BaaS):** **Supabase (PostgreSQL)**.
  * *Row Level Security (RLS)* for tenant isolation.
  * *Supabase Auth* for secure authentication.
  * *Supabase Edge Functions* for handling payment webhooks.
* **Local Caching:** **Dexie.js / IndexedDB** for offline storage.
* **Language:** English.

---

## Step-by-Step Implementation Plan

### Step 1: Database Schema & Supabase Setup
* Setup Supabase project and create PostgreSQL tables:
  * `tenants` (custom pricing, subscription status, country, currency).
  * `profiles` (shopkeepers, admins).
  * `products` (details, generic formula, manufacturer, type: grocery/medical).
  * `product_units` (bulk to unit conversion ratios).
  * `inventory_batches` (batch number, expiry date, purchase cost, current stock).
  * `sales` & `sale_items` (sales transaction logs).
  * `subscriptions` (payment history, expiration date).
* Enable Row Level Security (RLS) on all user-facing tables.

### Step 2: Authentication & Multi-Tenancy Integration
* Configure Supabase Auth and setup database triggers to auto-create tenant profiles.
* Implement RLS policies using `auth.uid()` and `tenant_id` to ensure secure tenant isolation.

### Step 3: Frontend PWA Boilerplate & Local DB
* Setup React (Vite) app with Vanilla CSS.
* Configure PWA Service Workers to cache assets for offline access.
* Initialize Dexie.js (IndexedDB wrapper) on the frontend to store local product catalog and offline sales queues.

### Step 4: Product Listing & Grocery Conversion Engine
* Build product management screens for grocery items (listing products, custom conversion ratios).
* Create inventory inflow dashboard to receive bulk goods (Bags/Tins/Packets).
* Implement calculation algorithms to compute remaining stock in fractional units.

### Step 5: Pharmacy Features (Batch, Expiry, Generics)
* Build medical product creation screens (generic name, manufacturer, schedule flag).
* Implement Batch & Expiry intake forms.
* Build batch selection UI in POS checkout to deduct stock from specific batches (FIFO or manual selection).

### Step 6: Billing Interface & Offline-First POS
* Design POS cart and checkout screen.
* Implement IndexedDB product search (instant searching, offline support).
* Build the receipt generator (printable formats).
* Implement synchronization logic: check online status, flush offline queue to Supabase, update local inventory.

### Step 7: Super Admin Panel & Subscriptions
* Create a dedicated Super Admin view.
* Add manual activate/deactivate toggles and price overrides for tenants.
* Set up Stripe/Razorpay integration endpoints.

### Step 8: Deployment & QA Testing
* Deploy Frontend to Vercel.
* Verify RLS security policies, offline synchronization stability, and fractional unit stock calculation accuracy.
