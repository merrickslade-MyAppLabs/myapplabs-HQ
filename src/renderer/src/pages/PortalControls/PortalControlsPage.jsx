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
    hour: '2-digit', minute: '2-digit',
  })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const STATUS_STYLES = {
  active:     { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e',  label: 'Active' },
  completed:  { bg: 'var(--bg-tertiary)',     color: 'var(--text-muted)', label: 'Completed' },
  paused:     { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b',  label: 'Paused' },
  planning:   { bg: 'rgba(99,102,241,0.12)', color: '#6366f1',  label: 'Planning' },
  cancelled:  { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444',  label: 'Cancelled' },
}
function statusStyle(s) {
  return STATUS_STYLES[s?.toLowerCase()] ?? { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: s || '—' }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="pc-sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style,
    }} />
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange, disabled, label, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '12px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'block' }}>
          {label}
        </label>
        {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <button
        id={id} role="switch" aria-checked={checked} aria-label={label}
        disabled={disabled} onClick={onChange}
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
          background: checked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'all 0.2s ease', opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: checked ? 20 : 3,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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

// ── Visibility tab ────────────────────────────────────────────────────────────
function VisibilityTab({ client, userId }) {
  const { toast } = useToast()
  const [settings,         setSettings]         = useState(null)
  const [loading,          setLoading]           = useState(true)
  const [savingField,      setSavingField]       = useState(null)
  const [welcomeSaveStatus,setWelcomeSaveStatus] = useState(null)
  const welcomeDebounceRef = useRef(null)
  const [welcomeText,      setWelcomeText]       = useState('')

  useEffect(() => {
    setLoading(true)
    setWelcomeSaveStatus(null)
    clearTimeout(welcomeDebounceRef.current)

    supabase
      .from('client_portal_settings')
      .select('id, show_stage_tracker, show_documents, show_messages, show_referrals, welcome_message, updated_at')
      .eq('client_id', client.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[PortalControls] settings fetch:', error)
        const defaults = {
          show_stage_tracker: true,
          show_documents:     true,
          show_messages:      true,
          show_referrals:     true,
          welcome_message:    '',
        }
        const merged = data ? { ...defaults, ...data } : defaults
        setSettings(merged)
        setWelcomeText(merged.welcome_message || '')
        setLoading(false)
      })
  }, [client.id])

  async function saveToggle(field, value) {
    setSavingField(field)
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
        metadata: { field, value, client_name: client.full_name },
      })
    } catch (err) {
      console.error('[PortalControls] toggle save:', err)
      setSettings(prev => ({ ...prev, [field]: !value }))
      toast.error('Failed to save setting. Please try again.')
    } finally {
      setSavingField(null)
    }
  }

  function handleWelcomeChange(value) {
    setWelcomeText(value)
    setWelcomeSaveStatus('saving')
    clearTimeout(welcomeDebounceRef.current)
    welcomeDebounceRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('client_portal_settings')
          .upsert(
            { client_id: client.id, welcome_message: value || null, updated_by: userId },
            { onConflict: 'client_id' }
          )
        if (error) throw error
        await addAuditLog({
          userId, action: 'portal_settings_changed',
          entityType: 'client', entityId: client.id,
          metadata: { field: 'welcome_message', client_name: client.full_name },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton width="100%" height={140} />
        <Skeleton width="100%" height={110} />
      </div>
    )
  }

  const TOGGLES = [
    { field: 'show_stage_tracker', label: 'Stage Tracker',  description: 'Displays the project progress stages.' },
    { field: 'show_documents',     label: 'Documents',       description: 'Client can view & download shared files.' },
    { field: 'show_messages',      label: 'Messages',        description: 'Enables the message thread with the client.' },
    { field: 'show_referrals',     label: 'Referrals',       description: 'Shows the referral submission form.' },
  ]

  const welcomeColor = welcomeSaveStatus === 'saved' ? '#22c55e'
    : welcomeSaveStatus === 'error' ? '#ef4444'
    : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section toggles */}
      <div className="card" style={{ padding: '4px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 0 4px' }}>
          Portal Sections
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
            <span style={{ fontSize: 11, color: welcomeColor }}>
              {welcomeSaveStatus === 'saving' ? 'Saving…' : welcomeSaveStatus === 'saved' ? 'Saved ✓' : 'Save failed'}
            </span>
          )}
        </div>
        <textarea
          className="input"
          value={welcomeText}
          onChange={e => handleWelcomeChange(e.target.value)}
          placeholder="Leave blank for the default greeting. If set, this shows at the top of the client's dashboard."
          rows={4}
          style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Plain text only. Shown at the top of this client's portal dashboard.
        </div>
      </div>

      {settings?.updated_at && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          Settings last updated: {fmtDateTime(settings.updated_at)}
        </div>
      )}
    </div>
  )
}

