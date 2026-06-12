# Architectuur: Betalingsverkeer & AI Wederverkoop

Dit document beschrijft de huidige architectuur rondom AI-diensten en wat er nodig is om succesvol en **veilig** credits te verkopen aan eindgebruikers, waarbij zij jouw (Admin) API-sleutels gebruiken via een "Wallet" systeem.

> **Status:** v4 — implementatie in uitvoering. Gebouwd door Claude + Gemini. Zie sectie 5 voor voortgang.

---

## 1. De Huidige Situatie (Bring Your Own Key)

Op dit moment functioneert HupheAI als een lokale Electron-app met een **"Bring Your Own Key" (BYOK)** of lokaal beheerde architectuur.

**Wat er nu gebeurt:**
- De API-sleutels voor OpenRouter, Fal.ai en Stripe worden lokaal opgeslagen in de Electron app (via `safeStorage` of `.env`).
- De app (het "Main" proces) roept OpenRouter en Fal.ai direct vanaf de computer van de gebruiker aan.
- Stripe betalingen (`credits:checkout`) worden lokaal in de app gestart.

**Waarom dit niet werkt voor "Wederverkoop":**
Als je deze app precies zo aan jouw gebruikers zou geven, met **jouw** API-sleutels erin gebakken, ontstaat er een enorm veiligheidsrisico. Een technische gebruiker kan de app "uitpakken", jouw OpenRouter- en Stripe-sleutels stelen, en gratis onbeperkt AI-generaties uitvoeren op jouw kosten. Ook kan een lokale app nooit betrouwbaar eigen credits afschrijven, omdat een gebruiker de code kan aanpassen om de afschrijving simpelweg over te slaan.

---

## 2. De Gewenste Architectuur (Server-side Wallet)

Om veilig credits te verkopen en gebruikers via jouw accounts te laten genereren, moeten we de **sleutels en de logica verplaatsen naar een beveiligde server**. Aangezien we Supabase al gebruiken, is de beste en goedkoopste manier om **Supabase Edge Functions** in te zetten.

```
Electron App
→ Supabase Auth login
→ invoke Edge Function met Authorization: Bearer <JWT>

create-checkout
→ valideert JWT
→ maakt Stripe Checkout Session
→ zet user_id in metadata/client_reference_id
→ returnt checkout URL

stripe-webhook
→ gebruikt raw body (vóór JSON-parsing)
→ verifieert Stripe-Signature
→ checkt unieke stripe_event_id via database constraint
→ verwerkt alleen relevante events
→ schrijft wallet bij via ledger/RPC

generate-ai
→ valideert JWT
→ checkt model allowlist
→ reserveert max credits atomair (vóór externe API-call)
→ doet AI-call met server-side secret
→ settle of release credits
→ schrijft generation log (in dezelfde transactie)
→ returnt resultaat aan Electron app
```

### A. Betalen & Wallet Opwaarderen (Stripe Webhooks)
1. **Checkout starten:** De gebruiker klikt op "Opwaarderen". De app roept een Edge Function (`create-checkout`) aan die veilig een Stripe Checkout Session aanmaakt. De `user_id` wordt meegegeven als `metadata.user_id` én als `client_reference_id`.
2. **Betaling:** De gebruiker betaalt via de Stripe-hosted betaalpagina.
3. **Webhook:** Stripe stuurt op de achtergrond een signaal naar de Edge Function `stripe-webhook`.
4. **Saldo bijwerken:** De webhook verifieert de handtekening, controleert idempotentie en schrijft het saldo bij via een Postgres RPC die wallet-mutatie en transactielog in één atomaire operatie uitvoert.

### B. AI Gebruiken & Saldo Afschrijven (Proxy)

> ⚠️ **Kritieke volgorde:** Reserveer of schrijf credits af **vóór** de externe API-call. Doe je dat erna, dan heb jij OpenRouter of Fal.ai al betaald terwijl de afschrijving nog kan mislukken.

