import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

const AuthContext = createContext(null)

/**
 * Provides auth state and the magic-link login flow.
 *
 * Login is OTP-only (no password). Supabase sends a 6-digit OTP to the
 * client's email; they enter it here to verify. Admin/super_admin accounts
 * are explicitly blocked from accessing the portal.
 *
 * The portal reads client_portal_settings on login to gate which sections
 * are visible. Those settings are exposed via `portalSettings`.
 */
export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null)
  const [profile,        setProfile]        = useState(null)   // profiles row
  const [portalSettings, setPortalSettings] = useState(null)   // client_portal_settings row
  const [loading,        setLoading]        = useState(true)
  const [roleError,      setRoleError]      = useState(false)  // true if non-client tried to log in

  useEffect(() => {
    // Safety net: if something hangs (network issue, unexpected error, etc.)
    // force the loading screen away after 8 seconds so no client gets stuck forever.
    const loadingTimeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('[AuthContext] Loading timeout — forcing login page')
          return false
        }
        return prev
      })
    }, 8000)

    // Use onAuthStateChange only (Supabase v2 best practice).
    // INITIAL_SESSION fires immediately on mount with the existing session or null —
    // this replaces the old getSession() call and avoids the race condition that
    // occurred when both ran simultaneously.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null
        if (u) {
          // On page load, enforce remember-me before doing anything else.
          // sessionStorage clears when browser closes; localStorage persists.
          // If the user didn't tick remember me and it's a new browser session, sign out.
          if (event === 'INITIAL_SESSION') {
            const remembered   = localStorage.getItem('portal-remember-me') === 'true'
            const sessionAlive = sessionStorage.getItem('portal-session-alive') === 'true'
            if (!remembered && !sessionAlive) {
              // Show login page immediately, then clean up the stale session.
              // Deferred with setTimeout to avoid calling signOut() inside the
              // onAuthStateChange handler (causes a deadlock in Supabase JS).
              setLoading(false)
              setTimeout(() => supabase.auth.signOut(), 0)
              return
            }
          }
          // hydrateUser calls setLoading(false) itself in every code path,
          // so we do NOT call it here after awaiting.
          await hydrateUser(u)
        } else {
          setUser(null)
          setProfile(null)
          setPortalSettings(null)
          setRoleError(false)
          setLoading(false)
        }
      }
    )

    return () => {
      clearTimeout(loadingTimeout)
      subscription.unsubscribe()
    }
  }, [])

  /**
   * Fetch the user's profile row. If the role is not 'client', sign them out
   * and set roleError — the login page shows an appropriate message.
   *
   * IMPORTANT: this always calls setLoading(false) before returning, and always
   * defers any signOut() with setTimeout to avoid calling it inside the
   * onAuthStateChange handler (which causes a deadlock in Supabase JS v2).
   */
  async function hydrateUser(u) {
    try {
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, role, first_login')
        .eq('id', u.id)
        .single()

      if (profError) throw profError

      if (!prof || prof.role !== 'client') {
        setRoleError(true)
        setUser(null)
        setProfile(null)
        setPortalSettings(null)
        setLoading(false)
        // Defer signOut — calling it directly inside onAuthStateChange deadlocks Supabase JS
        setTimeout(() => supabase.auth.signOut(), 0)
        return
      }

      setUser(u)
      setProfile(prof)
      setRoleError(false)

      // Load portal settings — fail safe: default to all-enabled on any error
      const { data: settings } = await supabase
        .from('client_portal_settings')
        .select('show_stage_tracker, show_documents, show_messages, show_referrals, welcome_message')
        .eq('client_id', u.id)
        .maybeSingle()

      setPortalSettings(settings ?? {
        show_stage_tracker: true,
        show_documents:     true,
        show_messages:      true,
        show_referrals:     true,
        welcome_message:    null,
      })

      // Update last_seen only — first_login is cleared by DashboardPage
      // after the onboarding overlay is dismissed, so the flag is readable here.
      supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', u.id)
        .then(() => {}) // fire-and-forget — non-critical

      setLoading(false)
    } catch (err) {
      console.error('[AuthContext] hydrateUser error:', err?.message ?? err?.code ?? JSON.stringify(err))
      // Sign out on unexpected DB error — prevents partial authenticated state.
      // Defer signOut — calling it directly inside onAuthStateChange deadlocks Supabase JS
      setUser(null)
      setProfile(null)
      setPortalSettings(null)
      setLoading(false)
      setTimeout(() => supabase.auth.signOut(), 0)
    }
  }

  /**
   * Step 1 of magic-link login: send OTP to email.
   * Returns { error } where error is a string or null.
   */
  async function sendOtp(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },  // only allow existing accounts
    })
    if (error) {
      if (error.message?.toLowerCase().includes('rate')) {
        return { error: 'Too many attempts. Please wait a moment before trying again.' }
      }
      return { error: 'Failed to send code. Please check the email address and try again.' }
    }
    return { error: null }
  }

  /**
   * Step 2: verify the 6-digit OTP.
   * Returns { error } where error is a string or null.
   */
  async function verifyOtp(email, token, rememberMe = true) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    })
    if (error) {
      if (error.message?.toLowerCase().includes('expired')) {
        return { error: 'Code expired. Please request a new one.' }
      }
      if (error.message?.toLowerCase().includes('invalid')) {
        return { error: 'Incorrect code. Please try again.' }
      }
      return { error: 'Verification failed. Please try again.' }
    }
    // Store remember-me preference before onAuthStateChange fires
    sessionStorage.setItem('portal-session-alive', 'true')
    if (rememberMe) {
      localStorage.setItem('portal-remember-me', 'true')
    } else {
      localStorage.removeItem('portal-remember-me')
    }
    return { error: null }
  }

  /**
   * Called by DashboardPage when the client dismisses the onboarding overlay.
   * Clears the first_login flag in the DB and updates local profile state.
   */
  async function dismissOnboarding() {
    if (!user) return
    await supabase
      .from('profiles')
      .update({ first_login: false })
      .eq('id', user.id)
    setProfile(p => p ? { ...p, first_login: false } : p)
  }

  async function logout() {
    sessionStorage.removeItem('portal-session-alive')
    localStorage.removeItem('portal-remember-me')
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, profile, portalSettings,
      loading, roleError,
      sendOtp, verifyOtp, logout, dismissOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
