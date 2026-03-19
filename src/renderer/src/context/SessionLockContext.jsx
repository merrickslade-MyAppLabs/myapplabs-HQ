import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { clearDerivedKey } from '../utils/crypto'

const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

const SessionLockContext = createContext({
  locked: false,
  unlock: async () => {},
})

/**
 * Manages the 30-minute inactivity session lock.
 *
 * Behaviour:
 * - Any user interaction (mouse, keyboard, scroll, touch) resets the timer.
 * - When the Electron window is blurred, the timer is paused and the blur
 *   timestamp is saved. On refocus, if ≥30 min elapsed, lock immediately.
 * - On lock: clears the in-memory AES derived key (providers module).
 * - Unlock requires the user to re-authenticate via the SessionLockScreen.
 *
 * Only active when a user is authenticated — pass `active={!!user}`.
 */
export function SessionLockProvider({ children, active }) {
  const [locked, setLocked] = useState(false)
  const timerRef       = useRef(null)
  const blurTimeRef    = useRef(null)
  const lockedRef      = useRef(false)   // kept in sync to avoid stale closures

  // Keep lockedRef in sync with locked state
  useEffect(() => { lockedRef.current = locked }, [locked])

  const lock = useCallback(() => {
    if (lockedRef.current) return
    clearDerivedKey()               // Wipe in-memory AES key
    setLocked(true)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(lock, TIMEOUT_MS)
  }, [lock])

  const resetTimer = useCallback(() => {
    if (lockedRef.current) return   // don't reset while locked
    startTimer()
  }, [startTimer])

  // ── Window focus / blur via Electron IPC ─────────────────────────────────

  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined' || !window.electronApp) return

    const removeFocus = window.electronApp.onFocus(() => {
      if (blurTimeRef.current !== null) {
        const elapsed = Date.now() - blurTimeRef.current
        blurTimeRef.current = null
        if (elapsed >= TIMEOUT_MS) {
          lock()
          return
        }
      }
      if (!lockedRef.current) startTimer()
    })

    const removeBlur = window.electronApp.onBlur(() => {
      blurTimeRef.current = Date.now()
      // Pause the timer while the window is out of focus
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    })

    return () => {
      removeFocus?.()
      removeBlur?.()
    }
  }, [active, lock, startTimer])

  // ── DOM interaction listeners ─────────────────────────────────────────────

  useEffect(() => {
    if (!active || locked) return

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    startTimer()   // arm the timer when the effect runs

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [active, locked, resetTimer, startTimer])

  // ── Unlock ────────────────────────────────────────────────────────────────

  /**
   * Re-authenticate after lock.
   * Called by SessionLockScreen with the user's email + password.
   * Returns { error } where error is a string or null.
   */
  async function unlock(email, password) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const msg = error.message?.toLowerCase() ?? ''
        if (msg.includes('invalid') || msg.includes('credentials')) {
          return { error: 'Incorrect password. Please try again.' }
        }
        return { error: 'Re-authentication failed. Please try again.' }
      }
      setLocked(false)
      blurTimeRef.current = null
      startTimer()
      return { error: null }
    } catch {
      return { error: 'An unexpected error occurred.' }
    }
  }

  return (
    <SessionLockContext.Provider value={{ locked, unlock }}>
      {children}
    </SessionLockContext.Provider>
  )
}

export function useSessionLock() {
  return useContext(SessionLockContext)
}