1. **Request:** De gebruiker vraagt een AI-bewerking aan. De Electron app stuurt het verzoek naar de Edge Function `generate-ai` met de JWT in de `Authorization` header.
2. **Authenticatie & check:** De Edge Function valideert het JWT-token, leidt de `user_id` af uit het token (nooit als parameter uit de client accepteren) en controleert of het model op de allowlist staat.
3. **Reservering:** De Edge Function reserveert atomair het maximale verwachte creditbedrag in de wallet.
4. **AI Aanroep:** De Edge Function pakt de geheime API-sleutel uit de Supabase Edge Function Secrets en roept Fal.ai of OpenRouter aan.
5. **Settle of Release:** Na de call leest de Edge Function het werkelijke verbruik (tokens/kosten) uit de API-respons, telt de platformmarge erbij op, en verrekent het definitieve bedrag in één atomaire transactie (settle). Bij een mislukte call worden de gereserveerde credits vrijgegeven (release). Zowel de wallet-mutatie als de transactielog worden in dezelfde Postgres-transactie weggeschreven.
6. **Resultaat:** De Edge Function stuurt het resultaat terug naar de Electron app.

---

## 3. Wat moet er veranderd worden?

### Database Schema ✅ GEBOUWD

Migraties staan in `supabase/migrations/`:
- `20260611000000_wallet_system.sql` — alle tabellen + RLS
- `20260611000001_wallet_rpcs.sql` — alle Postgres RPCs
- `20260611000002_ai_models_seed.sql` — actuele modelprijzen
- `20260611000003_wallet_blocked.sql` — `blocked` kolom voor disputes

```sql
-- Saldi (snelle cache; de waarheid ligt in de ledger)
CREATE TABLE wallets (
  user_id  uuid PRIMARY KEY REFERENCES auth.users,
  balance  bigint NOT NULL DEFAULT 0,  -- in millicredits, nooit float
  blocked  boolean NOT NULL DEFAULT false
);

-- Immutable ledger: nooit rijen aanpassen, alleen toevoegen
CREATE TABLE transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users,
  amount      bigint NOT NULL,
  type        text NOT NULL CHECK (type IN ('topup','reservation','settle','release','refund','admin','dispute')),
  description text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Stripe klantenkoppeling (één-op-één met Supabase user)
CREATE TABLE stripe_customers (
  user_id            uuid PRIMARY KEY REFERENCES auth.users,
  stripe_customer_id text UNIQUE NOT NULL
);

-- Idempotentie voor Stripe webhooks (PRIMARY KEY = database-level constraint)
CREATE TABLE stripe_events (
  stripe_event_id text PRIMARY KEY,
  processed_at    timestamptz DEFAULT now()
);

-- Model prijstabel + reserve/settle tracking
CREATE TABLE ai_models ( ... );
CREATE TABLE credit_reservations ( ... expires_at, status ... );
```

> **Integers, geen floats.** Sla credits op als `bigint` in millicredits. Floating-point rekenen met geld levert onverklaarbare afrondingsverschillen op.

> **Immutable ledger.** `wallets.balance` is een snelle cache. De waarheid is altijd te reconstrueren uit de `transactions` tabel.

> **Credit-definitie.** €10 = 1.100.000 millicredits (bonus inbegrepen). USD-kosten van OpenRouter worden op het moment van afschrijven omgerekend naar EUR. De gebruikte koers wordt opgeslagen in `metadata`.

### Row Level Security (RLS) ✅ GEBOUWD

RLS is ingesteld op `wallets`, `transactions`, `credit_reservations` en `stripe_customers`. Gebruikers kunnen alleen hun eigen data lezen. Schrijven kan uitsluitend via de service role in Edge Functions.

### Postgres RPCs ✅ GEBOUWD

Alle wallet-operaties zijn atomair (wallet-mutatie + ledger in één transactie):
- `credit_wallet` — bijschrijven (gebruikt door stripe-webhook)
- `debit_wallet` — afschrijven (gebruikt bij vaste kosten)
- `reserve_credits` — reserveer vóór AI-call
- `settle_reservation` — definitieve afschrijving op basis van werkelijk verbruik
- `release_reservation` — vrijgeven bij mislukte call
- `cleanup_expired_reservations` — weeskinderen opruimen

