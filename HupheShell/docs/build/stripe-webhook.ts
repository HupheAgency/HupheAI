import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id
    const amountCentsStr = session.metadata?.amount_cents
    const feePctStr = session.metadata?.fee_pct

    if (userId && amountCentsStr) {
      const amountCents = parseInt(amountCentsStr, 10)
      const feePct = parseFloat(feePctStr || '0')
      const spendableCents = Math.round(amountCents * (1 - feePct / 100))
      const feeCents = amountCents - spendableCents

      // Upsert wallet
      const { data: walletData, error: walletError } = await supabase.rpc('wallet_topup', {
        p_user_id: userId,
        p_amount: spendableCents
      })

      if (walletError) {
        // Fallback als RPC niet bestaat: direct SQL query (via Edge Function minder makkelijk, dus direct via Supabase REST is vereist, we gebruiken upsert)
        const { data, error } = await supabase
          .from('wallets')
          .select('personal_balance')
          .eq('user_id', userId)
          .single()
        
        let newBalance = spendableCents
        if (data) {
          newBalance += data.personal_balance
        }
        
        await supabase
          .from('wallets')
          .upsert({ user_id: userId, personal_balance: newBalance })
      }

      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'topup',
        amount_cents: spendableCents,
        description: 'Storting via Stripe',
        stripe_session_id: session.id
      })

      if (feeCents > 0) {
        await supabase.from('wallet_transactions').insert({
          user_id: userId,
          type: 'fee',
          amount_cents: feeCents,
          description: 'Platform fee',
          stripe_session_id: session.id
        })
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
