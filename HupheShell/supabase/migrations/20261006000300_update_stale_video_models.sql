-- OpenRouter heeft deze video-modellen hernoemd/vervangen sinds ze werden toegevoegd;
-- de oude model_id's bestaan niet meer in hun /videos/models-lijst, dus elke submit
-- met deze modellen faalt vandaag met een upstream-fout. video_cost_estimate hieronder
-- is alleen de fallback-schatting voor een 5s-clip (pre-markup, millicredits) -- de
-- live pricing_skus van OpenRouter zijn leidend zolang die beschikbaar zijn.

-- google/veo-3 -> google/veo-3.1 ($0.40/s met audio, basis-resolutie incl. 1080p; 4K duurder)
UPDATE ai_models
SET model_id = 'google/veo-3.1', video_cost_estimate = 200000
WHERE provider = 'openrouter' AND model_id = 'google/veo-3';

-- minimax/video-01 -> minimax/hailuo-3 ($0.13/s, enige resolutie is 2K)
UPDATE ai_models
SET model_id = 'minimax/hailuo-3', video_cost_estimate = 65000
WHERE provider = 'openrouter' AND model_id = 'minimax/video-01';

-- wan-ai/wan-2.1-t2v-turbo -> alibaba/wan-3.0 ($0.05/s op 480p, de goedkoopste/eerste tier)
UPDATE ai_models
SET model_id = 'alibaba/wan-3.0', video_cost_estimate = 25000
WHERE provider = 'openrouter' AND model_id = 'wan-ai/wan-2.1-t2v-turbo';

-- luma/ray-2-720p is volledig uit OpenRouter's catalogus verdwenen, geen directe vervanger
UPDATE ai_models
SET active = false
WHERE provider = 'openrouter' AND model_id = 'luma/ray-2-720p';
