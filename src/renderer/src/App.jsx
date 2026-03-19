import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { UnreadMessagesProvider } from './context/UnreadMessagesContext'
import { SessionLockProvider, useSessionLock } from './context/SessionLockContext'
import SessionLockScreen from './components/SessionLockScreen'
import MfaVerifyScreen from './components/MfaVerifyScreen'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import LoginPage from './pages/Login/LoginPage'
import HomePage from './pages/Home/HomePage'
// Prompt Builder retired — replaced by Script Library
import RevenuePage from './pages/Revenue/RevenuePage'
import ExpensesPage from './pages/Expenses/ExpensesPage'
import IdeasPage from './pages/Ideas/IdeasPage'
import NotesPage from './pages/Notes/NotesPage'
import ProjectsPage from './pages/Projects/ProjectsPage'
import WorkflowGuidePage from './pages/Workflow/WorkflowGuidePage'
import ScriptLibraryPage from './pages/Scripts/ScriptLibraryPage'
import PortalControlsPage from './pages/PortalControls/PortalControlsPage'
import InternalProjectsPage from './pages/Internal/InternalProjectsPage'
import ProvidersPage from './pages/Providers/ProvidersPage'
import InvoicesPage from './pages/Invoices/InvoicesPage'
import MessagesPage from './pages/Messages/MessagesPage'
import TasksPage from './pages/Tasks/TasksPage'

// ── Page stub — shown for routes not yet built ────────────────────────────────
// Replaced page by page as each section is implemented in Part 3.
function ComingSoon({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)'
    }}>
      <div style={{ fontSize: 32 }}>🚧</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>This page is being built — coming soon.</div>
    </div>
  )
}

// ── Route → header title mapping ─────────────────────────────────────────────
const PAGE_TITLES = {
  '/':                'Home',
  '/projects':        'Projects',
  '/messages':        'Messages',
  '/invoices':        'Invoices',
  '/workflow':        'Workflow Guide',
  '/scripts':         'Script Library',
  '/tasks':           'Tasks',
  '/revenue':         'Revenue & Financials',
  '/expenses':        'Expenses',
  '/ideas':           'Ideas Pipeline',
  '/internal':        'Internal Projects',
  '/notes':           'Notes',
  '/providers':       'Providers',
  '/portal-controls': 'Portal Controls',
}

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const match = Object.keys(PAGE_TITLES).find(
    key => key !== '/' && pathname.startsWith(key)
  )
  return match ? PAGE_TITLES[match] : 'MyAppLabs HQ'
}

/** Wraps each page with a fade+slide animation on route change. */
function AnimatedPage({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Renders the session lock overlay when inactive for 30 minutes.
 * Wraps AuthenticatedLayout so the lock screen appears above all content.
 */
function LockedWrapper({ children }) {
  const { locked } = useSessionLock()
  return (
    <>
      {children}
      <AnimatePresence>
        {locked && <SessionLockScreen key="session-lock" />}
      </AnimatePresence>
    </>
  )
}

/** The main authenticated layout — sidebar + header + routed content. */
function AuthenticatedLayout() {
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Header title={pageTitle} />
        <div className="content-area">
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>

              <Route path="/" element={
                <AnimatedPage><HomePage /></AnimatedPage>
              } />

              {/* ── Client work ── */}
              <Route path="/projects/*" element={
                <AnimatedPage><ProjectsPage /></AnimatedPage>
              } />
              <Route path="/messages" element={
                <AnimatedPage><MessagesPage /></AnimatedPage>
              } />
              <Route path="/invoices" element={
                <AnimatedPage><InvoicesPage /></AnimatedPage>
              } />

              {/* ── Tools ── */}
              <Route path="/workflow" element={
                <AnimatedPage><WorkflowGuidePage /></AnimatedPage>
              } />
              <Route path="/scripts" element={
                <AnimatedPage><ScriptLibraryPage /></AnimatedPage>
              } />
              <Route path="/tasks" element={
                <AnimatedPage><TasksPage /></AnimatedPage>
              } />

              {/* ── Finance ── */}
              <Route path="/revenue" element={
                <AnimatedPage><RevenuePage /></AnimatedPage>
              } />
              <Route path="/expenses" element={
                <AnimatedPage><ExpensesPage /></AnimatedPage>
              } />

              {/* ── Studio ── */}
              <Route path="/ideas" element={
                <AnimatedPage><IdeasPage /></AnimatedPage>
              } />
              <Route path="/internal" element={
                <AnimatedPage><InternalProjectsPage /></AnimatedPage>
              } />
              <Route path="/notes" element={
                <AnimatedPage><NotesPage /></AnimatedPage>
              } />
              <Route path="/providers" element={
                <AnimatedPage><ProvidersPage /></AnimatedPage>
              } />
              <Route path="/portal-controls" element={
                <AnimatedPage><PortalControlsPage /></AnimatedPage>
              } />

              {/* Catch-all — redirect unknown paths to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** Full-screen loading state while Supabase resolves the auth session. */
function LoadingScreen() {
  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', flexDirection: 'column', gap: 16
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--accent-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px var(--accent-primary-muted)'
      }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 18V10L11 4l8 6v8" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
          <rect x="8" y="12" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 6 }} aria-label="Loading">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: `loadingBounce 0.9s ease-in-out ${i * 0.18}s infinite alternate`
          }} />
        ))}
      </div>
      <style>{`
        @keyframes loadingBounce {
          from { transform: translateY(0); opacity: 0.35; }
          to   { transform: translateY(-7px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  const { user, loading, mfaStatus } = useAuth()

  if (loading || mfaStatus === 'checking') return <LoadingScreen />
  if (!user) return <LoginPage />

  // MFA gate — admin/super_admin must complete MFA before accessing the app
  if (mfaStatus === 'needs_enroll') return <MfaVerifyScreen mode="enroll" />
  if (mfaStatus === 'needs_verify') return <MfaVerifyScreen mode="verify" />

  // Wrap authenticated layout with UnreadMessagesProvider (Sidebar badge, Home card)
  // and SessionLockProvider (30-min inactivity auto-lock).
  return (
    <UnreadMessagesProvider>
      <SessionLockProvider active={!!user}>
        <LockedWrapper>
          <AuthenticatedLayout />
        </LockedWrapper>
      </SessionLockProvider>
    </UnreadMessagesProvider>
  )
}
