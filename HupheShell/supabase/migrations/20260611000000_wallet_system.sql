-- 1. wallets (snelle cache voor saldo)
CREATE TABLE wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  balance bigint NOT NULL DEFAULT 0
);

-- 2. transactions (immutable ledger)
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users,
  amount bigint NOT NULL,
  type text NOT NULL CHECK (type IN ('topup', 'reservation', 'settle', 'release', 'refund', 'admin', 'dispute')),
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. stripe_customers
CREATE TABLE stripe_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  stripe_customer_id text UNIQUE NOT NULL
);

-- 4. stripe_events (idempotentie)
CREATE TABLE stripe_events (
  stripe_event_id text PRIMARY KEY,
  processed_at timestamptz DEFAULT now()
);

-- 5. ai_models
CREATE TABLE ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_id text NOT NULL,
  input_cost_per_1k bigint,
  output_cost_per_1k bigint,
  image_cost bigint,
  markup_pct integer NOT NULL DEFAULT 25,
  active boolean NOT NULL DEFAULT true,
  price_version integer NOT NULL DEFAULT 1,
  UNIQUE(provider, model_id)
);

-- 6. credit_reservations
CREATE TABLE credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users,
  amount bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'released')),
  created_at timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen wallet lezen" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigen transacties lezen" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigen reserveringen lezen" ON credit_reservations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigen stripe koppeling lezen" ON stripe_customers FOR SELECT USING (auth.uid() = user_id);
-- Schrijven (INSERT/UPDATE) uitsluitend via service role (Edge Functions)
