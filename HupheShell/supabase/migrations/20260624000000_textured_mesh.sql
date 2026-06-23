-- Textured mesh kolommen op reconstruction_versions
ALTER TABLE reconstruction_versions
  ADD COLUMN IF NOT EXISTS textured_mesh_url text,
  ADD COLUMN IF NOT EXISTS texture_atlas_url text,
  ADD COLUMN IF NOT EXISTS material_manifest jsonb,
  ADD COLUMN IF NOT EXISTS texture_source_view_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS texture_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS texture_error text;

ALTER TABLE reconstruction_versions
  DROP CONSTRAINT IF EXISTS reconstruction_versions_texture_status_check;
ALTER TABLE reconstruction_versions
  ADD CONSTRAINT reconstruction_versions_texture_status_check
  CHECK (texture_status = ANY (ARRAY['none', 'pending', 'processing', 'completed', 'failed']));
