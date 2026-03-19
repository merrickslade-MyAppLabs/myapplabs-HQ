import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useSessionLock } from '../context/SessionLockContext'
import { useAuth } from '../context/AuthContext'

/**
 * Full-screen overlay shown after 30 minutes of inactivity.
 * Requires password re-entry to unlock — does not allow switching accounts.
 */
export default function SessionLockScreen() {
  const { unlock } = useSessionLock()
  const { user }   = useAuth()

  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const inputRef = useRef(null)

  const email = user?.email ?? ''
  const displayName = email.split('@')[0]?.replace(/[._-]/g, ' ') || 'User'

  // Focus the password field on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')
    const { error: err } = await unlock(email, password)
    setLoading(false)
    if (err) {
      setError(err)
      setPassword('')
      inputRef.current?.focus()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.06 }}
        style={{
          width: '100%', maxWidth: 360,
          padding: '36px 32px',
          background: 'var(--bg-modal)',
          borderRadius: 16,
          border: '1px solid var(--border-color)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}
      >
        {/* Lock icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, marginBottom: 20,
          background: 'var(--accent-primary-muted)',
          border: '1.5px solid var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <rect x="4" y="10" width="14" height="10" rx="2.5" stroke="var(--accent-primary)" strokeWidth="1.8"/>
            <path d="M7 10V7a4 4 0 018 0v3" stroke="var(--accent-primary)" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="11" cy="15" r="1.5" fill="var(--accent-primary)"/>
          </svg>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, textAlign: 'center' }}>
          Session locked
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center', lineHeight: 1.5 }}>
          You've been away for a while.<br />
          Enter your password to continue as <strong style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{displayName}</strong>.
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          {/* Email (read-only display) */}
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            {email}
          </div>

          {/* Password input */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              className="input"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              disabled={loading}
              autoComplete="current-password"
              style={{ width: '100%', paddingRight: 40, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowPw(p => !p)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                padding: 4, display: 'flex', alignItems: 'center'
              }}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div style={{
              fontSize: 12.5, color: '#ef4444', marginBottom: 10, padding: '7px 10px',
              background: 'rgba(239,68,68,0.08)', borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.2)'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!password || loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
