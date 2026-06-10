-- =====================================================================
-- OMNIPOS MIGRATION V6: Category Sidebar & Favourites Support
-- Adds category and is_favourite columns to products
-- Creates public.categories table and configures RLS policies
-- Run ONCE in Supabase SQL Editor
-- =====================================================================

-- 1. Add category and is_favourite columns to public.products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS is_favourite BOOLEAN DEFAULT false;

-- 2. Create public.categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(50)  NOT NULL,
  icon        VARCHAR(10)  NOT NULL DEFAULT '📦',
  color       VARCHAR(20)  NOT NULL DEFAULT '#6b7280',
  sort_order  INT          NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 3. Enable Row Level Security (RLS) on public.categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for public.categories table
DROP POLICY IF EXISTS "Tenant manages own categories" ON public.categories;

-- Allow tenants (and super admins) full access to their own categories
CREATE POLICY "Tenant manages own categories"
  ON public.categories FOR ALL
  USING (
    tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()
  )
  WITH CHECK (
    tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()
  );

-- 5. Indexes for fast category search/filter
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_favourite ON public.products(is_favourite) WHERE is_favourite = true;
CREATE INDEX IF NOT EXISTS idx_categories_tenant_sort ON public.categories(tenant_id, sort_order);
