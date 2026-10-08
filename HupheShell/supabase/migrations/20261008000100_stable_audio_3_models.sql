-- Stable Audio 3 (fal.ai) als extra keuzes naast de bestaande ACE-Step-modellen in de
-- Audio-modus. Gebruikt dezelfde audio_cost_estimate-kolom, geen schema-wijziging nodig.
--
-- Prijs/seconde is een afgeleide aanname (fal toont alleen een vlak "$X per audio" bij
-- de default-duration, zonder duration-disclaimer) -- zelfde risico-aanpak als eerder bij
-- ACE-Step-outpaint. De 4 "medium"-varianten zijn hetzelfde 1,4B-parameter model, dus
-- delen één afgeleid tarief: $0,0376 / 30s = $0,0012533/s. Small SFX is een apart (459M)
-- model: $0,0206 / 30s = $0,0006867/s.
--
-- audio_cost_estimate = 30s (default duration) * rate/s * 100.000 millicredits/USD:
--   medium: 30 * 0.0012533 * 100000 = 3760
--   small sfx: 30 * 0.0006867 * 100000 = 2060
INSERT INTO ai_models (provider, model_id, audio_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'fal-ai/stable-audio-3/medium/text-to-audio', 3760, 25, true),
  ('fal', 'fal-ai/stable-audio-3/medium/audio-to-audio', 3760, 25, true),
  ('fal', 'fal-ai/stable-audio-3/medium/audio-outpainting', 3760, 25, true),
  ('fal', 'fal-ai/stable-audio-3/medium/audio-inpainting', 3760, 25, true),
  ('fal', 'fal-ai/stable-audio-3/small/sfx/text-to-audio', 2060, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET audio_cost_estimate = EXCLUDED.audio_cost_estimate, active = true;
