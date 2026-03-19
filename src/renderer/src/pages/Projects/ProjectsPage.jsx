import { useState, useEffect, useRef, Component } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { addAuditLog } from '../../supabase/database'
import { useToast } from '../../components/ui/Toast'
import Modal from '../../components/ui/Modal'
import ProjectDetail from './ProjectDetail'

// ── Stage / status constants ──────────────────────────────────────────────────

export const STAGE_STATUS = [
  '', 'qualification', 'discovery', 'proposal',
  'kickoff', 'build', 'review', 'delivery', 'complete'
]

export const STAGE_NAMES = [
  '', 'Lead Qualification', 'Discovery Call', 'Proposal & Contract',
  'Project Kickoff', 'Build Phase', 'Client Review', 'Final Delivery', 'Post-Delivery'
]

export const STATUS_META = {
  qualification: { label: 'Lead Qualification', color: '#6c63ff', bg: 'rgba(108,99,255,0.12)' },
  discovery:     { label: 'Discovery Call',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  proposal:      { label: 'Proposal & Contract', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  kickoff:       { label: 'Project Kickoff',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  build:         { label: 'Build Phase',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  review:        { label: 'Client Review',       color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  delivery:      { label: 'Final Delivery',      color: '#ec4899', bg: 'rgba(236,72,153,0.12)'  },
  complete:      { label: 'Complete',            color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns calendar days between today and dateStr. Negative = overdue. */
export function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000)
}

/** Formats a date string as DD MMM YYYY. */
export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

// ── Error boundary ────────────────────────────────────────────────────────────

class ProjectsErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[Projects] Render error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 12, padding: 40
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            Something went wrong loading Projects
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Please refresh the page. If the problem persists, contact support.
          </div>
          <button className="btn btn-primary btn-sm"
            onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Shared components ─────────────────────────────────────────────────────────

export function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="skeleton-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

/** Status badge pill. */
export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {m.label}
    </span>
  )
}

/** 8-segment stage progress bar for the list view. */
function StageDots({ current, status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {Array.from({ length: 8 }, (_, i) => {
        const stageNum = i + 1
        const isComplete = status === 'complete' || stageNum < current
        const isCurrent  = stageNum === current && status !== 'complete'
        const color = STATUS_META[STAGE_STATUS[stageNum]]?.color || '#6c63ff'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div title={STAGE_NAMES[stageNum]} style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: (isComplete || isCurrent) ? color : 'var(--bg-tertiary)',
              border: isCurrent ? `2px solid ${color}` : 'none',
              boxSizing: 'border-box',
              opacity: isComplete ? 1 : isCurrent ? 1 : 0.4
            }} />
            {i < 7 && (
              <div style={{
                width: 6, height: 1.5, borderRadius: 1,
                background: isComplete ? color : 'var(--bg-tertiary)',
                opacity: isComplete ? 0.5 : 0.3, flexShrink: 0
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── New project modal ─────────────────────────────────────────────────────────

function NewProjectModal({ isOpen, onClose, onCreated }) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [clients, setClients]     = useState([])
  const [clientsLoading, setCL]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors]       = useState({})

  const [form, setForm] = useState({
    clientId: '', title: '', description: '', targetDeliveryDate: ''
  })

  /** Load client profiles when the modal opens. */
  useEffect(() => {
    if (!isOpen) return
    setCL(true)
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) console.error('[NewProject] clients fetch:', error)
        setClients(data || [])
        setCL(false)
      })
    setForm({ clientId: '', title: '', description: '', targetDeliveryDate: '' })
    setErrors({})
  }, [isOpen])

  function validate() {
    const e = {}
    if (!form.clientId) e.clientId = 'Please select a client.'
    if (!form.title.trim()) e.title = 'Project title is required.'
    if (form.title.trim().length > 120) e.title = 'Title must be under 120 characters.'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          client_id:            form.clientId,
          title:                form.title.trim(),
          description:          form.description.trim() || null,
          target_delivery_date: form.targetDeliveryDate || null,
          created_by:           user.id
        })
        .select('id')
        .single()

      if (error) throw error

      await addAuditLog({
        userId: user.id, action: 'project_created',
        entityType: 'project', entityId: data.id
      })

      toast.success('Project created successfully.')
      onCreated(data.id)
      onClose()
    } catch (err) {
      console.error('[NewProject] create error:', err)
      toast.error('Unable to create project. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const field = (label, key, input) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={`np-${key}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {input}
      {errors[key] && (
        <span style={{ fontSize: 11, color: '#ef4444' }}>{errors[key]}</span>
      )}
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Project" size="md"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        noValidate aria-label="New project form">
        {field('Client *', 'clientId',
          <select id="np-clientId"
            value={form.clientId}
            onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            className="input"
            aria-required="true"
            aria-invalid={!!errors.clientId}
          >
            <option value="">
              {clientsLoading ? 'Loading clients…' : 'Select a client'}
            </option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.email ? `(${c.email})` : ''}
              </option>
            ))}
          </select>
        )}
        {field('Project Title *', 'title',
          <input id="np-title" className="input" type="text"
            value={form.title} maxLength={120}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Acme Corp — Mobile App"
            aria-required="true" aria-invalid={!!errors.title}
          />
        )}
        {field('Description', 'description',
          <textarea id="np-description" className="input" rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief project overview (optional)"
            style={{ resize: 'vertical', minHeight: 72 }}
          />
        )}
        {field('Target Delivery Date', 'targetDeliveryDate',
          <input id="np-targetDeliveryDate" className="input" type="date"
            value={form.targetDeliveryDate}
            onChange={e => setForm(f => ({ ...f, targetDeliveryDate: e.target.value }))}
          />
        )}
      </form>
    </Modal>
  )
}

