-- =====================================================================
-- OMNIPOS MIGRATION V5: Product Image Upload Support
-- Adds image_url column + Sets up storage bucket and RLS policies
-- Run ONCE in Supabase SQL Editor
-- =====================================================================

-- 1. Add image_url to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 2. Create storage bucket if not exists via insert
-- (Since bucket creation might be restricted, this insert adds the config directly if permitted,
-- but the shopkeeper can also create 'product-images' as a public bucket manually from the Dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies on storage.objects for 'product-images' bucket
-- Drop policies if they already exist to avoid errors
DROP POLICY IF EXISTS "Tenant can upload own product images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant can update own product images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant can delete own product images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;

-- Tenant can upload (INSERT) their own product images
CREATE POLICY "Tenant can upload own product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text
      FROM profiles
      WHERE id = auth.uid()
    )
  );

-- Tenant can update (UPDATE) their own product images
CREATE POLICY "Tenant can update own product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text
      FROM profiles
      WHERE id = auth.uid()
    )
  );

-- Tenant can delete (DELETE) their own product images
CREATE POLICY "Tenant can delete own product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text
      FROM profiles
      WHERE id = auth.uid()
    )
  );

-- Public read access
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
