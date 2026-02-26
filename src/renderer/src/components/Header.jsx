import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import SettingsPanel from './SettingsPanel'
import ProfileModal from './ProfileModal'

// Update states: null | 'available' | 'downloading' | 'downloaded'
function useAutoUpdater() {
  const [updateState, setUpdateState] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    const updater = window.electronUpdater
    if (!updater) return // Browser preview — skip

    updater.onAvailable(() => setUpdateState('available'))
    updater.onProgress((p) => {
      setUpdateState('downloading')
      setDownloadProgress(Math.round(p.percent ?? 0))
    })
    updater.onDownloaded(() => setUpdateState('downloaded'))

    return () => updater.removeAll()
  }, [])

  const download = () => {
    setUpdateState('downloading')
    window.electronUpdater.download()
  }

  const install = () => window.electronUpdater.install()

  return { updateState, downloadProgress, download, install }
}

function UpdateBadge({ updateState, downloadProgress, onDownload, onInstall }) {
  if (!updateState) return null

  if (updateState === 'available') {
    return (
      <button
        onClick={onDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Update Available
      </button>
    )
  }

  if (updateState === 'downloading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          color: '#f59e0b',
          fontSize: '12px',
          fontWeight: 600
        }}
      >
        <div style={{
          width: 80,
          height: 4,
          borderRadius: 2,
          background: 'rgba(245, 158, 11, 0.2)',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${downloadProgress}%`,
            background: '#f59e0b',
            borderRadius: 2,
            transition: 'width 0.3s ease'
          }} />
        </div>
        {downloadProgress}%
      </div>
    )
  }

  if (updateState === 'downloaded') {
    return (
      <button
        onClick={onInstall}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          color: '#22c55e',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Restart to Update
      </button>
    )
  }

  return null
}

/**
 * Top header bar — shows page title, user avatar, settings button, and update notifications.
 */
export default function Header({ title }) {
  const { user } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { updateState, downloadProgress, download, install } = useAutoUpdater()

  // Prefer full_name from metadata, fall back to email prefix
  const displayName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
    || 'User'
  const avatarUrl = user?.user_metadata?.avatar_url || null
  const initials = displayName
    .split(' ')
    .map((n) => n[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || '?'

  return (
    <>
      <header
        style={{
          height: 'var(--header-height)',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          flexShrink: 0
        }}
      >
        {/* Page title */}
        <div>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
            {title}
          </h1>
        </div>

        {/* Right side — update badge + user + settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UpdateBadge
            updateState={updateState}
            downloadProgress={downloadProgress}
            onDownload={download}
            onInstall={install}
          />

          {/* Settings button */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4"/>
              <path
                d="M9 3v1M9 14v1M3 9h1M14 9h1M4.93 4.93l.71.71M12.36 12.36l.71.71M4.93 13.07l.71-.71M12.36 5.64l.71-.71"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* User avatar — click to open profile */}
          <button
            onClick={() => setProfileOpen(true)}
            title="Edit profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 10px 5px 6px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'border-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-color-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: avatarUrl ? 'transparent' : 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
                letterSpacing: '0.5px',
                overflow: 'hidden'
              }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>
            <div style={{ maxWidth: '140px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textTransform: 'capitalize'
                }}
              >
                {displayName}
              </div>
            </div>
          </button>
        </div>
      </header>

      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
