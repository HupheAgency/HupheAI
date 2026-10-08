-- Audio generation cost estimates, zelfde rol als video_cost_estimate: sizing van de
-- credit-reservering vóór de echte (deterministische) kostprijs bekend is. fal.ai's
-- ACE-Step-familie rekent op alle 3 endpoints een vlak tarief van $0.0002 per seconde
-- gegenereerde audio (bevestigd via fal.ai's eigen model-pagina's) -- geen resolutie-
-- staffel zoals bij video, dus één vlakke baseline voor alle drie.
--
-- audio_cost_estimate: 60s (fal's eigen default-duur voor het basismodel) * $0.0002/s
-- * 100.000 millicredits/USD = 1200.
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS audio_cost_estimate bigint;

INSERT INTO ai_models (provider, model_id, audio_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'fal-ai/ace-step', 1200, 25, true),
  ('fal', 'fal-ai/ace-step/audio-to-audio', 1200, 25, true),
  ('fal', 'fal-ai/ace-step/audio-outpaint', 1200, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET audio_cost_estimate = EXCLUDED.audio_cost_estimate, active = true;
