INSERT INTO ai_models (provider, model_id, audio_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'sonilo/v1.1/text-to-music', 22500, 25, true),
  ('fal', 'sonilo/v1.1/video-to-music', 13500, 25, true),
  ('fal', 'sonilo/v1.1/text-to-sound-effects', 1440, 25, true),
  ('fal', 'sonilo/v1.1/video-to-sound-effects', 13500, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET audio_cost_estimate = EXCLUDED.audio_cost_estimate, active = true;
