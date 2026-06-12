#!/usr/bin/env bash
# deploy.sh — Betalingssysteem live zetten
# Voer dit uit vanuit de HupheShell directory: ./deploy.sh
#
# Vereisten:
#   - npx beschikbaar (Node.js geïnstalleerd)
#   - Supabase account met project rnluzxpsduphqspqnwbe
#   - Stripe, OpenRouter en Fal.ai API-sleutels bij de hand

set -euo pipefail

PROJECT_REF="rnluzxpsduphqspqnwbe"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   HupheAI Betalingssysteem — Deploy                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Stap 1: inloggen bij Supabase ─────────────────────────────────────────────
echo "▶ Stap 1/5: Inloggen bij Supabase..."
npx supabase login

# ── Stap 2: koppel aan het project ────────────────────────────────────────────
echo ""
echo "▶ Stap 2/5: Project koppelen..."
npx supabase link --project-ref "$PROJECT_REF"

# ── Stap 3: migraties deployen ────────────────────────────────────────────────
echo ""
echo "▶ Stap 3/5: Database migraties uitvoeren..."
npx supabase db push

echo "  ✓ Migraties uitgevoerd"

# ── Stap 4: secrets instellen ─────────────────────────────────────────────────
echo ""
echo "▶ Stap 4/5: Secrets instellen voor Edge Functions..."
echo "  Voer de volgende sleutels in. Laat leeg + Enter om een sleutel over te slaan."
echo ""

read -rp "  STRIPE_SECRET_KEY (sk_live_... of sk_test_...): " STRIPE_SECRET_KEY
read -rp "  STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WEBHOOK_SECRET
read -rp "  OPENROUTER_API_KEY (sk-or-...): " OPENROUTER_API_KEY
read -rp "  FAL_API_KEY: " FAL_API_KEY
read -rp "  FRONTEND_URL (bijv. https://hupheai.app): " FRONTEND_URL

if [ -n "$STRIPE_SECRET_KEY" ]; then
  echo "$STRIPE_SECRET_KEY" | npx supabase secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" --project-ref "$PROJECT_REF"
fi
if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
  npx supabase secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" --project-ref "$PROJECT_REF"
fi
if [ -n "$OPENROUTER_API_KEY" ]; then
  npx supabase secrets set OPENROUTER_API_KEY="$OPENROUTER_API_KEY" --project-ref "$PROJECT_REF"
fi
if [ -n "$FAL_API_KEY" ]; then
  npx supabase secrets set FAL_API_KEY="$FAL_API_KEY" --project-ref "$PROJECT_REF"
fi
if [ -n "$FRONTEND_URL" ]; then
  npx supabase secrets set FRONTEND_URL="$FRONTEND_URL" --project-ref "$PROJECT_REF"
fi

echo "  ✓ Secrets ingesteld"

# ── Stap 5: Edge Functions deployen ───────────────────────────────────────────
echo ""
echo "▶ Stap 5/5: Edge Functions deployen..."

for fn in create-stripe-checkout stripe-webhook proxy-openrouter proxy-fal-ai; do
  echo "  Deploying $fn..."
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  echo "  ✓ $fn gedeployed"
done

# ── Klaar ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✓ Deploy voltooid!                                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Laatste stap — stel de Stripe webhook URL in:"
echo ""
echo "  1. Ga naar https://dashboard.stripe.com/webhooks"
echo "  2. Klik 'Add endpoint'"
echo "  3. URL: https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook"
echo "  4. Events: checkout.session.completed, checkout.session.expired,"
echo "             payment_intent.payment_failed, charge.refunded, charge.dispute.created"
echo "  5. Kopieer de 'Signing secret' (whsec_...) en sla op:"
echo "     npx supabase secrets set STRIPE_WEBHOOK_SECRET='<signing-secret>' --project-ref $PROJECT_REF"
echo "     npx supabase functions deploy stripe-webhook --project-ref $PROJECT_REF"
echo ""
echo "Startcredits geven aan collega's (via Supabase SQL Editor):"
echo "  SELECT credit_wallet('<user-uuid>', 500000, 'admin', 'Startcredits testdag', '{}'::jsonb);"
echo ""
