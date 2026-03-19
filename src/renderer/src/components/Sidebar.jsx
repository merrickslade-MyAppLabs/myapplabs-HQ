import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUnreadMessages } from '../context/UnreadMessagesContext'

// ── Nav item definitions ──────────────────────────────────────────────────────
// Sections are separated by dividers. showBadge items render the unread count.

const NAV_SECTIONS = [
  // ─ Dashboard
  [
    {
      path: '/',
      label: 'Home',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 7.5L9 2l7 5.5V16a1 1 0 01-1 1H3a1 1 0 01-1-1V7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M6 17v-6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      )
    },
  ],
  // ─ Client work
  [
    {
      path: '/projects',
      label: 'Projects',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="10" y="2" width="6" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      )
    },
    {
      path: '/messages',
      label: 'Messages',
      showBadge: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 4a1 1 0 011-1h12a1 1 0 011 1v7a1 1 0 01-1 1h-4l-3 3-3-3H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      path: '/invoices',
      label: 'Invoices',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 7h8M5 10h5M5 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ],
  // ─ Tools
  [
    {
      path: '/workflow',
      label: 'Workflow Guide',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 2a5 5 0 100 10A5 5 0 009 2zM9 7v3M9 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="9" cy="7" r="1" fill="currentColor"/>
        </svg>
      )
    },
    {
      path: '/scripts',
      label: 'Script Library',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 4h12M3 8h8M3 12h10M3 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      path: '/tasks',
      label: 'Tasks',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 9l2.5 2.5L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
  ],
  // ─ Finance
  [
    {
      path: '/revenue',
      label: 'Revenue',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 2v16M5 6c0-1.1 1.8-2 4-2s4 .9 4 2-1.8 2-4 2-4 .9-4 2 1.8 2 4 2 4-.9 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      path: '/expenses',
      label: 'Expenses',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="6" cy="11" r="1.2" fill="currentColor"/>
        </svg>
      )
    },
  ],
  // ─ Studio
  [
    {
      path: '/ideas',
      label: 'Ideas Pipeline',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 2a5 5 0 015 5c0 2-1.2 3.8-3 4.6V13H7v-1.4C5.2 10.8 4 9 4 7a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M7 15h4M7.5 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      path: '/internal',
      label: 'Internal Projects',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 3V2M12 3V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M5 9l2.5 2.5L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      path: '/notes',
      label: 'Notes',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      path: '/providers',
      label: 'Providers',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      )
    },
    {
      path: '/portal-controls',
      label: 'Portal Controls',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 9c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3M9 2v2M9 14v2M2 9h2M14 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ],
]

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH  = 220

export default function Sidebar() {
  const location = useLocation()
  const { unreadCount } = useUnreadMessages()

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)) } catch {}
  }, [collapsed])

  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        flexShrink: 0,
        height: '100vh',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease'
      }}
    >
      {/* Logo */}
      <div style={{
        height: 'var(--header-height)',
        display: 'flex', alignItems: 'center',
        padding: collapsed ? 0 : '0 18px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: '1px solid var(--border-color)',
        gap: 10, flexShrink: 0,
        transition: 'padding 0.2s ease'
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 13V7l5-4 5 4v6" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="6" y="9" width="4" height="4" rx="0.5" stroke="white" strokeWidth="1.5"/>
          </svg>
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
              MyAppLabs
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              HQ
            </div>
          </div>
        )}
      </div>

      {/* Navigation sections */}
      <div style={{ flex: 1, padding: collapsed ? '8px 6px' : '8px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {/* Divider between sections (not before the first) */}
            {sectionIdx > 0 && (
              <div style={{
                height: 1, background: 'var(--border-color)',
                margin: collapsed ? '6px 4px' : '6px 6px'
              }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {section.map(item => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)

                const badge = item.showBadge && unreadCount > 0 ? unreadCount : null

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: 9,
                        padding: collapsed ? '8px 0' : '8px 10px 8px 8px',
                        borderRadius: 'var(--radius-md)',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        background: isActive ? 'var(--accent-primary-muted)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        borderLeft: collapsed ? 'none' : `3px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                        position: 'relative'
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--bg-tertiary)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }
                      }}
                    >
                      {/* Icon — badge dot shown when collapsed */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {item.icon}
                        {collapsed && badge && (
                          <div style={{
                            position: 'absolute', top: -3, right: -3,
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#ef4444',
                            border: '1.5px solid var(--bg-sidebar)'
                          }} aria-hidden="true" />
                        )}
                      </div>

                      {/* Label + count badge (expanded mode) */}
                      {!collapsed && (
                        <>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            {item.label}
                          </span>
                          {badge && (
                            <span
                              aria-label={`${badge} unread`}
                              style={{
                                fontSize: 10, fontWeight: 700,
                                padding: '1px 6px', borderRadius: 99,
                                background: '#ef4444', color: '#fff',
                                flexShrink: 0
                              }}
                            >
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom — version + collapse toggle */}
      <div style={{
        padding: collapsed ? '10px 6px' : '10px 18px',
        borderTop: '1px solid var(--border-color)',
        flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between', gap: 8
      }}>
        {!collapsed && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            MyAppLabs HQ v{__APP_VERSION__}
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 4, borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s ease, background 0.15s ease', flexShrink: 0
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-tertiary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
        >
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
            aria-hidden="true"
          >
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </nav>
  )
}
