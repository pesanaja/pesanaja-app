import { createClient } from '@supabase/supabase-js'

const recoveryHashParams = typeof window === 'undefined' ? null : new URLSearchParams(window.location.hash.slice(1))
const recoveryQueryParams = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
export const isPasswordRecoveryRedirect =
  recoveryHashParams?.get('type') === 'recovery' || recoveryQueryParams?.get('type') === 'recovery'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createClient(url, key, {
  auth: {
    storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null
