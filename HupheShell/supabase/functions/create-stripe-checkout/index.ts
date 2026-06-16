import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { requireUserId } from '../_shared/auth.ts'
import { json, handleOptions } from '../_shared/response.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const PACKAGES = [
  { id: 'starter',  euros: 5,  millicredits: 500_000,  label: '5.000 credits' },
  { id: 'standard', euros: 10, millicredits: 1_100_000, label: '11.000 credits (+10% bonus)' },
  { id: 'pro',      euros: 25, millicredits: 3_000_000, label: '30.000 credits (+20% bonus)' },
]

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const userId = await requireUserId(req)
    const { package_id, success_url, cancel_url, company_id } = await req.json()

    const pkg = PACKAGES.find(p => p.id === package_id)
    if (!pkg) {
      return json({ error: 'Ongeldig pakket' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Rate-limiting: max 3 checkout-pogingen per uur per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCheckouts } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'topup')
      .gte('created_at', oneHourAgo)

    if ((recentCheckouts ?? 0) >= 3) {
      return json({ error: 'Te veel opwaardeerpogingen. Probeer het over een uur opnieuw.' }, 429)
    }

    // Zoek bestaande Stripe klant
    const { data: customerData } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle()

    let stripeCustomerId = customerData?.stripe_customer_id

    // Maak nieuwe klant aan indien nodig
    if (!stripeCustomerId) {
      // Haal email van gebruiker op voor Stripe
      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      const email = userData?.user?.email

      const customer = await stripe.customers.create({
        email: email,
        metadata: { user_id: userId }
      })
      stripeCustomerId = customer.id

      await supabase.from('stripe_customers').insert({
        user_id: userId,
        stripe_customer_id: stripeCustomerId
      })
    }

    // Maak checkout sessie aan
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      client_reference_id: userId,
      payment_method_types: ['card', 'ideal'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'HupheAI Credits',
              description: pkg.label,
            },
            unit_amount: pkg.euros * 100, // in centen
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: userId,
        package_id: pkg.id,
        millicredits: pkg.millicredits.toString(),
        ...(company_id ? { company_id } : {}),
      },
      success_url: success_url || `${Deno.env.get('FRONTEND_URL')}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${Deno.env.get('FRONTEND_URL')}/credits/cancel`,
    })

    return json({ checkout_url: session.url })

  } catch (err: any) {
    console.error('Checkout error:', err)

    // Stripe configuratiefouten (verlopen key, ongeldige key, etc.) nooit tonen aan gebruikers
    const isStripeConfigError = err?.type === 'StripeAuthenticationError'
      || err?.message?.toLowerCase().includes('api key')
      || err?.message?.toLowerCase().includes('expired')
      || err?.message?.toLowerCase().includes('authentication')

    if (isStripeConfigError) {
      return json({ error: 'Betaling tijdelijk niet beschikbaar. Probeer het later opnieuw.' }, 503)
    }

    // Stripe gebruikersfouten (ongeldige kaart etc.) wel tonen
    if (err?.type?.startsWith('Stripe') && err?.statusCode < 500) {
      return json({ error: err.message || 'Betaling mislukt.' }, err.statusCode || 400)
    }

    return json({ error: 'Interne serverfout' }, 500)
  }
})
