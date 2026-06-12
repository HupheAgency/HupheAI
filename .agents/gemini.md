# Gemini — Voorbereidingstaken: Betalingssysteem HupheAI

Je werkt aan het HupheAI project. De root is `/Users/tom.zwarts/HupheAI/HupheShell`.
Claude pakt het kritieke koppelwerk op. Jouw rol is het volledige voorwerk zodat Claude direct kan beginnen zonder boilerplate te schrijven.

Lees voor context eerst:
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/Betalingsverkeer.md` — volledige architectuurbeschrijving
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/build/stripe-webhook.ts` — bestaande draft (heeft bugs, niet aanpassen)
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/build/atelier-ai-proxy.ts` — bestaande proxy draft (context)

---

## Taak 1 — Database Migratie

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/migrations/20260611000000_wallet_system.sql`

Inhoud: alle tabellen en constraints voor het wallet-systeem. Gebruik **`bigint` voor alle geldbedragen** (millicredits, nooit float). Geen CASCADE deletes op users.

```sql
-- Exacte tabellen die nodig zijn:

-- 1. wallets (snelle cache voor saldo)
--    kolommen: user_id uuid PK FK auth.users, balance bigint NOT NULL DEFAULT 0

-- 2. transactions (immutable ledger — nooit aanpassen, alleen INSERT)
--    kolommen: id uuid PK DEFAULT gen_random_uuid(), user_id uuid FK auth.users,
--              amount bigint NOT NULL (positief = bijschrijving, negatief = afschrijving),
--              type text NOT NULL (CHECK: 'topup','reservation','settle','release','refund','admin','dispute'),
--              description text, metadata jsonb, created_at timestamptz DEFAULT now()

-- 3. stripe_customers (één-op-één koppeling Supabase user ↔ Stripe customer)
--    kolommen: user_id uuid PK FK auth.users, stripe_customer_id text UNIQUE NOT NULL

-- 4. stripe_events (idempotentie — PRIMARY KEY afdwingen op database niveau)
--    kolommen: stripe_event_id text PRIMARY KEY, processed_at timestamptz DEFAULT now()

-- 5. ai_models (prijstabel — niet hardcoded in Edge Functions)
--    kolommen: id uuid PK, provider text NOT NULL, model_id text NOT NULL,
--              input_cost_per_1k bigint (millicredits), output_cost_per_1k bigint (millicredits),
--              image_cost bigint (millicredits per generatie),
--              markup_pct integer NOT NULL DEFAULT 20,
--              active boolean NOT NULL DEFAULT true,
--              price_version integer NOT NULL DEFAULT 1,
--              UNIQUE(provider, model_id)

-- 6. credit_reservations (voor reserve/settle patroon — verlopen reserveringen opruimen)
--    kolommen: id uuid PK DEFAULT gen_random_uuid(), user_id uuid FK auth.users,
--              amount bigint NOT NULL, expires_at timestamptz NOT NULL,
--              status text NOT NULL DEFAULT 'pending' (CHECK: 'pending','settled','released'),
--              created_at timestamptz DEFAULT now()
```

Voeg ook RLS toe aan het einde van de migratie:

```sql
ALTER TABLE wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers    ENABLE ROW LEVEL SECURITY;

-- Gebruikers mogen alleen hun eigen data LEZEN
-- Schrijven (INSERT/UPDATE) uitsluitend via service role (Edge Functions)
-- Schrijf de juiste USING-clauses met auth.uid() = user_id
```

---

## Taak 2 — Postgres RPC Functies

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/migrations/20260611000001_wallet_rpcs.sql`

Schrijf de volgende Postgres-functies in PL/pgSQL. Elke functie die wallets muteert, **schrijft tegelijk een ledgerregel in transactions** in dezelfde transactie.

### 2a. `credit_wallet` — saldo bijschrijven (gebruikt door stripe-webhook)
Parameters: `p_user_id uuid, p_amount bigint, p_type text, p_description text, p_metadata jsonb`
- Upsert `wallets` (INSERT of UPDATE balance += p_amount)
- INSERT in `transactions` met positief bedrag
- Return: nieuwe `balance`

### 2b. `debit_wallet` — atomair afschrijven (gebruikt door AI-proxies)
Parameters: `p_user_id uuid, p_amount bigint, p_type text, p_description text, p_metadata jsonb`
- `UPDATE wallets SET balance = balance - p_amount WHERE user_id = p_user_id AND balance >= p_amount RETURNING balance`
- Als geen rijen: RAISE EXCEPTION 'insufficient_balance'
- INSERT in `transactions` met negatief bedrag
- Return: nieuwe `balance`

### 2c. `reserve_credits` — reserveer credits vóór een AI-call
Parameters: `p_user_id uuid, p_amount bigint, p_expires_minutes integer DEFAULT 5`
- Debit wallet atomair (zelfde logica als debit_wallet)
- INSERT in `credit_reservations` met status 'pending' en `expires_at = now() + interval`
- INSERT in `transactions` met type 'reservation'
- Return: `reservation_id uuid`

### 2d. `settle_reservation` — definitieve afschrijving na succesvolle AI-call
Parameters: `p_reservation_id uuid, p_actual_amount bigint, p_metadata jsonb`
- UPDATE `credit_reservations` SET status = 'settled'
- Bereken verschil: gereserveerd - werkelijk verbruik
- Als verschil > 0: credit het verschil terug naar wallet + ledgerregel type 'settle'
- Return: `refunded_amount bigint`

### 2e. `release_reservation` — vrijgeven bij mislukte AI-call
Parameters: `p_reservation_id uuid`
- SELECT gereserveerd bedrag uit `credit_reservations`
- UPDATE status = 'released'
- Credit het volledige bedrag terug naar wallet + ledgerregel type 'release'
- Return: `released_amount bigint`

### 2f. `cleanup_expired_reservations` — weeskinderen opruimen
- UPDATE `credit_reservations` SET status = 'released' WHERE status = 'pending' AND expires_at < now()
- Voor elke vrijgegeven reservering: credit terug naar wallet + ledgerregel type 'release'
- Return: `count integer` (aantal opgeruimde reserveringen)

---

## Taak 3 — Seed Data voor ai_models

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/migrations/20260611000002_ai_models_seed.sql`

