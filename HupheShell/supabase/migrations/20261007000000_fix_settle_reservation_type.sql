-- Migratie 20260616110619_wallet_rpcs_correct_schema herschreef settle_reservation_for_user
-- en gebruikte daarbij per ongeluk type 'usage' in plaats van 'settle' voor de transactie-insert.
-- De transactions_type_check constraint staat alleen 'settle' toe (nooit 'usage'), waardoor
-- elke settle-aanroep sindsdien altijd faalde met een check-constraint-violatie. Omdat geen
-- van de 5 call sites de RPC-error checkt, werd dit stil ingeslikt: reserveringen bleven
-- voor altijd 'pending' (en verliepen later vanzelf naar 'released'), en voor video specifiek
-- faalde de content-download altijd (die vereist status='settled').
CREATE OR REPLACE FUNCTION public.settle_reservation_for_user(p_reservation_id uuid, p_actual_amount bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id     uuid;
  v_reserved    bigint;
  v_status      text;
  v_company_id  uuid;
  v_refund      bigint;
BEGIN
  SELECT user_id, amount, status, company_id
  INTO v_user_id, v_reserved, v_status, v_company_id
  FROM credit_reservations WHERE id = p_reservation_id;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'reservation_not_pending';
  END IF;

  UPDATE credit_reservations SET status = 'settled' WHERE id = p_reservation_id;

  v_refund := v_reserved - LEAST(p_actual_amount, v_reserved);

  IF v_refund > 0 THEN
    IF v_company_id IS NOT NULL THEN
      UPDATE public.wallets SET company_balance = company_balance + v_refund, updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.wallets SET personal_balance = personal_balance + v_refund, updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
  END IF;

  INSERT INTO transactions (user_id, amount, type, description, metadata)
  VALUES (v_user_id, -LEAST(p_actual_amount, v_reserved), 'settle', 'AI generatie', p_metadata);

  RETURN v_refund;
END;
$function$;
