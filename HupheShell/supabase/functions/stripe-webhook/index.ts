import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, handleOptions } from '../_shared/response.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Stripe verwacht altijd een 200 terug — ook bij interne fouten.
// Anders blijft Stripe het event herproben.
function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  // Raw body VÓÓR json-parsing — constructEventAsync vereist de originele bytes
  const rawBody = await req.text()
  const signature = req.headers.get('Stripe-Signature')

  if (!signature) {
    console.error('[stripe-webhook] Geen Stripe-Signature header')
    return new Response('Missing Stripe-Signature', { status: 400 })
  }

  let event: Stripe.Event
  try {
    // constructEventAsync — de synchrone variant bestaat niet in Deno
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verificatie mislukt:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // Idempotentie: PRIMARY KEY constraint op stripe_events gooit een conflict
  // bij dubbele aflevering. ON CONFLICT DO NOTHING + count check.
  const { count, error: insertError } = await serviceClient
    .from('stripe_events')
    .insert({ stripe_event_id: event.id }, { count: 'exact' })
    .select()

  if (insertError && !insertError.message.includes('duplicate')) {
    console.error('[stripe-webhook] Fout bij opslaan event ID:', insertError.message)
    return ok() // Toch 200, Stripe moet niet blijven herproben bij DB-fouten
  }

  if (count === 0) {
    console.log(`[stripe-webhook] Event ${event.id} al verwerkt, skip`)
    return ok()
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute)
        break

      case 'checkout.session.expired':
      case 'payment_intent.payment_failed':
        console.warn(`[stripe-webhook] ${event.type} ontvangen — geen actie vereist`)
        break

      default:
        console.log(`[stripe-webhook] Onbekend event type: ${event.type}`)
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] Fout bij verwerken ${event.type}:`, err.message)
    // Altijd 200 — de fout is gelogd, Stripe hoeft niet te herproben
  }

  return ok()
})

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId    = session.client_reference_id ?? session.metadata?.user_id
  const companyId = session.metadata?.company_id ?? null

  if (!userId && !companyId) {
    console.error('[stripe-webhook] checkout.session.completed: geen user_id of company_id gevonden', session.id)
    return
  }

  const millicredits = parseInt(session.metadata?.millicredits ?? '0', 10)
  if (!millicredits || millicredits <= 0) {
    console.error('[stripe-webhook] checkout.session.completed: ongeldige millicredits', session.metadata)
    return
  }

  const description = `Opwaardering via Stripe — ${session.metadata?.package_id ?? 'onbekend pakket'}`
  const metadata = {
    stripe_session_id: session.id,
    stripe_customer_id: session.customer,
    amount_eur_cents: session.amount_total,
    package_id: session.metadata?.package_id,
  }

  // Company top-up of persoonlijke top-up
  let error: any
  if (companyId) {
    const res = await serviceClient.rpc('credit_company_wallet', {
      p_company_id: companyId,
      p_amount: millicredits,
      p_type: 'topup',
      p_description: description,
      p_metadata: metadata,
    })
    error = res.error
  } else {
    const res = await serviceClient.rpc('credit_wallet', {
      p_user_id: userId,
      p_amount: millicredits,
      p_type: 'topup',
      p_description: description,
      p_metadata: metadata,
    })
    error = res.error
  }

  if (error) {
    console.error('[stripe-webhook] credit_wallet RPC fout:', error.message)
    throw error
  }

  // Koppel stripe_customer_id als nog niet gedaan (race-safe via upsert)
  if (session.customer) {
    await serviceClient
      .from('stripe_customers')
      .upsert(
        { user_id: userId, stripe_customer_id: session.customer as string },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
  }

  console.log(`[stripe-webhook] ${millicredits} millicredits bijgeschreven voor user ${userId}`)
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  // Zoek user_id via stripe_customer_id
  const stripeCustomerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  if (!stripeCustomerId) {
    console.error('[stripe-webhook] charge.refunded: geen customer ID')
    return
  }

  const { data: customerRow } = await serviceClient
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle()

  if (!customerRow?.user_id) {
    console.error('[stripe-webhook] charge.refunded: geen user gevonden voor customer', stripeCustomerId)
    return
  }

  const userId = customerRow.user_id
  // amount_refunded is in eurocenten — omrekenen naar millicredits (1 cent = 1000 millicredits)
  const millicredits = (charge.amount_refunded ?? 0) * 1000

  if (millicredits <= 0) return

  // Probeer te debiteren; als saldo onvoldoende is, blokkeer de wallet
  const { error } = await serviceClient.rpc('debit_wallet', {
    p_user_id: userId,
    p_amount: millicredits,
    p_type: 'refund',
    p_description: 'Terugboeking via Stripe refund',
    p_metadata: { stripe_charge_id: charge.id, amount_refunded_cents: charge.amount_refunded },
  })

  if (error?.message === 'insufficient_balance') {
    console.warn(`[stripe-webhook] Onvoldoende saldo voor refund-debitering, wallet geblokkeerd voor ${userId}`)
    await serviceClient
      .from('wallets')
      .upsert({ user_id: userId, balance: 0, blocked: true })
  } else if (error) {
    console.error('[stripe-webhook] debit_wallet refund fout:', error.message)
    throw error
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const stripeCustomerId = typeof dispute.payment_intent === 'string'
    ? null
    : null // Dispute heeft geen directe customer — zoek via charge

  // Haal de charge op om de customer te vinden
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
  if (!chargeId) {
    console.error('[stripe-webhook] dispute.created: geen charge ID')
    return
  }

  const charge = await stripe.charges.retrieve(chargeId)
  const custId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  if (!custId) return

  const { data: customerRow } = await serviceClient
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', custId)
    .maybeSingle()

  if (!customerRow?.user_id) return

  // Blokkeer wallet direct — handmatig afhandelen via Supabase dashboard
  await serviceClient
    .from('wallets')
    .upsert({ user_id: customerRow.user_id, blocked: true }, { onConflict: 'user_id' })

  // Log in ledger
  await serviceClient.from('transactions').insert({
    user_id: customerRow.user_id,
    amount: 0,
    type: 'dispute',
    description: 'Wallet geblokkeerd wegens Stripe dispute',
    metadata: { stripe_dispute_id: dispute.id, stripe_charge_id: chargeId },
  })

  console.warn(`[stripe-webhook] Wallet geblokkeerd voor user ${customerRow.user_id} wegens dispute ${dispute.id}`)
}
