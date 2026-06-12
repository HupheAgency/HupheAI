-- Platforminstelling: hoeveel % gaat naar de platform-eigenaar bij elke storting
CREATE TABLE credit_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_fee_pct  numeric(5,2) NOT NULL DEFAULT 0,  -- 0.00 t/m 100.00
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Seed de eerste rij (0% fee, later via admin aanpasbaar)
INSERT INTO credit_config (platform_fee_pct) VALUES (0);

-- Wallet per gebruiker: balans in centen (EUR × 100)
-- personal_balance = eigen storting minus fee minus verbruik
-- company_balance  = tegoed van het bedrijf, door bedrijfsadmin bijgevuld
CREATE TABLE wallets (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  personal_balance  integer NOT NULL DEFAULT 0 CHECK (personal_balance >= 0),
  company_balance   integer NOT NULL DEFAULT 0 CHECK (company_balance >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Alle credit-bewegingen (debit én credit)
-- type: 'topup' | 'fee' | 'usage' | 'company_allocation' | 'company_topup' | 'refund'
-- amount: altijd positief; richting volgt uit type + sign-conventie in de app
-- balance_after: snapshot van personal_balance + company_balance na deze transactie
CREATE TABLE wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL,
  amount_cents    integer NOT NULL,
  description     text,
  stripe_session_id text,
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Bedrijfsaccount: één bedrijf kan meerdere gebruikers hebben
CREATE TABLE company_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  owner_id              uuid NOT NULL REFERENCES auth.users(id),
  monthly_budget_cents  integer NOT NULL DEFAULT 0,   -- maandbudget in centen
  current_period_start  date NOT NULL DEFAULT date_trunc('month', now())::date,
  current_period_spent_cents integer NOT NULL DEFAULT 0,
  stripe_customer_id    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Koppeltabel gebruiker ↔ bedrijf
-- role: 'admin' | 'member'
CREATE TABLE company_members (
  company_id  uuid NOT NULL REFERENCES company_accounts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  PRIMARY KEY (company_id, user_id)
);

-- Index voor snelle lookups
CREATE INDEX ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX ON company_members(user_id);

ALTER TABLE credit_config ENABLE ROW LEVEL SECURITY;
-- Alleen admins mogen credit_config lezen en aanpassen
CREATE POLICY "admin_read_credit_config"   ON credit_config FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_update_credit_config" ON credit_config FOR UPDATE USING (public.is_admin());

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
-- Gebruiker ziet alleen eigen wallet
CREATE POLICY "own_wallet"         ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_wallet_update"  ON wallets FOR UPDATE USING (auth.uid() = user_id);
-- Edge Function / service role mag wallets aanmaken en bijwerken (via service key)

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_transactions" ON wallet_transactions FOR SELECT USING (auth.uid() = user_id);
-- Inserts verlopen via Edge Function (service role) — geen INSERT-policy voor users nodig

ALTER TABLE company_accounts ENABLE ROW LEVEL SECURITY;
-- Owner en admins zien het bedrijf
CREATE POLICY "company_owner_select" ON company_accounts FOR SELECT
  USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM company_members WHERE company_id = id AND user_id = auth.uid()
  ));
CREATE POLICY "company_owner_update" ON company_accounts FOR UPDATE USING (owner_id = auth.uid());

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_members_select" ON company_members FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'
  ));
