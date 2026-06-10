-- Migration: Add indexes for barcode and sku columns in products table
-- (Note: barcode column already exists in supabase_schema.sql, but we add indices for performance)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(50) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku     ON public.products(sku) WHERE sku IS NOT NULL;
