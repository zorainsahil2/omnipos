-- =====================================================================
-- OMNIPOS MIGRATION V3: Product Edit & Soft Delete
-- Run this in Supabase SQL Editor ONCE
-- =====================================================================

-- 1. Add is_active and updated_at columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Trigger: auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. DROP old broad SELECT policy (replace with is_active filter)
DROP POLICY IF EXISTS "Tenants can manage their own products" ON public.products;

-- 4. Tenants see ONLY their own ACTIVE products
CREATE POLICY "Tenant sees own active products"
  ON public.products FOR SELECT
  USING (
    (tenant_id = public.get_auth_tenant_id() AND is_active = true)
    OR public.is_super_admin()
  );

-- 5. Tenants can INSERT their own products
CREATE POLICY "Tenant can insert own products"
  ON public.products FOR INSERT
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- 6. Tenants can UPDATE (edit + soft delete) their own products
CREATE POLICY "Tenant can update own products"
  ON public.products FOR UPDATE
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
