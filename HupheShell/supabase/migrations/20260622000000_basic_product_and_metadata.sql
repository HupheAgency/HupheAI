-- Product Studio: Basic Product + Polish Layer support

ALTER TABLE source_assets DROP CONSTRAINT IF EXISTS source_assets_type_check;
ALTER TABLE source_assets ADD CONSTRAINT source_assets_type_check
  CHECK (type = ANY (ARRAY['original-image', 'normalized-image', 'object-mask', 'manual-mask', 'thumbnail', 'basic-product']));

ALTER TABLE source_assets DROP CONSTRAINT IF EXISTS source_assets_provenance_check;
ALTER TABLE source_assets ADD CONSTRAINT source_assets_provenance_check
  CHECK (provenance = ANY (ARRAY['observed', 'inferred']));

ALTER TABLE provider_runs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
