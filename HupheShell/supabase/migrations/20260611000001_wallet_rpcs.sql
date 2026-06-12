-- 2a. credit_wallet
CREATE OR REPLACE FUNCTION credit_wallet(
  p_user_id uuid,
  p_amount bigint,
  p_type text,
  p_description text,
  p_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  new_balance bigint;
BEGIN
  INSERT INTO wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + p_amount
  RETURNING balance INTO new_balance;

  INSERT INTO transactions (user_id, amount, type, description, metadata)
  VALUES (p_user_id, p_amount, p_type, p_description, p_metadata);

  RETURN new_balance;
END;
$$;

-- 2b. debit_wallet
CREATE OR REPLACE FUNCTION debit_wallet(
  p_user_id uuid,
  p_amount bigint,
  p_type text,
  p_description text,
  p_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  new_balance bigint;
BEGIN
  UPDATE wallets
  SET balance = balance - p_amount
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO transactions (user_id, amount, type, description, metadata)
  VALUES (p_user_id, -p_amount, p_type, p_description, p_metadata);

  RETURN new_balance;
END;
$$;

-- 2c. reserve_credits
CREATE OR REPLACE FUNCTION reserve_credits(
  p_user_id uuid,
  p_amount bigint,
  p_expires_minutes integer DEFAULT 5
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_reservation_id uuid;
  new_balance bigint;
BEGIN
  -- Debit wallet atomair
  UPDATE wallets
  SET balance = balance - p_amount
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO credit_reservations (user_id, amount, expires_at, status)
  VALUES (p_user_id, p_amount, now() + (p_expires_minutes || ' minutes')::interval, 'pending')
  RETURNING id INTO v_reservation_id;

  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, 'reservation', 'Gereserveerd voor generatie');

  RETURN v_reservation_id;
END;
$$;

-- 2d. settle_reservation
CREATE OR REPLACE FUNCTION settle_reservation(
  p_reservation_id uuid,
  p_actual_amount bigint,
  p_metadata jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_user_id uuid;
  v_reserved_amount bigint;
  v_status text;
  v_refund bigint;
BEGIN
  SELECT user_id, amount, status INTO v_user_id, v_reserved_amount, v_status
  FROM credit_reservations WHERE id = p_reservation_id;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'reservation_not_pending';
  END IF;

  UPDATE credit_reservations SET status = 'settled' WHERE id = p_reservation_id;

  v_refund := v_reserved_amount - p_actual_amount;
  
  IF v_refund > 0 THEN
    UPDATE wallets SET balance = balance + v_refund WHERE user_id = v_user_id;
    INSERT INTO transactions (user_id, amount, type, description, metadata)
    VALUES (v_user_id, v_refund, 'settle', 'Overschot reservering teruggeboekt', p_metadata);
  END IF;

  RETURN v_refund;
END;
$$;

-- 2e. release_reservation
CREATE OR REPLACE FUNCTION release_reservation(
  p_reservation_id uuid
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_user_id uuid;
  v_reserved_amount bigint;
  v_status text;
BEGIN
  SELECT user_id, amount, status INTO v_user_id, v_reserved_amount, v_status
  FROM credit_reservations WHERE id = p_reservation_id;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'reservation_not_pending';
  END IF;

  UPDATE credit_reservations SET status = 'released' WHERE id = p_reservation_id;

  UPDATE wallets SET balance = balance + v_reserved_amount WHERE user_id = v_user_id;
  INSERT INTO transactions (user_id, amount, type, description)
  VALUES (v_user_id, v_reserved_amount, 'release', 'Reservering vrijgegeven na mislukte generatie');

  RETURN v_reserved_amount;
END;
$$;

-- 2f. cleanup_expired_reservations
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN 
    SELECT id, user_id, amount FROM credit_reservations 
    WHERE status = 'pending' AND expires_at < now()
  LOOP
    UPDATE credit_reservations SET status = 'released' WHERE id = r.id;
    UPDATE wallets SET balance = balance + r.amount WHERE user_id = r.user_id;
    INSERT INTO transactions (user_id, amount, type, description)
    VALUES (r.user_id, r.amount, 'release', 'Verlopen reservering vrijgegeven');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
