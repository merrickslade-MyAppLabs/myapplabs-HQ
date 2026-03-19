// ============================================================
// MyAppLabs HQ — Supabase Client
// ============================================================
import { createClient } from '@supabase/supabase-js'

// In browser preview (window.electronStore === null), route through Vite proxy to avoid
// browser security restrictions. In Electron, use the URL from .env.
const SUPABASE_URL = window.electronStore === null
  ? window.location.origin
  : import.meta.env.VITE_SUPABASE_URL

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage so users stay logged in between launches
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})
