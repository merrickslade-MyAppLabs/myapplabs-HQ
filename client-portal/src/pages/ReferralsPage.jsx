import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const isConverted = status === 'converted'
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{
        background: isConverted ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.08)',
        color:      isConverted ? '#10b981'               : '#d97706',
      }}
    >
      {isConverted ? 'Converted' : 'Pending'}
    </span>
  )
}

// ── Referral row ──────────────────────────────────────────────────────────────

function ReferralRow({ referral }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: 'rgba(11,31,58,0.06)', color: '#0B1F3A' }}>
        {referral.friend_name?.charAt(0)?.toUpperCase() ?? '?'}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-navy truncate">{referral.friend_name}</div>
        <div className="text-xs text-gray-400 truncate mt-0.5">{referral.friend_email}</div>
      </div>

      {/* Date */}
      <div className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
        {fmtDate(referral.created_at)}
      </div>

      {/* Status */}
      <StatusBadge status={referral.status} />
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9" cy="7" r="4" stroke="#9ca3af" strokeWidth="1.5"/>
          <path d="M2 20c0-3.31 3.13-6 7-6" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M16 12v6M13 15h6" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="text-sm font-semibold text-gray-500 mb-1">No referrals yet</div>
      <div className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
        Use the form above to refer a friend or colleague. We'll reach out to them directly.
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const { user } = useAuth()

  // Form state
  const [friendName,  setFriendName]  = useState('')
  const [friendEmail, setFriendEmail] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [formError,   setFormError]   = useState(null)
  const [submitted,   setSubmitted]   = useState(false)

  // History state
  const [referrals, setReferrals] = useState([])
  const [loading,   setLoading]   = useState(true)

  // ── Fetch history ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    supabase
      .from('referrals')
      .select('id, friend_name, friend_email, status, created_at')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setReferrals(data ?? [])
        setLoading(false)
      })
  }, [user])

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    setSubmitted(false)

    const name  = friendName.trim()
    const email = friendEmail.trim().toLowerCase()

    // Validate
    if (!name) {
      setFormError("Please enter your friend's name.")
      return
    }
    if (!email || !isValidEmail(email)) {
      setFormError('Please enter a valid email address.')
      return
    }

    setSubmitting(true)

    // Duplicate check — has this user already referred this email?
    const { data: existing } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_by', user.id)
      .eq('friend_email', email)
      .maybeSingle()

    if (existing) {
      setFormError("You've already referred someone with that email address.")
      setSubmitting(false)
      return
    }

    // Insert
    const { data: inserted, error } = await supabase
      .from('referrals')
      .insert({ referred_by: user.id, friend_name: name, friend_email: email, status: 'pending' })
      .select('id, friend_name, friend_email, status, created_at')
      .single()

    if (error) {
      setFormError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    // Prepend to history, clear form
    setReferrals(prev => [inserted, ...prev])
    setFriendName('')
    setFriendEmail('')
    setSubmitted(true)
    setSubmitting(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy">Refer a Friend</h1>
          <p className="text-sm text-gray-500 mt-1">
            Know someone who could use our help? Send them our way.
          </p>
        </div>

        {/* Scheme explanation */}
        <div className="card p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(232,98,42,0.08)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="7" cy="6" r="3" stroke="#E8622A" strokeWidth="1.5"/>
                <path d="M1 18c0-3.31 2.69-6 6-6" stroke="#E8622A" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="14" cy="10" r="3" stroke="#E8622A" strokeWidth="1.5"/>
                <path d="M11 18c0-2.76 1.34-4 3-4s3 1.24 3 4" stroke="#E8622A" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-navy mb-1">How it works</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Refer a friend or colleague who needs an app or website built. If they go ahead with a project,
                we'll send you a <span className="font-semibold text-navy">thank-you gift</span> as our way of saying thanks.
                There's no limit on how many people you can refer.
              </p>
            </div>
          </div>
        </div>

        {/* Referral form */}
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-bold text-navy mb-4">Submit a referral</h2>

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5" htmlFor="friend-name">
                  Friend's name
                </label>
                <input
                  id="friend-name"
                  type="text"
                  value={friendName}
                  onChange={e => { setFriendName(e.target.value); setFormError(null); setSubmitted(false) }}
                  placeholder="Jane Smith"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ '--tw-ring-color': '#E8622A' }}
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5" htmlFor="friend-email">
                  Friend's email address
                </label>
                <input
                  id="friend-email"
                  type="email"
                  value={friendEmail}
                  onChange={e => { setFriendEmail(e.target.value); setFormError(null); setSubmitted(false) }}
                  placeholder="jane@example.com"
                  autoComplete="off"
                  inputMode="email"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ '--tw-ring-color': '#E8622A' }}
                  disabled={submitting}
                />
              </div>

            </div>

            {/* Error message */}
            <AnimatePresence>
              {formError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 text-xs text-red-500 font-medium"
                >
                  {formError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Success message */}
            <AnimatePresence>
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 flex items-center gap-2 text-xs font-semibold"
                  style={{ color: '#10b981' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Referral submitted — thank you!
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" className="animate-spin" aria-hidden="true">
                    <circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                    <path d="M10.5 6A4.5 4.5 0 016 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Submitting…
                </>
              ) : (
                'Submit Referral'
              )}
            </button>
          </form>
        </div>

        {/* Referral history */}
        <div>
          <h2 className="text-sm font-bold text-navy mb-3">Your referrals</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                  <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-36 bg-gray-100 animate-pulse rounded-lg" />
                    <div className="h-3 w-48 bg-gray-100 animate-pulse rounded-lg" />
                  </div>
                  <div className="w-16 h-6 bg-gray-100 animate-pulse rounded-full flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : referrals.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {referrals.map(r => (
                  <ReferralRow key={r.id} referral={r} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
