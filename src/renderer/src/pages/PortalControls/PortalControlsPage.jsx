import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { addAuditLog } from '../../supabase/database'
import { useToast } from '../../components/ui/Toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(dateStr) {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="pc-sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange, disabled, label, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '12px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={id}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'block' }}
        >
          {label}
        </label>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        )}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
          background: checked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{
          position: 'absolute', top: 3,
          left: checked ? 20 : 3,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </button>
    </div>
  )
}

// ── Client list item ──────────────────────────────────────────────────────────
function ClientListItem({ client, isSelected, onClick }) {
  const daysSince = client.last_seen
    ? Math.floor((Date.now() - new Date(client.last_seen)) / 86400000)
    : null

  return (
    <button
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', width: '100%', textAlign: 'left',
        background: isSelected ? 'var(--accent-primary-muted)' : 'none',
        border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)',
        borderLeft: `3px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'}`,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: isSelected ? 'white' : 'var(--text-secondary)',
        transition: 'all 0.15s ease',
      }}>
        {initials(client.full_name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: isSelected ? 700 : 500,
          color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {client.full_name || 'Unnamed client'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
          {daysSince === null ? 'Never logged in'
            : daysSince === 0 ? 'Seen today'
            : daysSince === 1 ? 'Seen yesterday'
            : `Seen ${daysSince}d ago`}
        </div>
      </div>
    </button>
  )
}

// ── Settings panel for a selected client ─────────────────────────────────────
function ClientSettingsPanel({ client, userId }) {
  const { toast } = useToast()

  // Current settings state
  const [settings, setSettings] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [savingField, setSavingField] = useState(null) // which field is saving
  const [welcomeSaveStatus, setWelcomeSaveStatus] = useState(null)
  const welcomeDebounceRef = useRef(null)
  const [welcomeText, setWelcomeText] = useState('')

  // ── Load settings for this client ────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setWelcomeSaveStatus(null)
    clearTimeout(welcomeDebounceRef.current)

    supabase
      .from('client_portal_settings')
      .select('id, show_stage_tracker, show_documents, show_messages, show_referrals, custom_welcome_message, updated_at')
      .eq('client_id', client.id)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          console.error('[PortalControls] settings fetch:', error)
        }
        const defaults = {
          show_stage_tracker:     true,
          show_documents:         true,
          show_messages:          true,
          show_referrals:         true,
          custom_welcome_message: '',
        }
        const merged = data ? { ...defaults, ...data } : defaults
        setSettings(merged)
        setWelcomeText(merged.custom_welcome_message || '')
        setLoading(false)
      })
  }, [client.id])

  // ── Save a boolean toggle immediately ────────────────────────────────────
  async function saveToggle(field, value) {
    setSavingField(field)
    // Optimistic update
    setSettings(prev => ({ ...prev, [field]: value }))

    try {
      const { error } = await supabase
        .from('client_portal_settings')
        .upsert(
          { client_id: client.id, [field]: value, updated_by: userId },
          { onConflict: 'client_id' }
        )
      if (error) throw error

      await addAuditLog({
        userId, action: 'portal_settings_changed',
        entityType: 'client', entityId: client.id,
        metadata: { field, value, client_name: client.full_name }
      })
    } catch (err) {
      console.error('[PortalControls] toggle save:', err)
      // Roll back
      setSettings(prev => ({ ...prev, [field]: !value }))
      toast.error('Failed to save setting. Please try again.')
    } finally {
      setSavingField(null)
    }
  }

  // ── Save welcome message (debounced 800ms) ────────────────────────────────
  function handleWelcomeChange(value) {
    setWelcomeText(value)
    setWelcomeSaveStatus('saving')
    clearTimeout(welcomeDebounceRef.current)
    welcomeDebounceRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('client_portal_settings')
          .upsert(
            { client_id: client.id, custom_welcome_message: value || null, updated_by: userId },
            { onConflict: 'client_id' }
          )
        if (error) throw error

        await addAuditLog({
          userId, action: 'portal_settings_changed',
          entityType: 'client', entityId: client.id,
          metadata: { field: 'custom_welcome_message', client_name: client.full_name }
        })

        setWelcomeSaveStatus('saved')
        setTimeout(() => setWelcomeSaveStatus(null), 2000)
      } catch (err) {
        console.error('[PortalControls] welcome save:', err)
        setWelcomeSaveStatus('error')
      }
    }, 800)
  }

  useEffect(() => () => clearTimeout(welcomeDebounceRef.current), [])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
        <Skeleton width={200} height={20} />
        <Skeleton width="100%" height={90} />
        <Skeleton width="100%" height={160} />
        <Skeleton width="100%" height={100} />
      </div>
    )
  }

  const welcomeSaveColor = welcomeSaveStatus === 'saved' ? '#22c55e'
    : welcomeSaveStatus === 'error' ? '#ef4444'
    : 'var(--text-muted)'

  const TOGGLES = [
    {
      field: 'show_stage_tracker',
      label: 'Show Stage Tracker',
      description: 'Displays the 8-stage project progress bar on the client portal.'
    },
    {
      field: 'show_documents',
      label: 'Show Documents',
      description: 'Allows the client to view and download project documents marked as visible.'
    },
    {
      field: 'show_messages',
      label: 'Show Messages',
      description: 'Enables the message thread between the client and the team.'
    },
    {
      field: 'show_referrals',
      label: 'Show Referrals',
      description: 'Displays the referral submission form in the client portal.'
    },
  ]

  return (
    <motion.div
      key={client.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: 'white', flexShrink: 0
        }}>
          {initials(client.full_name)}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
            {client.full_name || 'Unnamed client'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {client.email && <span>{client.email} · </span>}
            Last seen: <strong style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(client.last_seen)}</strong>
            {client.first_login && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#f59e0b'
              }}>
                Never logged in
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Portal visibility toggles */}
      <div className="card" style={{ padding: '4px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 0 4px 0' }}>
          Portal Visibility
        </div>
        {TOGGLES.map((t, idx) => (
          <div key={t.field}>
            {idx > 0 && <div style={{ height: 1, background: 'var(--border-color)' }} />}
            <Toggle
              id={`toggle-${client.id}-${t.field}`}
              label={t.label}
              description={t.description}
              checked={!!settings?.[t.field]}
              disabled={savingField === t.field}
              onChange={() => saveToggle(t.field, !settings?.[t.field])}
            />
          </div>
        ))}
      </div>

      {/* Welcome message */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Custom Welcome Message
          </div>
          {welcomeSaveStatus && (
            <span style={{ fontSize: 11, color: welcomeSaveColor }}>
              {welcomeSaveStatus === 'saving' ? 'Saving…'
                : welcomeSaveStatus === 'saved' ? 'Saved'
                : 'Save failed'}
            </span>
          )}
        </div>
        <textarea
          className="input"
          value={welcomeText}
          onChange={e => handleWelcomeChange(e.target.value)}
          placeholder="Leave blank to show the default welcome message in the client portal. If set, this message appears at the top of the client's dashboard."
          rows={4}
          style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6 }}
          aria-label="Custom welcome message for client portal"
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Shown at the top of this client's portal dashboard. Supports plain text only.
        </div>
      </div>

      {/* Last updated */}
      {settings?.updated_at && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          Settings last updated: {fmtDateTime(settings.updated_at)}
        </div>
      )}
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortalControlsPage() {
  const { user }  = useAuth()
  const { toast } = useToast()

  const [role, setRole]           = useState(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const [clients, setClients]     = useState([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState(null)

  // ── Check role ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setRole(data?.role || null)
        setRoleLoading(false)
      })
  }, [user.id])

  // ── Fetch client profiles (only once role confirmed as super_admin) ───────
  useEffect(() => {
    if (role !== 'super_admin') return
    supabase
      .from('profiles')
      .select('id, full_name, email, last_seen, first_login')
      .eq('role', 'client')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) console.error('[PortalControls] clients fetch:', error)
        setClients(data || [])
        setClientsLoading(false)
      })
  }, [role])

  const selectedClient = clients.find(c => c.id === selectedClientId) || null

  // ── Loading ───────────────────────────────────────────────────────────────
  if (roleLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', gap: 20 }}>
        <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} width="100%" height={52} />)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton width={200} height={44} />
          <Skeleton width="100%" height={200} />
        </div>
        <style>{`.pc-sk-pulse{animation:pcSk 1.6s ease-in-out infinite}@keyframes pcSk{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
      </div>
    )
  }

  // ── Access denied (non-super_admin) ───────────────────────────────────────
  if (role !== 'super_admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
          <path d="M14 14l12 12M26 14L14 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          Access Restricted
        </div>
        <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          Client Portal Controls is only accessible to the super admin account.
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Page heading */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
          Portal Controls
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Manage what each client sees in their portal. Changes take effect immediately.
        </p>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 20, overflow: 'hidden', minHeight: 0 }}>

        {/* Client list */}
        <div style={{
          width: 240, flexShrink: 0, overflowY: 'auto',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', padding: '10px 8px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 6px', marginBottom: 6 }}>
            Clients ({clients.length})
          </div>

          {clientsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
              {[1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={52} />)}
            </div>
          ) : clients.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>👤</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>No clients yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Client profiles appear here once created in Supabase.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {clients.map(client => (
                <ClientListItem
                  key={client.id}
                  client={client}
                  isSelected={selectedClientId === client.id}
                  onClick={() => setSelectedClientId(client.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Settings panel */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            {selectedClient ? (
              <ClientSettingsPanel
                key={selectedClient.id}
                client={selectedClient}
                userId={user.id}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)' }}
              >
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="30" height="30" rx="6" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M12 18h12M12 13h12M12 23h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Select a client
                </div>
                <div style={{ fontSize: 12 }}>
                  Choose a client from the list to manage their portal settings.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .pc-sk-pulse { animation: pcSk 1.6s ease-in-out infinite; }
        @keyframes pcSk { 0%,100%{opacity:.9} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}
