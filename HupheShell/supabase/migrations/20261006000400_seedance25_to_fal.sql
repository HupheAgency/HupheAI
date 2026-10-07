-- OpenRouter koppelt model_id 'bytedance/seedance-2.5' aan de "Dreamina"-variant,
-- die slechts 480p/720p ondersteunt. fal.ai host apart de US-hosted variant van
-- hetzelfde model (bytedance/seedance-2.5/us/*), die ook 1080p ondersteunt. Deze
-- migratie zet de routing voor dit ene model om naar fal.ai (proxy-fal-video);
-- de 4 overige actieve videomodellen blijven ongewijzigd via OpenRouter lopen.
--
-- video_cost_estimate is de nieuwe 5s/720p-baseline (fallback-schatting als de
-- live pricing_skus-parse ooit faalt): 5s * $0.5676/s * 100.000 millicredits/USD.
UPDATE ai_models
SET provider = 'fal', video_cost_estimate = 283800
WHERE provider = 'openrouter' AND model_id = 'bytedance/seedance-2.5';