// ── Projects tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ client, userId }) {
  const { toast } = useToast()
  const [projects, setProjects]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [search,   setSearch]     = useState('')
  const [saving,   setSaving]     = useState({})   // { [projectId]: true }

  // Load ALL projects so we can assign any of them
  useEffect(() => {
    setLoading(true)
    setSearch('')
    supabase
      .from('projects')
      .select('id, name, client_name, status, portal_user_id')
      .order('client_name', { ascending: true })
      .order('name',        { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[PortalControls] projects fetch:', error)
        setProjects(data || [])
        setLoading(false)
      })
  }, [client.id])

  async function toggleProject(project) {
    const isAssigned = project.portal_user_id === client.id
    const newValue   = isAssigned ? null : client.id

    // Optimistic update
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, portal_user_id: newValue } : p
    ))
    setSaving(prev => ({ ...prev, [project.id]: true }))

    try {
      const { error } = await supabase
        .from('projects')
        .update({ portal_user_id: newValue })
        .eq('id', project.id)
      if (error) throw error

      await addAuditLog({
        userId, action: isAssigned ? 'portal_project_unassigned' : 'portal_project_assigned',
        entityType: 'project', entityId: project.id,
        metadata: {
          project_name:  project.name,
          portal_client: client.full_name,
          portal_user_id: newValue,
        },
      })
    } catch (err) {
      console.error('[PortalControls] project toggle:', err)
      // Roll back
      setProjects(prev => prev.map(p =>
        p.id === project.id ? { ...p, portal_user_id: project.portal_user_id } : p
      ))
      toast.error('Failed to update project assignment.')
    } finally {
      setSaving(prev => ({ ...prev, [project.id]: false }))
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? projects.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.client_name?.toLowerCase().includes(q)
      )
    : projects

  // Sort: this client's projects first, then others
  const sorted = [
    ...filtered.filter(p => p.portal_user_id === client.id),
    ...filtered.filter(p => p.portal_user_id !== client.id),
  ]

  const assignedCount = projects.filter(p => p.portal_user_id === client.id).length

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} width="100%" height={54} />)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{assignedCount}</span>
          {' '}project{assignedCount !== 1 ? 's' : ''} visible in {client.full_name?.split(' ')[0]}'s portal
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 200px' }}>
          <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="var(--text-muted)" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="input"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 28, fontSize: 12, height: 32 }}
          />
        </div>
      </div>

      {/* Project list */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {q ? 'No matching projects' : 'No projects yet'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {q ? 'Try a different search term.' : 'Projects will appear here once added in the Projects section.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          {sorted.map((project, idx) => {
            const isAssigned     = project.portal_user_id === client.id
            const isOtherClient  = project.portal_user_id && project.portal_user_id !== client.id
            const isSaving       = !!saving[project.id]
            const ss             = statusStyle(project.status)

            return (
              <div key={project.id}>
                {idx > 0 && <div style={{ height: 1, background: 'var(--border-color)', margin: '0 16px' }} />}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  background: isAssigned ? 'rgba(var(--accent-primary-rgb, 99,102,241), 0.04)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}>

                  {/* Checkbox */}
                  <button
                    onClick={() => !isSaving && toggleProject(project)}
                    disabled={isSaving}
                    title={isOtherClient ? 'This project is assigned to a different portal client. Click to reassign.' : isAssigned ? 'Remove from portal' : 'Add to portal'}
                    style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${isAssigned ? 'var(--accent-primary)' : isOtherClient ? '#f59e0b' : 'var(--border-color)'}`,
                      background: isAssigned ? 'var(--accent-primary)' : 'transparent',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease', opacity: isSaving ? 0.5 : 1,
                    }}
                  >
                    {isSaving ? (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ animation: 'pcSpin 0.7s linear infinite' }}>
                        <circle cx="6" cy="6" r="4.5" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="14 8" />
                      </svg>
                    ) : isAssigned ? (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : isOtherClient ? (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <circle cx="4" cy="4" r="2.5" fill="#f59e0b"/>
                      </svg>
                    ) : null}
                  </button>

                  {/* Project info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: isAssigned ? 600 : 500,
                      color: isAssigned ? 'var(--text-primary)' : 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {project.name}
                    </div>
                    {project.client_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {project.client_name}
                      </div>
                    )}
                  </div>

                  {/* Warnings / badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isOtherClient && !isAssigned && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99,
                        background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                      }}>
                        Other client
                      </span>
                    )}
                    {/* Status badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99,
                      background: ss.bg, color: ss.color, flexShrink: 0,
                    }}>
                      {ss.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-primary)', display: 'inline-block' }} />
          Visible in portal
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, border: '2px solid #f59e0b', display: 'inline-block', position: 'relative' }}>
            <span style={{ position: 'absolute', inset: 1, borderRadius: 1, background: '#f59e0b' }} />
          </span>
          Assigned to another client
        </span>
      </div>
    </div>
  )
}

// ── Client detail panel (right side) ─────────────────────────────────────────
function ClientDetailPanel({ client, userId }) {
  const [activeTab, setActiveTab] = useState('visibility')

  const TABS = [
    {
      id: 'visibility',
      label: 'Visibility',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1.5 8C3 4.5 5.5 2.5 8 2.5S13 4.5 14.5 8C13 11.5 10.5 13.5 8 13.5S3 11.5 1.5 8z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="8.5" y="1.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="1.5" y="8.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="8.5" y="8.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
    },
  ]

  return (
    <motion.div
      key={client.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}
    >
      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: 'white', flexShrink: 0,
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
                borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              }}>
                Never logged in
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)', padding: 3,
        alignSelf: 'flex-start',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 'calc(var(--radius-md) - 2px)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'visibility' ? (
            <motion.div key="visibility"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              <VisibilityTab client={client} userId={userId} />
            </motion.div>
          ) : (
            <motion.div key="projects"
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}>
              <ProjectsTab client={client} userId={userId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortalControlsPage() {
  const { user }  = useAuth()
  const { toast } = useToast()

  const [role,            setRole]            = useState(null)
  const [roleLoading,     setRoleLoading]     = useState(true)
  const [clients,         setClients]         = useState([])
  const [clientsLoading,  setClientsLoading]  = useState(true)
  const [selectedClientId,setSelectedClientId]= useState(null)
  const [clientSearch,    setClientSearch]    = useState('')

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

  // ── Fetch portal client profiles ─────────────────────────────────────────
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

  const filteredClients = clientSearch.trim()
    ? clients.filter(c =>
        c.full_name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(clientSearch.toLowerCase())
      )
    : clients

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

  // ── Access denied ─────────────────────────────────────────────────────────
  if (role !== 'super_admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
          <path d="M14 14l12 12M26 14L14 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Access Restricted</div>
        <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          Portal Controls is only accessible to the super admin account.
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
          Manage what each client sees in their portal — sections, projects, and welcome message. Changes take effect immediately.
        </p>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 20, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Client list (left) ── */}
        <div style={{
          width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 8px 6px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                className="input"
                placeholder="Search clients…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                style={{ paddingLeft: 26, fontSize: 12, height: 30 }}
              />
            </div>
          </div>

          {/* Client list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 6px', marginBottom: 4 }}>
              Clients ({filteredClients.length})
            </div>

            {clientsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                {[1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={52} />)}
              </div>
            ) : filteredClients.length === 0 ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>👤</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {clientSearch ? 'No match' : 'No clients yet'}
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  {clientSearch ? 'Try a different name.' : 'Portal client accounts appear here once created in Supabase.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {filteredClients.map(client => (
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
        </div>

        {/* ── Detail panel (right) ── */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <AnimatePresence mode="wait">
            {selectedClient ? (
              <ClientDetailPanel
                key={selectedClient.id}
                client={selectedClient}
                userId={user.id}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)' }}
              >
                <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                  <rect x="3" y="3" width="32" height="32" rx="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M12 19h14M12 14h14M12 24h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Select a client</div>
                <div style={{ fontSize: 12 }}>Choose a portal client from the list to manage their settings.</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .pc-sk-pulse { animation: pcSk 1.6s ease-in-out infinite; }
        @keyframes pcSk { 0%,100%{opacity:.9} 50%{opacity:.4} }
        @keyframes pcSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
