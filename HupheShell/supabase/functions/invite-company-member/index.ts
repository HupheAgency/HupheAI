import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions } from '../_shared/response.ts'

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const userId = await requireUserId(req)
    const { email, company_id, role = 'member' } = await req.json()

    if (!email || !company_id) {
      return json({ error: 'email en company_id zijn verplicht' }, 400)
    }

    // Controleer of de aanvrager admin of eigenaar is van dit bedrijf
    const { data: membership } = await serviceClient
      .from('company_members')
      .select('role')
      .eq('company_id', company_id)
      .eq('user_id', userId)
      .maybeSingle()

    const { data: company } = await serviceClient
      .from('company_accounts')
      .select('name, owner_id')
      .eq('id', company_id)
      .maybeSingle()

    const isOwner = (company as any)?.owner_id === userId
    const isAdmin = (membership as any)?.role === 'admin'

    if (!isOwner && !isAdmin) {
      return json({ error: 'Geen toegang — je moet admin of eigenaar zijn' }, 403)
    }

    const companyName = (company as any)?.name ?? 'het bedrijf'

    // Stuur uitnodigingsmail via Supabase Auth — maakt account aan als het nog niet bestaat
    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${Deno.env.get('FRONTEND_URL') ?? 'https://hupheai.app'}`,
      data: {
        company_id,
        company_role: role,
        company_name: companyName,
      },
    })

    if (inviteError) {
      // Als gebruiker al bestaat, sla ze gewoon direct toe
      if (inviteError.message?.includes('already been registered')) {
        const { data: existingUser } = await serviceClient
          .from('user_profiles')
          .select('user_id')
          .eq('email', email)
          .maybeSingle()

        if ((existingUser as any)?.user_id) {
          await serviceClient.from('company_members').upsert(
            { company_id, user_id: (existingUser as any).user_id, role },
            { onConflict: 'company_id,user_id' }
          )
          return json({ ok: true, message: 'Bestaand account direct toegevoegd als lid' })
        }
      }
      return json({ error: inviteError.message }, 400)
    }

    // Sla uitnodiging op in company_invites
    await serviceClient.from('company_invites').upsert(
      { company_id, email, invited_by: userId, accepted: false },
      { onConflict: 'company_id,email' }
    )

    return json({ ok: true, message: `Uitnodiging verstuurd naar ${email}` })

  } catch (err: any) {
    if (err instanceof AuthError) return json({ error: err.message }, err.status)
    console.error('[invite-company-member]', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
