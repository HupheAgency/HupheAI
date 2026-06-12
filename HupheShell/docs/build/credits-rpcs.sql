-- 1. Haal wallet-status op (balance + bedrijfsnaam als lid)
CREATE OR REPLACE FUNCTION get_wallet(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  w wallets%ROWTYPE;
  co company_accounts%ROWTYPE;
  cm company_members%ROWTYPE;
BEGIN
  SELECT * INTO w FROM wallets WHERE user_id = p_user_id;
  SELECT cm.* INTO cm FROM company_members cm WHERE cm.user_id = p_user_id LIMIT 1;
  IF cm.company_id IS NOT NULL THEN
    SELECT * INTO co FROM company_accounts WHERE id = cm.company_id;
  END IF;
  RETURN jsonb_build_object(
    'personal_balance', COALESCE(w.personal_balance, 0),
    'company_balance',  COALESCE(w.company_balance, 0),
    'company_name',     co.name,
    'company_monthly_budget', co.monthly_budget_cents,
    'company_period_spent', co.current_period_spent_cents
  );
END;
$$;

-- 2. Trek credits af voor een generatie (company eerst, dan personal)
--    Geeft { ok, error } terug
CREATE OR REPLACE FUNCTION deduct_credits(p_amount_cents integer, p_description text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  w wallets%ROWTYPE;
  co company_accounts%ROWTYPE;
  cm company_members%ROWTYPE;
  deduct_company integer := 0;
  deduct_personal integer := 0;
BEGIN
  SELECT * INTO w FROM wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN '{"ok":false,"error":"Wallet niet gevonden"}'::jsonb;
  END IF;
  -- Controleer company-budget eerst
  SELECT cm.* INTO cm FROM company_members cm WHERE cm.user_id = auth.uid() LIMIT 1;
  IF cm.company_id IS NOT NULL THEN
    SELECT * INTO co FROM company_accounts WHERE id = cm.company_id FOR UPDATE;
    deduct_company := LEAST(w.company_balance, p_amount_cents);
  END IF;
  deduct_personal := p_amount_cents - deduct_company;
  -- Check saldo
  IF deduct_personal > w.personal_balance THEN
    RETURN '{"ok":false,"error":"Onvoldoende credits"}'::jsonb;
  END IF;
  -- Verwerk
  UPDATE wallets SET
    company_balance  = company_balance  - deduct_company,
    personal_balance = personal_balance - deduct_personal,
    updated_at = now()
  WHERE user_id = auth.uid();
  IF deduct_company > 0 THEN
    UPDATE company_accounts SET
      current_period_spent_cents = current_period_spent_cents + deduct_company,
      updated_at = now()
    WHERE id = cm.company_id;
  END IF;
  INSERT INTO wallet_transactions(user_id, type, amount_cents, description)
  VALUES (auth.uid(), 'usage', p_amount_cents, p_description);
  RETURN '{"ok":true}'::jsonb;
END;
$$;

-- 3. Admin: lees huidige platform-fee
CREATE OR REPLACE FUNCTION get_credit_config()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r credit_config%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO r FROM credit_config LIMIT 1;
  RETURN jsonb_build_object('platform_fee_pct', r.platform_fee_pct, 'updated_at', r.updated_at);
END;
$$;

-- 4. Admin: sla nieuwe platform-fee op
CREATE OR REPLACE FUNCTION set_credit_config(p_fee_pct numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_fee_pct < 0 OR p_fee_pct > 100 THEN RAISE EXCEPTION 'Ongeldige fee'; END IF;
  UPDATE credit_config SET platform_fee_pct = p_fee_pct, updated_at = now();
  RETURN '{"ok":true}'::jsonb;
END;
$$;
