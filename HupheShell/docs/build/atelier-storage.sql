-- Migration: atelier_storage
-- Purpose: Setup Supabase Storage for project assets and link them to presentations

-- 1. Enable Storage if not already enabled (this is usually pre-enabled in Supabase)
-- Note: Bucket creation via SQL requires the storage schema to be active.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'atelier-assets', 
    'atelier-assets', 
    false, 
    10485760, -- 10MB
    '{image/*}'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies

-- Policy: Users can upload to their own folder
CREATE POLICY "Users can upload assets to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'atelier-assets' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can read assets they own (by path) or if they are admin
CREATE POLICY "Users can view their own assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'atelier-assets' AND
    (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_admin()
    )
);

-- Policy: Users can delete their own assets
CREATE POLICY "Users can delete their own assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'atelier-assets' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Database Link: track assets in presentations
-- We add an array of storage paths to the presentations table.
-- This allows for easy cleanup and pre-fetching.

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'presentations') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'presentations' AND column_name = 'asset_paths') THEN
            ALTER TABLE public.presentations ADD COLUMN asset_paths text[] DEFAULT '{}';
        END IF;
    END IF;
END $$;

-- 4. Logging
SELECT public.log_action('Storage setup: atelier-assets bucket created', 'storage.buckets', NULL, NULL);
