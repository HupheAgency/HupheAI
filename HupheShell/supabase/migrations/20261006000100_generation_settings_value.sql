ALTER TABLE generation_settings ADD COLUMN IF NOT EXISTS value jsonb;
ALTER TABLE generation_settings ALTER COLUMN image_prompt DROP NOT NULL;
