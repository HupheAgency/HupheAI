-- Rate limiting: check max requests per minute per user
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_max_rpm integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM transactions
  WHERE user_id = p_user_id
    AND created_at >= now() - interval '1 minute'
    AND type IN ('reservation', 'debit');
  RETURN v_count < p_max_rpm;
END;
$$;

-- Billing-aware reserve: bills company wallet when user is a company member,
-- otherwise falls back to personal wallet.
CREATE OR REPLACE FUNCTION reserve_credits_for_user(
  p_user_id uuid,
  p_amount bigint,
  p_expires_minutes integer DEFAULT 5
) RETURNS TABLE(reservation_id uuid) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id uuid;
  v_reservation_id uuid;
  new_balance bigint;
BEGIN
  -- Check if user belongs to a company with active billing
  SELECT cm.company_id INTO v_company_id
  FROM company_members cm
  JOIN companies c ON c.id = cm.company_id
  WHERE cm.user_id = p_user_id
    AND c.billing_active = true
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    -- Bill company wallet
    UPDATE wallets
    SET balance = balance - p_amount
    WHERE user_id = (SELECT owner_id FROM companies WHERE id = v_company_id)
      AND balance >= p_amount
    RETURNING balance INTO new_balance;
  END IF;

  IF new_balance IS NULL THEN
    -- Bill personal wallet
    UPDATE wallets
    SET balance = balance - p_amount
    WHERE user_id = p_user_id AND balance >= p_amount
    RETURNING balance INTO new_balance;
  END IF;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO credit_reservations (user_id, amount, expires_at, status)
  VALUES (p_user_id, p_amount, now() + (p_expires_minutes || ' minutes')::interval, 'pending')
  RETURNING id INTO v_reservation_id;

  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, 'reservation', 'Gereserveerd voor generatie');

  RETURN QUERY SELECT v_reservation_id;
END;
$$;

-- Settle a reservation (same as settle_reservation, for consistency)
CREATE OR REPLACE FUNCTION settle_reservation_for_user(
  p_reservation_id uuid,
  p_actual_amount bigint,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN settle_reservation(p_reservation_id, p_actual_amount, p_metadata);
END;
$$;

-- Release a reservation (same as release_reservation, for consistency)
CREATE OR REPLACE FUNCTION release_reservation_for_user(
  p_reservation_id uuid
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN release_reservation(p_reservation_id);
END;
$$;