### Supabase Edge Functions ✅ GEBOUWD

- `create-stripe-checkout` — genereert Checkout Session, koppelt `stripe_customer_id`, rate-limiting (max 3/uur)
- `stripe-webhook` — raw body, `constructEventAsync`, DB-level idempotentie, handles: completed / refunded / dispute
- `proxy-openrouter` — JWT-auth, model allowlist, reserve/settle op basis van werkelijke tokenkosten
- `proxy-fal-ai` — JWT-auth, model allowlist, atomaire reservering vóór Fal.ai call

Gedeelde helpers in `supabase/functions/_shared/`:
- `auth.ts` — `requireUserId()` + `AuthError`
- `response.ts` — `json()`, `handleOptions()`, CORS headers
- `types.ts` — TypeScript interfaces voor alle Edge Functions

### Electron App aanpassen ✅ GEBOUWD

Alle directe OpenRouter en Fal.ai calls zijn vervangen door aanroepen naar de proxy Edge Functions via `src/main/lib/proxy.ts`:

- `callOpenRouter(body, jwt)` — stuurt naar `proxy-openrouter`, geeft raw OpenRouter response terug
- `callFalProxy(modelId, params, jwt)` — stuurt naar `proxy-fal-ai`, inclusief base64-upload support

Vervangen in:
- `src/main/engine-ipc.ts` — alle chat/image/agent handlers
- `src/main/lib/ad-pipeline.ts` — `analyzeAdSegments`, `generateLogoSvg`, `resolveLogoSource`, `removeLogoBackground`, `selectBestLogoMatch`
- `src/main/lib/calibration-ai.ts` — `proposeCorrections`
- `src/main/index.ts` — `image:generate-ai`, `video:generate-ai`, `ai:voice-command`, `ai:meeting-notes`, `ai:resolve-tags`, `ai:transform-text-to-slides`, `ad:convert-smart`, `ad:image-to-html`

JWT-strategie:
- Handlers met `accessToken` in de payload: JWT direct meegegeven
- Handlers zonder `accessToken` (presentatie-handlers): `cachedJwt` — bijgewerkt via `auth:set-jwt` IPC zodra de gebruiker inlogt
- Renderer moet `ipcRenderer.invoke('auth:set-jwt', session.access_token)` aanroepen na login (nog te implementeren in renderer)

---

## 4. Kritieke Risico's & Blinde Vlekken

---

### 4.1 Race Conditions in de Wallet ✅ OPGELOST

`reserve_credits` en `debit_wallet` gebruiken een atomaire `UPDATE ... WHERE balance >= p_amount RETURNING balance`. Als er geen rij terugkomt is het saldo onvoldoende. Geen losse SELECT mogelijk.

---

### 4.2 Stripe Webhook Idempotentie ✅ OPGELOST

`stripe_events` heeft een `PRIMARY KEY` op `stripe_event_id`. De webhook gebruikt `INSERT ... ON CONFLICT DO NOTHING` en checkt de return count. De database dwingt idempotentie af — ook bij gelijktijdige dubbele aflevering.

---

### 4.3 Stripe Webhook Authenticatie ✅ OPGELOST

`stripe-webhook` gebruikt `await req.text()` vóór elke JSON-parsing, en `stripe.webhooks.constructEventAsync()` (de Deno-compatibele variant). Webhook signing secret wordt geladen uit `Deno.env`.

Verwerkte events:

| Event | Actie |
|---|---|
| `checkout.session.completed` | Credits bijschrijven via `credit_wallet` RPC |
| `checkout.session.expired` | Alleen loggen |
| `payment_intent.payment_failed` | Alleen loggen |
| `charge.refunded` | `debit_wallet` of wallet blokkeren bij onvoldoende saldo |
| `charge.dispute.created` | Wallet blokkeren + ledgerregel, handmatig afhandelen |

