-- RIFE is a timeline interpolation tool. Its price is per COMPUTE second,
-- not per second of output video. 15,600 millicredits is a 120 s reservation
-- before markup ($0.156), not a fixed charge. Existing models are unchanged.
INSERT INTO public.ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES ('fal', 'fal-ai/rife', 15600, 25, true)
ON CONFLICT (provider, model_id) DO NOTHING;

-- RIFE calls bind their provider job and immutable pricing snapshot here.
-- Existing SELECT-only reservation RLS means clients cannot change this data.
ALTER TABLE public.credit_reservations ADD COLUMN IF NOT EXISTS provider_job jsonb;

-- Serialize retries/double polls before using the existing payer-aware settlement.
-- Only the authenticated Edge Function's service role may call this RPC.
CREATE OR REPLACE FUNCTION public.settle_rife_reservation(
  p_reservation_id uuid,
  p_inference_seconds double precision
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_row public.credit_reservations%ROWTYPE;
  v_rate numeric;
  v_markup numeric;
  v_measured bigint;
  v_charged bigint;
  v_metadata jsonb;
BEGIN
  SELECT * INTO v_row FROM public.credit_reservations
  WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_row.provider_job->>'model_id' IS DISTINCT FROM 'fal-ai/rife' THEN
    RAISE EXCEPTION 'rife_reservation_not_found';
  END IF;
  IF v_row.status = 'settled' THEN
    RETURN v_row.provider_job->'billing';
  END IF;
  IF v_row.status != 'pending' THEN RAISE EXCEPTION 'reservation_not_pending'; END IF;
  IF p_inference_seconds IS NULL OR p_inference_seconds < 0
     OR p_inference_seconds::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'invalid_inference_seconds';
  END IF;
  v_rate := (v_row.provider_job->>'compute_second_rate_usd')::numeric;
  v_markup := (v_row.provider_job->>'markup_pct')::numeric;
  IF v_rate IS NULL OR v_rate <= 0 OR v_markup IS NULL OR v_markup < 0 THEN
    RAISE EXCEPTION 'invalid_rife_pricing_snapshot';
  END IF;
  v_measured := ceil(p_inference_seconds::numeric * v_rate * 100000 * (1 + v_markup / 100));
  v_charged := least(v_measured, v_row.amount);
  v_metadata := jsonb_build_object(
    'provider', 'fal', 'model_id', 'fal-ai/rife',
    'job_id', v_row.provider_job->>'job_id',
    'pricing_unit', 'compute_second', 'inference_seconds', p_inference_seconds,
    'compute_second_rate_usd', v_rate, 'markup_pct', v_markup,
    'reserved_amount', v_row.amount, 'measured_amount', v_measured,
    'charged_amount', v_charged, 'platform_overrun', greatest(0, v_measured - v_row.amount)
  );
  PERFORM public.settle_reservation_for_user(p_reservation_id, v_charged, v_metadata);
  UPDATE public.credit_reservations
  SET provider_job = provider_job || jsonb_build_object('billing', v_metadata)
  WHERE id = p_reservation_id;
  RETURN v_metadata;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_rife_reservation(uuid, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_rife_reservation(uuid, double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.release_rife_reservation(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_row public.credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_row.provider_job->>'model_id' IS DISTINCT FROM 'fal-ai/rife' THEN
    RAISE EXCEPTION 'rife_reservation_not_found';
  END IF;
  IF v_row.status = 'pending' THEN
    PERFORM public.release_reservation_for_user(p_reservation_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.release_rife_reservation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rife_reservation(uuid) TO service_role;
