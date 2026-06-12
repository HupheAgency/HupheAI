import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured: boolean =
  Boolean(supabaseUrl) && Boolean(supabaseAnonKey)

// Maak de client pas aan als de credentials beschikbaar zijn.
// Bij ontbrekende credentials exporteren we null en toont de app een foutscherm.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

if (!supabaseConfigured) {
  console.error(
    '[HupheAI] Supabase credentials ontbreken.\n' +
      'Kopieer .env.example naar .env en vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in,\n' +
      'bouw vervolgens opnieuw met: npm run build:mac'
  )
}