Vul de `ai_models` tabel met actuele modellen die de app gebruikt. Kijk in `/Users/tom.zwarts/HupheAI/HupheShell/src/main/engine-ipc.ts` en `/Users/tom.zwarts/HupheAI/HupheShell/src/main/lib/` om te zien welke modellen er daadwerkelijk gebruikt worden.

Gebruik deze richtlijnen voor kostprijzen (in millicredits, 1 euro = 100.000 millicredits, koers USD/EUR ≈ 0.92):
- OpenRouter modellen: gebruik de actuele input/output prijs per 1K tokens
- Fal.ai beeldgeneratie: vaste kosten per generatie
- Sla markup_pct op als 25 (25% marge)

---

## Taak 4 — TypeScript Types

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/functions/_shared/types.ts`

Exporteer de volgende TypeScript interfaces die alle Edge Functions gebruiken:

```typescript
// Wallet RPCs response types
export interface WalletCreditResult { balance: bigint }
export interface WalletDebitResult  { balance: bigint }
export interface ReserveResult      { reservation_id: string }
export interface SettleResult       { refunded_amount: bigint }
export interface ReleaseResult      { released_amount: bigint }

// AI model uit de database
export interface AiModel {
  id: string
  provider: 'openrouter' | 'fal'
  model_id: string
  input_cost_per_1k: number
  output_cost_per_1k: number
  image_cost: number
  markup_pct: number
  active: boolean
  price_version: number
}

// Standaard Edge Function error response
export interface EdgeError {
  error: string
  code?: 'insufficient_balance' | 'unauthorized' | 'model_not_found' | 'upstream_error'
}

// OpenRouter usage (uit API-respons)
export interface OpenRouterUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// Fal.ai job respons (vereenvoudigd)
export interface FalResult {
  images?: Array<{ url: string }>
  timings?: { inference: number }
}
```

---

## Taak 5 — Gedeeld auth-hulpmiddel

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/functions/_shared/auth.ts`

Schrijf een hulpfunctie die JWT-validatie doet en de `user_id` teruggeeft. Claude gebruikt dit in elke Edge Function.

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Geeft user_id terug of gooit een fout
export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header', 401)
  }

  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new AuthError('Invalid or expired token', 401)

  return user.id
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}
```

---

## Taak 6 — CORS hulpfunctie + json helper

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/functions/_shared/response.ts`

```typescript
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export function handleOptions() {
  return new Response('ok', { headers: CORS_HEADERS })
}
```

---

## Taak 7 — Scaffold `create-stripe-checkout`

Maak het bestand:
`/Users/tom.zwarts/HupheAI/HupheShell/supabase/functions/create-stripe-checkout/index.ts`

Schrijf de complete Edge Function met:
- CORS preflight afhandeling
- JWT-auth via `requireUserId` uit `_shared/auth.ts`
- Stripe import via `https://esm.sh/stripe@14?target=deno`
- Check in `stripe_customers` of de user al een `stripe_customer_id` heeft
- Zo niet: maak een nieuwe Stripe Customer aan, sla op in `stripe_customers`
- Maak een Stripe Checkout Session aan met:
  - `customer` (stripe_customer_id)
  - `client_reference_id` = user_id
  - `metadata.user_id` = user_id
  - `mode: 'payment'`
  - `line_items` met de geselecteerde creditpakket (uit request body: `package_id`)
  - `success_url` en `cancel_url` uit env of een vaste placeholder
- Return: `{ checkout_url: string }`

Laad ook een `packages` array hardcoded (Claude verfijnt dit later naar een DB-tabel):
```typescript
const PACKAGES = [
  { id: 'starter',  euros: 5,  millicredits: 500_000,  label: '500 credits' },
  { id: 'standard', euros: 10, millicredits: 1_100_000, label: '1100 credits (+10% bonus)' },
  { id: 'pro',      euros: 25, millicredits: 3_000_000, label: '3000 credits (+20% bonus)' },
]
```

Gebruik de service role client voor database-operaties, de anon client voor JWT-validatie.

---

## Wat je NIET doet

- Geen aanpassingen aan `docs/build/stripe-webhook.ts` — dat is Claude's werk (te veel kritieke bugs)
- Geen aanpassingen aan bestaande Electron app bestanden
- Geen `proxy-openrouter` of `proxy-fal-ai` Edge Functions schrijven — die vereisen het reserve/settle-patroon, dat doet Claude
- Geen aanpassingen aan bestaande migraties

## Volgorde van uitvoering

1. Taak 4, 5, 6 eerst (shared types en helpers) — Claude heeft deze nodig
2. Taak 1 (migratie schema)
3. Taak 2 (RPCs)
4. Taak 3 (seed data) — zoek eerst welke modellen er echt gebruikt worden
5. Taak 7 (create-stripe-checkout scaffold)

Rapporteer na elke taak welke bestanden je hebt aangemaakt en of er iets ontbrak in de specificatie.
