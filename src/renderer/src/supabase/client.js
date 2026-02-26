// ============================================================
// MyAppLabs HQ — Supabase Client
// ============================================================
import { createClient } from '@supabase/supabase-js'

const SUPABASE_DIRECT_URL = 'https://guigotagildvzanocdzs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aWdvdGFnaWxkdnphbm9jZHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjY1NjMsImV4cCI6MjA4NzcwMjU2M30.Wc7eP26TXF0i9ygJOlJre2z8t4qThR-oUg-nxKkT-Fg'

// In browser preview (window.electronStore === null), route through Vite proxy to avoid
// browser security restrictions. In Electron, use the direct Supabase URL.
const SUPABASE_URL = window.electronStore === null
  ? window.location.origin
  : SUPABASE_DIRECT_URL

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage so users stay logged in between launches
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})
