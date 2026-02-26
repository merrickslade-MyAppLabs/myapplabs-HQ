import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme, THEME_LABELS, THEME_DESCRIPTIONS, THEME_SWATCHES } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import ProfileModal from './ProfileModal'

/**
 * Settings slide-in panel — theme switcher, user info, sign out.
 */
export default function SettingsPanel({ isOpen, onClose }) {
  const { theme, setTheme, THEMES } = useTheme()
  const { user, logout } = useAuth()
  const toast = useToast()
  const [profileOpen, setProfileOpen] = useState(false)

  const avatarUrl = user?.user_metadata?.avatar_url || null

  async function handleLogout() {
    await logout()
    toast('Signed out successfully.', 'info')
    onClose()
  }

  async function handleThemeChange(newTheme) {
    await setTheme(newTheme)
    toast(`Theme changed to ${THEME_LABELS[newTheme]}.`, 'success')
  }

  const displayName = user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 500
            }}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100vh',
              width: '340px',
              background: 'var(--bg-modal)',
              borderLeft: '1px solid var(--border-color)',
              zIndex: 501,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            {/* Panel Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Settings
              </h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close settings">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

              {/* User Info */}
              <section style={{ marginBottom: '32px' }}>
                <div className="label" style={{ marginBottom: '12px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                  Signed In As
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: avatarUrl ? 'transparent' : 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                      textTransform: 'uppercase',
                      overflow: 'hidden'
                    }}
                  >
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (displayName?.[0] || '?')
                    }
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {displayName || 'User'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email}
                    </div>
                  </div>
                </div>
              </section>

              {/* Edit Profile button */}
              <button
                className="btn btn-secondary"
                onClick={() => setProfileOpen(true)}
                style={{ width: '100%', marginTop: '10px' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1.5 12.5c0-2.21 2.462-4 5.5-4s5.5 1.79 5.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Edit Profile
              </button>

              {/* Theme Switcher */}
              <section style={{ marginBottom: '32px' }}>
                <div className="label" style={{ marginBottom: '12px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                  Appearance
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(THEME_LABELS).map(([key, label]) => {
                    const swatch = THEME_SWATCHES[key]
                    const isActive = theme === key

                    return (
                      <button
                        key={key}
                        onClick={() => handleThemeChange(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          background: isActive ? 'var(--accent-primary-muted)' : 'var(--bg-tertiary)',
                          border: isActive
                            ? '1.5px solid var(--accent-primary)'
                            : '1.5px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          width: '100%'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--border-color-hover)'
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = 'var(--border-color)'
                        }}
                      >
                        {/* Swatch preview */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div
                            style={{
                              width: 38,
                              height: 28,
                              borderRadius: 6,
                              background: swatch.bg,
                              border: '1px solid rgba(0,0,0,0.15)',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '3px',
                              padding: '4px'
                            }}
                          >
                            <div style={{ width: 6, height: 12, borderRadius: 2, background: swatch.accent }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ height: 3, borderRadius: 2, background: swatch.text, opacity: 0.7 }} />
                              <div style={{ height: 3, borderRadius: 2, background: swatch.text, opacity: 0.4 }} />
                            </div>
                          </div>
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {label}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {THEME_DESCRIPTIONS[key]}
                          </div>
                        </div>

                        {isActive && (
                          <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* App Info */}
              <section>
                <div className="label" style={{ marginBottom: '12px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
                  About
                </div>
                <div style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    MyAppLabs HQ
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Version 1.0.0</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Internal Business Operations Hub</div>
                </div>
              </section>
            </div>

            {/* Sign Out Button */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
              <button
                className="btn btn-danger"
                onClick={handleLogout}
                style={{ width: '100%' }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M6 13H2.5A1.5 1.5 0 011 11.5v-8A1.5 1.5 0 012.5 2H6M10 10.5l3.5-3-3.5-3M13.5 7.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sign Out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>

    <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
