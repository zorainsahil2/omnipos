-- =====================================================================
-- OMNIPOS MIGRATION V4: Product Search & Filter
-- Adds brand, sku, reorder_level columns + search indexes
-- Run ONCE in Supabase SQL Editor
-- =====================================================================

-- 1. Add new columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand          TEXT,
  ADD COLUMN IF NOT EXISTS sku            TEXT,
  ADD COLUMN IF NOT EXISTS reorder_level  NUMERIC(12, 4) NOT NULL DEFAULT 10;

-- 2. Unique SKU per tenant (partial index — allows NULL skus)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_tenant
  ON public.products(tenant_id, sku)
  WHERE sku IS NOT NULL AND is_active = true;

-- 3. Index for fast brand filtering
CREATE INDEX IF NOT EXISTS idx_products_brand
  ON public.products(brand)
  WHERE brand IS NOT NULL;

-- 4. Full-text search index on product name
CREATE INDEX IF NOT EXISTS idx_products_name_fts
  ON public.products USING gin(to_tsvector('english', name));

-- 5. Composite index for tenant+type (most common filter combo)
CREATE INDEX IF NOT EXISTS idx_products_tenant_type
  ON public.products(tenant_id, type)
  WHERE is_active = true;