---

### 4.4 JWT-authenticatie in Edge Functions ✅ OPGELOST

Alle proxy Edge Functions roepen `requireUserId(req)` aan uit `_shared/auth.ts`. De `user_id` wordt uitsluitend afgeleid uit het geverifieerde Supabase JWT. Client-parameters worden nooit als `user_id` geaccepteerd.

---

### 4.5 Reserve/Settle-patroon voor Alle AI-calls ✅ OPGELOST

Beide proxies gebruiken het volledige reserve/settle-patroon:
- `proxy-fal-ai` — reserveert vóór de Fal.ai call, settle op vaste imagekosten, release bij fout
- `proxy-openrouter` — reserveert maximum (max_tokens × output_cost), settle op werkelijke tokenkosten uit `usage`, release bij OpenRouter-fout

> **Weeskinderen:** `credit_reservations` heeft een `expires_at` kolom. De RPC `cleanup_expired_reservations` ruimt verlopen reserveringen automatisch op. ⏳ Een periodieke cron-job om deze RPC aan te roepen moet nog ingepland worden.

---

### 4.6 Stripe Klantenkoppeling ✅ OPGELOST

`create-stripe-checkout` checkt de `stripe_customers` tabel. Bij een nieuwe gebruiker wordt de Stripe Customer aangemaakt met het e-mailadres uit Supabase Auth en opgeslagen. Bestaande customers worden hergebruikt. `client_reference_id` én `metadata.user_id` worden altijd meegegeven.

---

### 4.7 Refunds, Disputes & Chargebacks ✅ OPGELOST (basis)

`stripe-webhook` verwerkt:
- `charge.refunded` — debiteert millicredits terug; bij onvoldoende saldo wordt de wallet geblokkeerd
- `charge.dispute.created` — wallet direct geblokkeerd + ledgerregel, handmatige afhandeling via Supabase dashboard

---

### 4.8 UX bij Onvoldoende Saldo en Mislukte Generaties ⏳ GEDEELTELIJK

Edge Functions geven semantische HTTP-codes terug:

| Situatie | HTTP-status | Verwachte UI-actie |
|---|---|---|
| Onvoldoende saldo | `402 Payment Required` | Toon modal "Credits op — waardeer hier op" |
| Wallet geblokkeerd | `403 Forbidden` | Toon contactbericht |
| Model niet beschikbaar | `403 Forbidden` | Toon foutmelding |
| AI-service down | `502 Bad Gateway` | "Probeer het later opnieuw" |
| Niet ingelogd | `401 Unauthorized` | Stuur naar login |

De Electron app-zijde (modal/UX) is nog niet gebouwd.

---

### 4.9 Rate Limiting & Misbruikbescherming ⏳ GEDEELTELIJK

- `create-stripe-checkout` — max 3 checkout-pogingen per uur per user ✅
- AI-proxies per gebruiker/minuut — ❌ nog niet geïmplementeerd

---

### 4.10 Model Pricing Table ✅ OPGELOST

`ai_models` tabel bevat actuele prijzen voor alle gebruikte modellen (OpenRouter + Fal.ai). Elke transactie slaat `price_version` op in `metadata`. Edge Functions halen modelprijzen uit de database — niets is hardcoded.

---

### 4.11 BTW / VAT ❌ NOG NIET

Stripe Tax is nog niet geconfigureerd. Verplicht vóór externe (niet-interne) verkoop.

---

### 4.12 USD/EUR Wisselkoersrisico ⏳ BEWUST UITGESTELD

Architectureel correct opgezet (metadata bevat ruimte voor wisselkoers). Actieve koersconversie in de proxy is nog niet geïmplementeerd — de millicreditprijzen in `ai_models` zijn nu al omgerekend naar EUR-equivalent. Monitor via de `transactions` ledger.

---

### 4.13 Electron App Veiligheid ✅ OPGELOST

