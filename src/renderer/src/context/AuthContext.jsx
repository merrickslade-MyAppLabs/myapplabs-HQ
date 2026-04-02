import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import { clearDerivedKey } from '../utils/crypto'

const AuthContext = createContext(null)

// Roles that require TOTP MFA
const MFA_REQUIRED_ROLES = new Set(['admin', 'super_admin'])

/**
 * mfaStatus values:
 *   'idle'          — initial; also used for client role (no MFA required)
 *   'checking'      — fetching MFA state after login
 *   'needs_enroll'  — admin/super_admin with no TOTP factor enrolled
 *   'needs_verify'  — TOTP enrolled but not yet verified this session (AAL1)
 *   'verified'      — MFA complete or not required
 *
 * ── Why the handler is NOT async ─────────────────────────────────────────────
 * Supabase JS v2 awaits every onAuthStateChange callback before resolving
 * auth operations (signInWithPassword, token refresh, etc.). An async handler
 * that awaits DB / MFA API calls can therefore block indefinitely if those calls
 * are slow, causing the infinite loading spinner on startup.
 * Making the handler synchronous lets auth operations resolve immediately.
 * checkMfaStatus() runs in the background and calls setLoading(false) itself.
 *
 * ── Why getSession() is removed ──────────────────────────────────────────────
 * Using both getSession() and onAuthStateChange together creates a race condition
 * where both try to hydrate the user simultaneously. In Supabase v2, the
 * INITIAL_SESSION event from onAuthStateChange is the correct single source of
 * truth — it fires immediately on mount with the existing session or null,
 * replacing the need for a separate getSession() call.
 *
 * ── Why signOut is always deferred with setTimeout ───────────────────────────
 * Calling supabase.auth.signOut() synchronously inside onAuthStateChange causes
 * a deadlock in Supabase JS v2. setTimeout(..., 0) defers it to the next
 * event-loop tick, breaking the cycle.
 */
