import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <div className="w-14 h-14 bg-navy rounded-2xl flex items-center justify-center shadow-modal">
        <svg width="28" height="28" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 11V7L7 3l5 4v4" stroke="white" strokeWidth="1.7" strokeLinejoin="round"/>
          <rect x="4.5" y="7.5" width="5" height="3.5" rx="0.5" fill="white"/>
        </svg>
      </div>
      <div className="text-center">
        <div className="text-xl font-bold text-navy tracking-tight">MyAppLabs</div>
        <div className="text-sm text-gray-500 mt-0.5">Client Portal</div>
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ step }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-6">
      {[0, 1].map(i => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width:  step === i ? 20 : 7,
            height: 7,
            background: step === i ? '#E8622A' : '#cbd5e1',
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { sendOtp, verifyOtp, roleError } = useAuth()

  // step: 'email' | 'otp'
  const [step,      setStep]    = useState('email')
  const [email,     setEmail]   = useState('')
  const [otp,       setOtp]     = useState('')
  const [loading,   setLoading] = useState(false)
  const [error,     setError]   = useState('')
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)  // seconds remaining
  const [rememberMe, setRememberMe] = useState(true)

  const emailRef   = useRef(null)
  const otpRef     = useRef(null)
  const cooldownRef = useRef(null)

  // Auto-focus on mount
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  // Focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRef.current?.focus(), 150)
    }
  }, [step])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    cooldownRef.current = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(cooldownRef.current)
  }, [resendCooldown])

  // ── Step 1: send OTP ─────────────────────────────────────────────────────

  async function handleSendOtp(e) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setLoading(true)
    setError('')
    const { error: err } = await sendOtp(trimmed)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setStep('otp')
    setResendCooldown(60)
  }

  // ── Step 2: verify OTP ───────────────────────────────────────────────────

  async function handleVerifyOtp(e) {
    e.preventDefault()
    const code = otp.trim().replace(/\s/g, '')
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your email.')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await verifyOtp(email.trim().toLowerCase(), code, rememberMe)
    setLoading(false)
    if (err) {
      setError(err)
      setOtp('')
      otpRef.current?.focus()
    }
    // On success — AuthContext onAuthStateChange fires → App.jsx re-renders to dashboard
  }

  // ── Resend ───────────────────────────────────────────────────────────────

  async function handleResend() {
    if (resendCooldown > 0 || resending) return
    setResending(true)
    setError('')
    const { error: err } = await sendOtp(email.trim().toLowerCase())
    setResending(false)
    if (err) {
      setError(err)
      return
    }
    setOtp('')
    setResendCooldown(60)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-3xl border border-gray-100 shadow-modal p-8 sm:p-10">
          <Logo />
          <StepDots step={step === 'email' ? 0 : 1} />

          {/* Role error — non-client tried to log in */}
          {roleError && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              This portal is for clients only. Please use MyAppLabs HQ.
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>

            {/* ── Step 1: Email ── */}
            {step === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-xl font-bold text-navy mb-1.5">
                  Sign in to your portal
                </h1>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Enter the email address registered to your account. We'll send you a one-time sign-in code.
                </p>

                <form onSubmit={handleSendOtp} noValidate>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email address
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    className="input mb-3"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    autoComplete="email"
                    required
                  />

                  {error && (
                    <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none">
                    <div className="relative flex-shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                      />
                      <div className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-[4px] border-2 transition-colors duration-150 flex items-center justify-center ${
                        rememberMe
                          ? 'bg-brand border-brand'
                          : 'bg-white border-gray-300'
                      }`}>
                        {rememberMe && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-gray-600">Remember me on this device</span>
                  </label>

                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={!email.trim() || loading}
                  >
                    {loading ? 'Sending code…' : 'Send sign-in code'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2: OTP ── */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-xl font-bold text-navy mb-1.5">
                  Check your email
                </h1>
                <p className="text-sm text-gray-500 mb-1 leading-relaxed">
                  We sent a 6-digit code to
                </p>
                <p className="text-sm font-semibold text-navy mb-5 truncate">
                  {email}
                </p>

                <form onSubmit={handleVerifyOtp} noValidate>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Sign-in code
                  </label>
                  <input
                    ref={otpRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    className="input mb-3 text-center text-2xl tracking-[0.4em] font-mono"
                    placeholder="000000"
                    value={otp}
                    onChange={e => {
                      // Allow digits and spaces only
                      setOtp(e.target.value.replace(/[^0-9 ]/g, ''))
                      setError('')
                    }}
                    autoComplete="one-time-code"
                  />

                  {error && (
                    <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn-primary w-full mb-4"
                    disabled={otp.replace(/\s/g, '').length !== 6 || loading}
                  >
                    {loading ? 'Verifying…' : 'Verify code'}
                  </button>
                </form>

                {/* Resend + back */}
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setError(''); setOtp('') }}
                    className="text-gray-400 hover:text-navy transition-colors"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || resending}
                    className="text-brand hover:text-brand-600 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {resending
                      ? 'Sending…'
                      : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend code'
                    }
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Having trouble? Contact{' '}
          <a
            href="mailto:hello@myapplabs.co.uk"
            className="text-brand hover:text-brand-600 transition-colors"
          >
            hello@myapplabs.co.uk
          </a>
        </p>
      </motion.div>
    </div>
  )
}