- API-sleutels staan als Supabase Edge Function Secrets (server-side) — via `deploy.sh` instellen
- Alle directe `fetch` calls naar OpenRouter en Fal.ai vervangen door proxy-aanroepen via JWT
- `openrouterKey` en `falKey` worden niet langer gebruikt in de AI-aanroepen
- Renderer stuurt na login de JWT naar het main process via `auth:set-jwt`

---

### 4.14 Startcredits voor Beheer & Interne Tests ✅ OPGELOST

`credit_wallet` RPC is beschikbaar. Startcredits geven via Supabase SQL Editor:

```sql
SELECT credit_wallet(
  '<user-uuid>',
  500000,
  'admin',
  'Startcredits testdag',
  '{"granted_by": "admin"}'::jsonb
);
```

---

## 5. Voortgang Prioriteiten

### MUST — vóór live test met echte betaling

| # | Punt | Status |
|---|---|---|
| 1 | RLS op `wallets` en `transactions` | ✅ Gebouwd |
| 2 | Atomaire wallet reserve/debit/release via Postgres RPC | ✅ Gebouwd |
| 3 | Immutable ledger met unieke transaction IDs | ✅ Gebouwd |
| 4 | Stripe webhook: raw body + `constructEventAsync` | ✅ Gebouwd |
| 5 | Stripe event idempotentie via database `PRIMARY KEY` | ✅ Gebouwd |
| 6 | JWT-auth in Edge Functions, `user_id` alleen uit auth-token | ✅ Gebouwd |
| 7 | API-keys/secrets volledig uit Electron app verwijderd | ✅ Gebouwd |
| 8 | Admin startcredits via `credit_wallet` RPC | ✅ Gebouwd |
| 9 | Logging per generatie: user, provider, model, kosten, status | ✅ Gebouwd |
| 10 | Basis refund/dispute-flow | ✅ Gebouwd |

### Nog te doen vóór livegang

| Stap | Wat |
|---|---|
| `./deploy.sh` | Voert alles uit: login → migraties → secrets → functions deploy |
| Stripe Dashboard | Webhook URL instellen (deploy.sh toont de exacte instructies erna) |
| Renderer: `auth:set-jwt` | Na login `ipcRenderer.invoke('auth:set-jwt', session.access_token)` aanroepen |
| Testdag | Collega's startcredits geven via Supabase SQL Editor |

### SHOULD — vóór bredere beta

| # | Punt | Status |
|---|---|---|
| 1 | Rate limiting per gebruiker en IP (AI-proxies) | ⏳ Gedeeltelijk (alleen checkout) |
| 2 | Model allowlist en pricing table in database | ✅ Gebouwd |
| 3 | Vervaltijd + cleanup voor weeskinderen bij reserveringen | ✅ Gebouwd (cron nog plannen) |
| 4 | Alerts bij hoge kosten of veel mislukte generaties | ❌ Niet gedaan |
| 5 | Reconciliation-job: Stripe betalingen vs. wallet-ledger | ❌ Niet gedaan |
| 6 | Branded UX bij "saldo onvoldoende", "generatie mislukt" | ⏳ HTTP-codes gereed, UI nog niet |
| 7 | Signed URLs voor gegenereerde assets | ❌ Niet gedaan |
| 8 | Auditlog voor admin-acties | ✅ Gebouwd (via `transactions` type='admin') |
| 9 | Stripe Tax configureren | ❌ Niet gedaan |

---

## Conclusie

Backend én frontend zijn gebouwd. Alle kritieke beveiligingslagen staan: atomaire wallet-operaties, Stripe webhook met signature-verificatie en database-level idempotentie, JWT-authenticatie in alle proxies, RLS op alle gevoelige tabellen, refund/dispute-afhandeling, en alle directe AI-calls vervangen door proxy-aanroepen.

Wat resteert vóór de live test: één commando uitvoeren (`./deploy.sh`), de Stripe webhook URL instellen, en `auth:set-jwt` in de renderer aanroepen na login. Daarna startcredits geven via SQL en testen.
