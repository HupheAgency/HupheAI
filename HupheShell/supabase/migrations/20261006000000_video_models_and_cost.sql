-- Video generation cost estimates, used to size credit reservations before
-- the real cost (usage.cost, only known after the async job completes) is
-- settled. Mirrors the existing image_cost column on ai_models.
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS video_cost_estimate bigint;

INSERT INTO ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES
  ('openrouter', 'google/veo-3', 320000, 25, true),
  ('openrouter', 'minimax/video-01', 60000, 25, true),
  ('openrouter', 'luma/ray-2-720p', 180000, 25, true),
  ('openrouter', 'wan-ai/wan-2.1-t2v-turbo', 30000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET video_cost_estimate = EXCLUDED.video_cost_estimate;
