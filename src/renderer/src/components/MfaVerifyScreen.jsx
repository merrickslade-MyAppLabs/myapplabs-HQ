import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

/**
 * Full-screen MFA gate shown after password login for admin/super_admin users.
 *
 * Mode 'enroll':  User has no TOTP factor yet. Shows QR code + setup instructions.
 *                 On first successful code entry the factor is confirmed and the
 *                 user proceeds into the app.
 *
 * Mode 'verify':  User has an enrolled factor. Shows a code input only.
 *                 On success mfaStatus is lifted to 'verified'.
 */
export default function MfaVerifyScreen({ mode }) {
  const { enrollMfa, verifyMfa, confirmMfaEnroll, logout } = useAuth()

  // Enroll state
  const [enrollData,   setEnrollData]   = useState(null)   // { factorId, qrCode, uri }
  const [challengeId,  setChallengeId]  = useState(null)
  const [enrollLoading, setEnrollLoading] = useState(false)

  // Shared
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showUri, setShowUri] = useState(false)

  const inputRef = useRef(null)

  // ── Enrollment setup ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'enroll') return
    startEnroll()
  }, [mode])

  async function startEnroll() {
    setEnrollLoading(true)
    setError('')
    const { factorId, qrCode, uri, error: err } = await enrollMfa()
    setEnrollLoading(false)

    if (err) {
      setError(err)
      return
    }

    // Get a challenge for the initial verification step
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) {
      setError('Failed to start MFA challenge. Please try again.')
      return
    }

    setEnrollData({ factorId, qrCode, uri })
    setChallengeId(challengeData.id)
    setTimeout(() => inputRef.current?.focus(), 200)
  }

  // ── Verify (already enrolled) ─────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'verify') return
    setTimeout(() => inputRef.current?.focus(), 120)
  }, [mode])

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setError('')

    let result
    if (mode === 'enroll') {
      result = await confirmMfaEnroll(enrollData.factorId, challengeId, code)
    } else {
      result = await verifyMfa(code)
    }

    setLoading(false)
    if (result.error) {
      setError(result.error)
      setCode('')
      inputRef.current?.focus()
    }
    // On success, AuthContext sets mfaStatus = 'verified' and App.jsx re-renders
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 24
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        style={{
          width: '100%', maxWidth: mode === 'enroll' ? 440 : 360,
          background: 'var(--bg-modal)',
          borderRadius: 16, border: '1px solid var(--border-color)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
          padding: '36px 32px',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, marginBottom: 20,
          background: 'rgba(99,102,241,0.12)', border: '1.5px solid #6366f1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#6366f1" strokeWidth="1.8"/>
            <rect x="12" y="3" width="7" height="7" rx="1.5" stroke="#6366f1" strokeWidth="1.8"/>
            <rect x="3" y="12" width="7" height="7" rx="1.5" stroke="#6366f1" strokeWidth="1.8"/>
            <rect x="13.5" y="13.5" width="2" height="2" fill="#6366f1"/>
            <rect x="17" y="13.5" width="2" height="2" fill="#6366f1"/>
            <rect x="13.5" y="17" width="2" height="2" fill="#6366f1"/>
            <rect x="17" y="17" width="2" height="2" fill="#6366f1"/>
          </svg>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          {mode === 'enroll' ? 'Set up two-factor authentication' : 'Two-factor authentication'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          {mode === 'enroll'
            ? 'Your account requires 2FA. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code.'
            : 'Enter the 6-digit code from your authenticator app to continue.'
          }
        </div>

        {/* ── Enrollment: QR code ── */}
        {mode === 'enroll' && (
          <div style={{ marginBottom: 24 }}>
            {enrollLoading ? (
              <div style={{
                width: 160, height: 160, borderRadius: 10,
                background: 'var(--bg-tertiary)', margin: '0 auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: 12
              }}>
                Loading…
              </div>
            ) : enrollData?.qrCode ? (
              <div style={{ textAlign: 'center' }}>
                {/* QR code is a data: URI from Supabase */}
                <img
                  src={enrollData.qrCode}
                  alt="TOTP QR code"
                  style={{ width: 160, height: 160, borderRadius: 10, border: '4px solid #fff' }}
                />
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowUri(p => !p)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'underline'
                    }}
                  >
                    {showUri ? 'Hide' : 'Can\'t scan?'} manual entry key
                  </button>
                  {showUri && enrollData.uri && (
                    <div style={{
                      marginTop: 6, padding: '8px 10px', borderRadius: 7,
                      background: 'var(--bg-tertiary)', fontSize: 11,
                      color: 'var(--text-secondary)', wordBreak: 'break-all',
                      fontFamily: 'monospace', lineHeight: 1.5,
                      border: '1px solid var(--border-color)'
                    }}>
                      {/* Extract the secret from the URI (otpauth://totp/...?secret=XXX...) */}
                      {(() => {
                        try {
                          const secret = new URL(enrollData.uri).searchParams.get('secret')
                          return secret ? `Secret: ${secret}` : enrollData.uri
                        } catch {
                          return enrollData.uri
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Code input ── */}
        <form onSubmit={handleSubmit}>
          <label style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.5px', color: 'var(--text-muted)',
            display: 'block', marginBottom: 6
          }}>
            6-digit code
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9 ]*"
            maxLength={7}
            className="input"
            placeholder="000 000"
            value={code}
            onChange={e => { setCode(e.target.value); setError('') }}
            disabled={loading || (mode === 'enroll' && enrollLoading)}
            autoComplete="one-time-code"
            style={{
              width: '100%', textAlign: 'center', fontSize: 20,
              letterSpacing: '6px', fontFamily: 'monospace',
              boxSizing: 'border-box', marginBottom: 12
            }}
          />

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
            disabled={!code.trim() || loading || (mode === 'enroll' && (enrollLoading || !enrollData))}
            style={{ width: '100%' }}
          >
            {loading
              ? (mode === 'enroll' ? 'Setting up…' : 'Verifying…')
              : (mode === 'enroll' ? 'Confirm & Enable 2FA' : 'Verify')
            }
          </button>
        </form>

        {/* Sign out link */}
        <button
          type="button"
          onClick={logout}
          style={{
            width: '100%', marginTop: 14, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 12.5, color: 'var(--text-muted)',
            textDecoration: 'underline', padding: 0
          }}
        >
          Sign out and use a different account
        </button>
      </motion.div>
    </div>
  )
}
