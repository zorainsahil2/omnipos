-- =====================================================================
-- OMNIPOS MIGRATION: Add store_type, tax_rate, tax_name to tenants
-- Run this in Supabase SQL Editor ONCE on your existing project.
-- =====================================================================

-- Add store_type column (grocery or medical, set by Super Admin)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS store_type text NOT NULL DEFAULT 'grocery'
    CHECK (store_type IN ('grocery', 'medical'));

-- Add tax_rate column (auto-set from country config)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) NOT NULL DEFAULT 0.00;

-- Add tax_name column (e.g. "VAT", "GST", "Sales Tax")
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tax_name text NOT NULL DEFAULT 'Tax';

-- Update the handle_new_user trigger to include the new fields
-- (so old self-registration flow still works if you ever re-enable it)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    default_tenant_id uuid;
BEGIN
    -- If skip_trigger flag is set, super admin is creating the user manually
    -- Tenant & profile are already created by the super admin API call — skip.
    IF new.raw_user_meta_data->>'skip_trigger' = 'true' THEN
        RETURN new;
    END IF;

    -- Standard self-registration flow
    IF new.raw_user_meta_data->>'tenant_name' IS NOT NULL THEN
        INSERT INTO public.tenants (name, country, currency, store_type, tax_rate, tax_name, subscription_price, subscription_status)
        VALUES (
            COALESCE(new.raw_user_meta_data->>'tenant_name', 'My Store'),
            COALESCE(new.raw_user_meta_data->>'country', 'Pakistan'),
            COALESCE(new.raw_user_meta_data->>'currency', 'PKR'),
            COALESCE(new.raw_user_meta_data->>'store_type', 'grocery'),
            0.00,
            'Tax',
            0.00,
            'active'
        ) RETURNING id INTO default_tenant_id;
    ELSE
        INSERT INTO public.tenants (name, country, currency, store_type)
        VALUES ('Demo Store', 'Pakistan', 'PKR', 'grocery')
        RETURNING id INTO default_tenant_id;
    END IF;

    INSERT INTO public.profiles (id, tenant_id, full_name, role)
    VALUES (
        new.id,
        default_tenant_id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Shopkeeper'),
        COALESCE(new.raw_user_meta_data->>'role', 'tenant_admin')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
