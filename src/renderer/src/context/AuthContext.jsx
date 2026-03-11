import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import { clearDerivedKey } from '../utils/crypto'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    // Restore any existing session from localStorage on mount
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('Session restore error:', error)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Sign in with email and password.
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

      return { user: data.user, error: null }
    } catch (err) {
      const message = 'An unexpected error occurred. Please try again.'
      setAuthError(message)
      return { user: null, error: message }
    }
  }

  /**
   * Sign out the current user.
   */
  async function logout() {
    clearDerivedKey() // Wipe in-memory AES key before sign-out
    try {
      await supabase.auth.signOut()
      setUser(null)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  /**
   * Map Supabase plain-English error messages to user-friendly strings.
   */
  function getFriendlyAuthError(message) {
    if (!message) return 'An unexpected error occurred. Please try again.'
    const lower = message.toLowerCase()

    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'Invalid email or password. Please try again.'
    }
    if (lower.includes('email not confirmed')) {
      return 'Your account email is not confirmed. Please check your inbox.'
    }
    if (lower.includes('too many requests') || lower.includes('rate limit')) {
      return 'Too many failed attempts. Please wait a moment before trying again.'
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
      return 'Network error. Please check your internet connection.'
    }
    if (lower.includes('user not found')) {
      return 'No account found with this email address.'
    }
    return 'An unexpected error occurred. Please try again.'
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, logout }}>
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
