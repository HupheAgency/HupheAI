import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

const STORAGE_KEY = 'huphe:saved-accounts'

export interface SavedAccount {
  email: string
  displayName: string | null
  accessToken: string
  refreshToken: string
}

export function getSavedAccounts(): SavedAccount[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveCurrentAccount(session: Session): void {
  const email = session.user.email
  if (!email) return

  const accounts = getSavedAccounts().filter(a => a.email !== email)
  accounts.unshift({
    email,
    displayName: session.user.user_metadata?.full_name ?? null,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export function removeAccount(email: string): void {
  const accounts = getSavedAccounts().filter(a => a.email !== email)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export async function switchToAccount(account: SavedAccount): Promise<void> {
  if (!supabase) return
  // setSession werkt ook als access_token verlopen is — Supabase gebruikt refresh_token automatisch
  await supabase.auth.setSession({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  })
  // Na switch: JWT bijwerken in main process
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    void (window as any).api?.setJwt(session.access_token)
  }
}

export async function addAccount(): Promise<void> {
  // Log uit zonder het huidige account te verwijderen — Supabase toont loginscherm
  if (!supabase) return
  await supabase.auth.signOut({ scope: 'local' })
}
