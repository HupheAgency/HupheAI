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
  constructor(public message: string, public status: number) {
    super(message)
  }
}