// ── Project list row ──────────────────────────────────────────────────────────

function ProjectRow({ project, onClick }) {
  const days = daysUntil(project.target_delivery_date)
  const isOverdue  = days !== null && days < 0  && project.status !== 'complete'
  const isDueSoon  = days !== null && days <= 7 && days >= 0 && project.status !== 'complete'
  const clientName = project.profiles?.full_name || '—'

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`Open project: ${project.title}`}
      style={{ cursor: 'pointer' }}
      className="table-row-hover"
    >
      {/* Client */}
      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {clientName}
      </td>

      {/* Title */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {project.title}
        </div>
        {project.description && (
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300
          }}>
            {project.description}
          </div>
        )}
      </td>

      {/* 8-segment progress */}
      <td style={{ padding: '12px 16px' }}>
        <StageDots current={project.current_stage} status={project.status} />
      </td>

      {/* Status badge */}
      <td style={{ padding: '12px 16px' }}>
        <StatusBadge status={project.status} />
      </td>

      {/* Target delivery */}
      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {fmtDate(project.target_delivery_date)}
      </td>

      {/* Days remaining */}
      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
        {project.status === 'complete' ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>Complete</span>
        ) : days === null ? (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: isOverdue ? '#ef4444' : isDueSoon ? '#f59e0b' : 'var(--text-secondary)'
          }}>
            {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`}
          </span>
        )}
      </td>
    </motion.tr>
  )
}

// ── Projects list ─────────────────────────────────────────────────────────────

function ProjectsList({ onSelect, onNew }) {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('all')
  const channelRef = useRef(null)

  async function load() {
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select(`
          id, title, description, status, current_stage,
          target_delivery_date, created_at,
          profiles!client_id (id, full_name)
        `)
        .order('created_at', { ascending: false })

      if (err) throw err
      setProjects(data || [])
      setError(null)
    } catch (err) {
      console.error('[Projects] load error:', err)
      setError('Unable to load projects.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Keep the list live — re-fetch on any project change.
    const channel = supabase
      .channel(`projects-list-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, load)
      .subscribe()
    channelRef.current = channel
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  const filtered = projects.filter(p => {
    const matchesSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filterStatus === 'all' || p.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const activeCount   = projects.filter(p => p.status !== 'complete').length
  const completeCount = projects.filter(p => p.status === 'complete').length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 12, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Projects
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {activeCount} active · {completeCount} complete
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onNew}
            aria-label="Create new project">
            + New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="input" type="search" placeholder="Search projects or clients…"
          value={search} onChange={e => setSearch(e.target.value)}
          aria-label="Search projects"
          style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        />
        <select className="input" value={filterStatus}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ width: 160, height: 34, fontSize: 13 }}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Skeleton width={100} height={14} style={{ opacity: 1 - i * 0.15 }} />
                <Skeleton width={200} height={14} style={{ opacity: 1 - i * 0.15 }} />
                <Skeleton width={120} height={8} style={{ opacity: 1 - i * 0.15 }} />
                <Skeleton width={80} height={20} radius={99} style={{ opacity: 1 - i * 0.15 }} />
                <Skeleton width={80} height={14} style={{ opacity: 1 - i * 0.15 }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
            {error}
            <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 12 }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {projects.length === 0
                ? 'Create your first project to get started.'
                : 'Try adjusting your search or filter.'}
            </div>
            {projects.length === 0 && (
              <button className="btn btn-primary btn-sm" onClick={onNew} style={{ marginTop: 16 }}>
                + New Project
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} role="grid"
              aria-label="Projects list">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Client', 'Project', 'Stage', 'Status', 'Target Date', 'Due In'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.4px',
                      background: 'var(--bg-secondary)', position: 'sticky', top: 0
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <ProjectRow key={p.id} project={p} onClick={() => onSelect(p.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .skeleton-pulse { animation: skPulse 1.6s ease-in-out infinite; }
        @keyframes skPulse { 0%,100%{opacity:.9} 50%{opacity:.4} }
        .table-row-hover:hover td { background: var(--bg-tertiary); }
        .table-row-hover:focus-visible td { outline: 2px solid var(--accent-primary); }
      `}</style>
    </div>
  )
}

// ── Root page ─────────────────────────────────────────────────────────────────

function ProjectsPageContent() {
  const location = useLocation()
  const [selectedId, setSelectedId] = useState(
    location.state?.projectId || null
  )
  const [showNewModal, setShowNewModal] = useState(
    location.state?.openNew === true
  )

  function handleCreated(newId) {
    setSelectedId(newId)
  }

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {selectedId ? (
        <ProjectDetail
          projectId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <ProjectsList
          onSelect={setSelectedId}
          onNew={() => setShowNewModal(true)}
        />
      )}

      <NewProjectModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <ProjectsErrorBoundary>
      <ProjectsPageContent />
    </ProjectsErrorBoundary>
  )
}
