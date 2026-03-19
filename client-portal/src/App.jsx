import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './context/AuthContext'
import { supabase } from './supabase/client'

// Pages — imported lazily once built; stubs used until then
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StageTrackerPage from './pages/StageTrackerPage'
import DocumentsPage from './pages/DocumentsPage'
import MessagesPage from './pages/MessagesPage'
import ReferralsPage from './pages/ReferralsPage'

// ── Page transition wrapper ────────────────────────────────────────────────────

function AnimatedPage({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-h-0 flex flex-col"
    >
      {children}
    </motion.div>
  )
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-brand text-white'
            : 'text-navy-300 hover:text-white hover:bg-white/10',
        ].join(' ')
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const Icons = {
  home: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="5.5" y="9" width="5" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  stages: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6 4h7M6 8h7M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  documents: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  messages: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 3h12v8H9l-3 3v-3H2V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  referrals: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="12" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 5.5l3.5-2M7 6.5l3.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2 13c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
}

// ── Top nav ───────────────────────────────────────────────────────────────────

function TopNav({ portalSettings, profile, onLogout }) {
  const ps = portalSettings ?? {}
  return (
    <header className="bg-navy text-white shadow-md flex-shrink-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-3 h-14">
        {/* Logo wordmark */}
        <div className="flex items-center gap-2.5 mr-4">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 11V7L7 3l5 4v4" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
              <rect x="4.5" y="7.5" width="5" height="3.5" rx="0.5" fill="white"/>
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight leading-none hidden sm:block">
            MyAppLabs
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          <NavItem to="/"          label="Dashboard"     icon={Icons.home} />
          {ps.show_stage_tracker !== false && (
            <NavItem to="/stages"    label="Project Stages" icon={Icons.stages} />
          )}
          {ps.show_documents !== false && (
            <NavItem to="/documents" label="Documents"      icon={Icons.documents} />
          )}
          {ps.show_messages !== false && (
            <NavItem to="/messages"  label="Messages"       icon={Icons.messages} />
          )}
          {ps.show_referrals !== false && (
            <NavItem to="/referrals" label="Referrals"      icon={Icons.referrals} />
          )}
        </nav>

        {/* User + sign out */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-xs text-navy-300 hidden md:block truncate max-w-[140px]">
            {profile?.full_name || profile?.email}
          </span>
          <button
            onClick={onLogout}
            className="text-navy-300 hover:text-white transition-colors duration-150 p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l4-3-4-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-4">
      <div className="w-10 h-10 bg-navy rounded-xl flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 11V7L7 3l5 4v4" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
          <rect x="4.5" y="7.5" width="5" height="3.5" rx="0.5" fill="white"/>
        </svg>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-brand"
            style={{ animation: `bounce 0.9s ease-in-out ${i * 0.18}s infinite alternate` }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          from { transform: translateY(0); opacity: 0.35; }
          to   { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Session timeout ───────────────────────────────────────────────────────────
// 55 min: show warning modal. 60 min: auto-logout + audit log entry.
// Any user interaction resets both timers (throttled to 10s to avoid churn).

const WARN_MS   = 55 * 60 * 1000
const LOGOUT_MS = 60 * 60 * 1000

function SessionTimeoutManager({ user, logout }) {
  const [showWarning, setShowWarning] = useState(false)
  const warnRef      = useRef(null)
  const logoutRef    = useRef(null)
  const lastResetRef = useRef(Date.now())

  const clearTimers = useCallback(() => {
    if (warnRef.current)   clearTimeout(warnRef.current)
    if (logoutRef.current) clearTimeout(logoutRef.current)
  }, [])

  const startTimers = useCallback(() => {
    clearTimers()
    setShowWarning(false)
    warnRef.current   = setTimeout(() => setShowWarning(true), WARN_MS)
    logoutRef.current = setTimeout(async () => {
      // Write audit log before signing out
      try {
        await supabase.from('audit_log').insert({
          user_id:     user.id,
          action:      'user_logout',
          entity_type: 'profile',
          entity_id:   user.id,
          metadata:    { reason: 'session_timeout_60min' },
        })
      } catch { /* non-fatal */ }
      await logout()
    }, LOGOUT_MS)
  }, [clearTimers, user, logout])

  // Throttled reset — only restart timers if 10s have passed since last reset
  const handleActivity = useCallback(() => {
    const now = Date.now()
    if (now - lastResetRef.current < 10_000) return
    lastResetRef.current = now
    if (!showWarning) startTimers()   // don't reset if warning is already showing
  }, [showWarning, startTimers])

  function stayLoggedIn() {
    setShowWarning(false)
    startTimers()
  }

  useEffect(() => {
    if (!user) return
    startTimers()
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    return () => {
      clearTimers()
      events.forEach(e => window.removeEventListener(e, handleActivity))
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,31,58,0.6)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-modal p-8 max-w-sm w-full text-center"
      >
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="#f59e0b" strokeWidth="1.8"/>
            <path d="M12 7v5l3 3" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-navy mb-2">Still there?</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          You'll be signed out automatically in 5 minutes due to inactivity.
        </p>
        <button onClick={stayLoggedIn} className="btn-primary w-full mb-3">
          Stay Logged In
        </button>
        <button
          onClick={logout}
          className="text-sm text-gray-400 hover:text-navy transition-colors"
        >
          Sign out now
        </button>
      </motion.div>
    </div>
  )
}

// ── Route guard ───────────────────────────────────────────────────────────────

/**
 * Wraps authenticated routes. Redirects to /login if no user.
 * Also gates individual sections based on portal settings.
 */
function ProtectedRoute({ children, settingKey }) {
  const { user, portalSettings } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (settingKey && portalSettings?.[settingKey] === false) {
    return <Navigate to="/" replace />
  }
  return children
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, profile, portalSettings, logout } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  // Unauthenticated — only show login
  if (!user) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
          <Route path="*"      element={<Navigate to="/login" replace />} />
        </Routes>
      </AnimatePresence>
    )
  }

  // Authenticated — full layout
  return (
    <div className="flex flex-col min-h-screen">
      <TopNav portalSettings={portalSettings} profile={profile} onLogout={logout} />
      <SessionTimeoutManager user={user} logout={logout} />

      <main className="flex-1 flex flex-col min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>

            <Route path="/" element={
              <ProtectedRoute>
                <AnimatedPage><DashboardPage /></AnimatedPage>
              </ProtectedRoute>
            } />

            <Route path="/stages" element={
              <ProtectedRoute settingKey="show_stage_tracker">
                <AnimatedPage><StageTrackerPage /></AnimatedPage>
              </ProtectedRoute>
            } />

            <Route path="/documents" element={
              <ProtectedRoute settingKey="show_documents">
                <AnimatedPage><DocumentsPage /></AnimatedPage>
              </ProtectedRoute>
            } />

            <Route path="/messages" element={
              <ProtectedRoute settingKey="show_messages">
                <AnimatedPage><MessagesPage /></AnimatedPage>
              </ProtectedRoute>
            } />

            <Route path="/referrals" element={
              <ProtectedRoute settingKey="show_referrals">
                <AnimatedPage><ReferralsPage /></AnimatedPage>
              </ProtectedRoute>
            } />

            {/* Redirect /login → / when already authenticated */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*"      element={<Navigate to="/" replace />} />

          </Routes>
        </AnimatePresence>
      </main>
    </div>
  )
}
