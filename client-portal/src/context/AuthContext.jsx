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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Enforce "remember me" — sessionStorage clears on browser close, localStorage persists.
        // If the user didn't check remember me and the browser was closed, sign them out.
        const remembered   = localStorage.getItem('portal-remember-me') === 'true'
        const sessionAlive = sessionStorage.getItem('portal-session-alive') === 'true'
        if (!remembered && !sessionAlive) {
          await supabase.auth.signOut()
          setLoading(false)
          return
        }
        await hydrateUser(session.user)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null
        if (u) {
          await hydrateUser(u)
        } else {
          setUser(null)
          setProfile(null)
          setPortalSettings(null)
          setRoleError(false)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Fetch the user's profile row. If the role is not 'client', sign them out
   * and set roleError — the login page shows an appropriate message.
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
        await supabase.auth.signOut()
        setRoleError(true)
        setUser(null)
        setProfile(null)
        setPortalSettings(null)
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
    } catch (err) {
      console.error('[AuthContext] hydrateUser error:', err?.message ?? err?.code ?? JSON.stringify(err))
      // Sign out on unexpected DB error — prevents partial authenticated state
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setPortalSettings(null)
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
