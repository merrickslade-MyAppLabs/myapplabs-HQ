import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import LoginPage from './pages/Login/LoginPage'
import HomePage from './pages/Home/HomePage'
import ClientsPage from './pages/Clients/ClientsPage'
import TasksPage from './pages/Tasks/TasksPage'
import PromptBuilderPage from './pages/PromptBuilder/PromptBuilderPage'
import RevenuePage from './pages/Revenue/RevenuePage'
import ExpensesPage from './pages/Expenses/ExpensesPage'
import IdeasPage from './pages/Ideas/IdeasPage'
import NotesPage from './pages/Notes/NotesPage'
import InternalProjectsPage from './pages/Internal/InternalProjectsPage'

// Map route paths to header titles
const PAGE_TITLES = {
  '/': 'Home',
  '/clients': 'Clients & Projects',
  '/internal': 'Internal Projects',
  '/tasks': 'Task Board',
  '/prompts': 'Prompt Builder',
  '/revenue': 'Revenue & Financials',
  '/expenses': 'Expenses',
  '/ideas': 'Ideas Pipeline',
  '/notes': 'Notes'
}

function getPageTitle(pathname) {
  // Exact match first, then prefix match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const match = Object.keys(PAGE_TITLES).find(
    (key) => key !== '/' && pathname.startsWith(key)
  )
  return match ? PAGE_TITLES[match] : 'MyAppLabs HQ'
}

/**
 * Wraps each page with a fade+slide animation.
 * key prop on this must change on route change to trigger exit/enter.
 */
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
 * The main authenticated layout — sidebar + header + routed content.
 */
function AuthenticatedLayout() {
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Header title={pageTitle} />
        <div className="content-area">
          {/*
            AnimatePresence with mode="wait" ensures exit animation
            finishes before the next page mounts.
          */}
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <AnimatedPage><HomePage /></AnimatedPage>
                }
              />
              <Route
                path="/clients/*"
                element={
                  <AnimatedPage><ClientsPage /></AnimatedPage>
                }
              />
              <Route
                path="/internal"
                element={
                  <AnimatedPage><InternalProjectsPage /></AnimatedPage>
                }
              />
              <Route
                path="/tasks"
                element={
                  <AnimatedPage><TasksPage /></AnimatedPage>
                }
              />
              <Route
                path="/prompts"
                element={
                  <AnimatedPage><PromptBuilderPage /></AnimatedPage>
                }
              />
              <Route
                path="/revenue"
                element={
                  <AnimatedPage><RevenuePage /></AnimatedPage>
                }
              />
              <Route
                path="/expenses"
                element={
                  <AnimatedPage><ExpensesPage /></AnimatedPage>
                }
              />
              <Route
                path="/ideas"
                element={
                  <AnimatedPage><IdeasPage /></AnimatedPage>
                }
              />
              <Route
                path="/notes"
                element={
                  <AnimatedPage><NotesPage /></AnimatedPage>
                }
              />
              {/* Redirect any unknown routes to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/**
 * Full-screen loading indicator while Firebase resolves auth state.
 */
function LoadingScreen() {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--accent-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px var(--accent-primary-muted)'
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M3 18V10L11 4l8 6v8" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
          <rect x="8" y="12" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
        </svg>
      </div>
      {/* Animated dots */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              animation: `loadingBounce 0.9s ease-in-out ${i * 0.18}s infinite alternate`
            }}
          />
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
  const { user, loading } = useAuth()

  // Wait for Firebase auth state to resolve
  if (loading) return <LoadingScreen />

  // Not authenticated — show login
  if (!user) return <LoginPage />

  // Authenticated — render full app layout
  return <AuthenticatedLayout />
}