export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null)
  const [profile,         setProfile]         = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [authError,       setAuthError]       = useState(null)
  const [mfaStatus,       setMfaStatus]       = useState('idle')
  const [clientRoleError, setClientRoleError] = useState(false)

  useEffect(() => {
    // Safety net: if anything hangs (slow network, unexpected error, etc.)
    // force loading away after 10 seconds so the app never gets permanently stuck.
    const loadingTimeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('[AuthContext] Loading timeout — forcing login page')
          return false
        }
        return prev
      })
    }, 10000)

    // IMPORTANT: handler is intentionally NOT async — see file-level comment.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const u = session?.user ?? null

        if (!u) {
          setUser(null)
          setProfile(null)
          setMfaStatus('idle')
          setLoading(false)
          return
        }

        // Fire checkMfaStatus without awaiting — keeps the handler synchronous.
        // checkMfaStatus sets loading=false in every code path.
        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN'       ||
          event === 'TOKEN_REFRESHED'
        ) {
          checkMfaStatus(u)
        }
        // USER_UPDATED and other events: loading already false, no action needed.
      }
    )

    return () => {
      clearTimeout(loadingTimeout)
      subscription.unsubscribe()
    }
  }, [])

  /**
   * Check whether this user needs MFA enrollment or verification.
   * Only admin and super_admin are required to use TOTP.
   *
   * Rules:
   * - Always calls setLoading(false) before returning (every code path).
   * - All signOut() calls are deferred with setTimeout to avoid the deadlock
   *   described in the file-level comment.
   */
  async function checkMfaStatus(u) {
    setMfaStatus('checking')
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', u.id)
        .single()

      const role = prof?.role ?? 'client'

      // Client accounts must not access HQ — sign out immediately.
      // Defer signOut to avoid calling it inside onAuthStateChange (deadlock).
      if (role === 'client') {
        setUser(null)
        setProfile(null)
        setClientRoleError(true)
        setMfaStatus('idle')
        setLoading(false)
        setTimeout(() => supabase.auth.signOut(), 0)
        return
      }

      setUser(u)
      setProfile(prof)
      setClientRoleError(false)

      if (!MFA_REQUIRED_ROLES.has(role)) {
        // Any non-admin role — MFA not required
        setMfaStatus('verified')
        setLoading(false)
        return
      }

      // Check enrolled TOTP factors
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactors = (factorsData?.totp ?? []).filter(f => f.status === 'verified')

      if (totpFactors.length === 0) {
        setMfaStatus('needs_enroll')
        setLoading(false)
        return
      }

      // TOTP enrolled — check current Assurance Level
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      setMfaStatus(aalData?.currentLevel === 'aal2' ? 'verified' : 'needs_verify')
      setLoading(false)
    } catch (err) {
      console.error('[AuthContext] checkMfaStatus error:', err)
      // Fail open — allow access rather than permanently blocking on a network error
      setMfaStatus('verified')
      setLoading(false)
    }
  }

  /**
   * Sign in with email and password.
   * After a successful sign-in, checks MFA status and sets mfaStatus accordingly.
   * Returns { user, error }.
   */
  async function login(email, password) {
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        const message = getFriendlyAuthError(error.message)
        setAuthError(message)
        return { user: null, error: message }
      }

      // Immediately check MFA status for this user
      await checkMfaStatus(data.user)

      return { user: data.user, error: null }
    } catch (err) {
      const message = 'An unexpected error occurred. Please try again.'
      setAuthError(message)
      return { user: null, error: message }
    }
  }

  /**
   * Complete TOTP verification for an already-enrolled factor.
   * Lifts mfaStatus to 'verified' on success.
   * Returns { error } where error is a string or null.
   */
  async function verifyMfa(code) {
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const factor = (factorsData?.totp ?? []).find(f => f.status === 'verified')
      if (!factor) return { error: 'No TOTP factor found. Please enrol a new authenticator.' }

      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      })
      if (challengeErr) return { error: 'Failed to start challenge. Please try again.' }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId:    factor.id,
        challengeId: challengeData.id,
        code:        code.trim().replace(/\s/g, ''),
      })

      if (verifyErr) return { error: 'Incorrect code. Please check your authenticator and try again.' }

      setMfaStatus('verified')
      return { error: null }
    } catch {
      return { error: 'An unexpected error occurred. Please try again.' }
    }
  }

  /**
   * Enroll a new TOTP factor.
   * Returns { factorId, qrCode, uri, error }.
   */
  async function enrollMfa() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType:   'totp',
        issuer:       'MyAppLabs HQ',
        friendlyName: 'Authenticator App',
      })
      if (error) return { factorId: null, qrCode: null, uri: null, error: error.message }
      return {
        factorId: data.id,
        qrCode:   data.totp.qr_code,
        uri:      data.totp.uri,
        error:    null,
      }
    } catch {
      return { factorId: null, qrCode: null, uri: null, error: 'Failed to start enrollment.' }
    }
  }

  /**
   * Verify the first TOTP code during enrollment.
   * Lifts mfaStatus to 'verified' on success.
   * Returns { error }.
   */
  async function confirmMfaEnroll(factorId, challengeId, code) {
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim().replace(/\s/g, ''),
      })
      if (error) return { error: 'Incorrect code. Please try again.' }
      setMfaStatus('verified')
      return { error: null }
    } catch {
      return { error: 'An unexpected error occurred.' }
    }
  }

  /**
   * Sign out the current user.
   */
  async function logout() {
    clearDerivedKey()
    try {
      await supabase.auth.signOut()
      setUser(null)
      setMfaStatus('idle')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  function getFriendlyAuthError(message) {
    if (!message) return 'An unexpected error occurred. Please try again.'
    const lower = message.toLowerCase()
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials'))
      return 'Invalid email or password. Please try again.'
    if (lower.includes('email not confirmed'))
      return 'Your account email is not confirmed. Please check your inbox.'
    if (lower.includes('too many requests') || lower.includes('rate limit'))
      return 'Too many failed attempts. Please wait a moment before trying again.'
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch'))
      return 'Network error. Please check your internet connection.'
    if (lower.includes('user not found'))
      return 'No account found with this email address.'
    return 'An unexpected error occurred. Please try again.'
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, authError,
      clientRoleError,
      mfaStatus, setMfaStatus,
      login, logout,
      verifyMfa, enrollMfa, confirmMfaEnroll,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
