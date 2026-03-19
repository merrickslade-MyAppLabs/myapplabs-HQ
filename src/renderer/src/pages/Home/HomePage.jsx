import { useState, useEffect, useRef, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a time-appropriate greeting string. */
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Formats a number as UK pounds sterling, no decimals. */
function fmtGBP(n) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 0
  }).format(n)
}

/** Returns the number of calendar days between today and a given date string. */
function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date(new Date().toDateString())
  return Math.round(diff / 86400000)
}

// ── Stage config ─────────────────────────────────────────────────────────────

const STAGE_ORDER = ['qualification', 'discovery', 'proposal', 'kickoff', 'build', 'review', 'delivery']

const STAGE_META = {
  qualification: { label: 'Lead Qualification', color: '#6c63ff', rgb: '108,99,255'  },
  discovery:     { label: 'Discovery Call',      color: '#3b82f6', rgb: '59,130,246'  },
  proposal:      { label: 'Proposal & Contract', color: '#f59e0b', rgb: '245,158,11'  },
  kickoff:       { label: 'Project Kickoff',     color: '#8b5cf6', rgb: '139,92,246'  },
  build:         { label: 'Build Phase',         color: '#22c55e', rgb: '34,197,94'   },
  review:        { label: 'Client Review',       color: '#f97316', rgb: '249,115,22'  },
  delivery:      { label: 'Final Delivery',      color: '#ec4899', rgb: '236,72,153'  },
}

// ── Error boundary ───────────────────────────────────────────────────────────

/** Page-level error boundary — catches render errors without crashing the app. */
class HomeErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[Home] Render error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 12, padding: 40
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            Something went wrong loading the dashboard
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Please refresh the page. If the problem persists, contact support.
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

/** A single skeleton block that pulses while content is loading. */
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div
      className="skeleton-pulse"
      style={{ width, height, borderRadius: radius, background: 'var(--bg-tertiary)', ...style }}
    />
  )
}

// ── Summary card ─────────────────────────────────────────────────────────────

/**
 * One of the four top-row summary cards.
 * Shows a skeleton while loading, then the actual value.
 */
function SummaryCard({ label, value, sub, colorRgb, icon, loading, alert }) {
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px'
        }}>
          {label}
        </span>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: `rgba(${colorRgb},0.14)`,
          color: `rgb(${colorRgb})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          {icon}
        </div>
      </div>

      {loading
        ? <Skeleton width={72} height={26} />
        : (
          <div style={{
            fontSize: 21, fontWeight: 800, letterSpacing: '-0.5px',
            color: alert ? '#ef4444' : 'var(--text-primary)'
          }}>
            {value}
          </div>
        )
      }

      {sub && (
        <div style={{ fontSize: 11, color: alert ? '#ef4444' : 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </motion.div>
  )
}

// ── Quick action button ───────────────────────────────────────────────────────

/** A single quick-action button in the actions bar. */
function QuickAction({ label, icon, colorRgb, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 8,
        border: `1px solid rgba(${colorRgb},0.25)`,
        background: `rgba(${colorRgb},0.08)`,
        color: `rgb(${colorRgb})`, cursor: 'pointer',
        fontSize: 13, fontWeight: 600,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `rgba(${colorRgb},0.16)`
        e.currentTarget.style.borderColor = `rgba(${colorRgb},0.45)`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `rgba(${colorRgb},0.08)`
        e.currentTarget.style.borderColor = `rgba(${colorRgb},0.25)`
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      {label}
    </button>
  )
}

// ── Project kanban card ───────────────────────────────────────────────────────

/** A compact project card inside the mini kanban. */
function ProjectCard({ project, stageColor, onClick }) {
  const days = daysUntil(project.target_delivery_date)
  const isOverdue = days !== null && days < 0
  const isDueSoon = days !== null && days >= 0 && days <= 7

  const clientName = project.profiles?.full_name || project.client_name || 'Unknown client'

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      aria-label={`Open project: ${project.title}`}
      style={{
        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        transition: 'border-color 0.15s ease, transform 0.1s ease',
        display: 'flex', flexDirection: 'column', gap: 6
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = stageColor
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-color)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {project.title}
      </div>

      {/* Client name */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {clientName}
      </div>

      {/* Stage progress dots */}
      <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: i < project.current_stage
              ? stageColor
              : 'var(--bg-tertiary)'
          }} />
        ))}
      </div>

      {/* Delivery date */}
      {project.target_delivery_date && (
        <div style={{
          fontSize: 10, fontWeight: 600, marginTop: 2,
          color: isOverdue ? '#ef4444' : isDueSoon ? '#f59e0b' : 'var(--text-muted)'
        }}>
          {isOverdue
            ? `${Math.abs(days)}d overdue`
            : days === 0
            ? 'Due today'
            : `${days}d remaining`
          }
        </div>
      )}
    </div>
  )
}

// ── Mini kanban ───────────────────────────────────────────────────────────────

/** Horizontally scrollable kanban showing active projects grouped by stage. */
function MiniKanban({ projects, loading, onProjectClick }) {
  // Group projects by their status (stage) value.
  const grouped = {}
  for (const stage of STAGE_ORDER) grouped[stage] = []
  for (const p of projects) {
    if (grouped[p.status]) grouped[p.status].push(p)
  }

  // Only render columns that have projects in them, in stage order.
  const occupiedStages = STAGE_ORDER.filter(s => grouped[s].length > 0)

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            minWidth: 200, background: 'var(--bg-secondary)',
            borderRadius: 10, padding: 14, flexShrink: 0
          }}>
            <Skeleton width={120} height={14} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="100%" height={72} />
              <Skeleton width="100%" height={72} style={{ opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (occupiedStages.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '36px 0',
        color: 'var(--text-muted)', border: '1px dashed var(--border-color)',
        borderRadius: 10
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>No active projects</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Create your first project to see it here.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
      // Custom scrollbar so it's not ugly on Windows
      scrollbarWidth: 'thin'
    }}>
      {occupiedStages.map(stage => {
        const meta = STAGE_META[stage]
        const cards = grouped[stage]
        return (
          <div key={stage} style={{
            minWidth: 200, maxWidth: 220, flexShrink: 0,
            background: 'var(--bg-secondary)',
            borderRadius: 10,
            border: '1px solid var(--border-color)',
            padding: '12px 12px 14px'
          }}>
            {/* Column header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: meta.color,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {meta.label}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px',
                borderRadius: 99,
                background: `rgba(${meta.rgb},0.14)`,
                color: meta.color, flexShrink: 0
              }}>
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  stageColor={meta.color}
                  onClick={() => onProjectClick(project.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function HomePageContent() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [summaryLoading, setSummaryLoading] = useState(true)
  const [kanbanLoading, setKanbanLoading] = useState(true)
  const [summaryError, setSummaryError] = useState(null)

  const [summary, setSummary] = useState({
    activeProjects:    0,
    outstandingTotal:  0,
    unreadMessages:    0,
    dueToday:          0,
  })
  const [projects, setProjects] = useState([])

  const channelRef = useRef(null)

  const displayName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
    || 'there'
  const firstName = displayName.charAt(0).toUpperCase() + displayName.slice(1).split(' ')[0]

  /** Load the four summary card values. */
  async function loadSummary() {
    try {
      const today = new Date().toISOString().split('T')[0]

      const [projectsRes, invoicesRes, messagesRes, tasksRes] = await Promise.all([
        // Active projects: status is not 'complete'
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'complete'),

        // Outstanding invoices: status is 'sent' (awaiting payment)
        supabase
          .from('invoices')
          .select('amount')
          .eq('status', 'sent'),

        // Unread messages: read_at is null
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null),

        // Tasks due today: due today and not done
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('due_date', today)
          .neq('status', 'done'),
      ])

      const outstandingTotal = (invoicesRes.data || []).reduce(
        (sum, inv) => sum + Number(inv.amount || 0), 0
      )

      setSummary({
        activeProjects:   projectsRes.count  ?? 0,
        outstandingTotal,
        unreadMessages:   messagesRes.count  ?? 0,
        dueToday:         tasksRes.count     ?? 0,
      })
      setSummaryError(null)
    } catch (err) {
      console.error('[Home] Summary load error:', err)
      setSummaryError('Unable to load dashboard summary.')
    } finally {
      setSummaryLoading(false)
    }
  }

  /** Load active projects for the mini kanban, with client names joined. */
  async function loadKanban() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, title, status, current_stage, target_delivery_date,
          profiles!client_id (full_name)
        `)
        .neq('status', 'complete')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProjects(data || [])
    } catch (err) {
      console.error('[Home] Kanban load error:', err)
      setProjects([])
    } finally {
      setKanbanLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return

    loadSummary()
    loadKanban()

    // Subscribe to projects table so the kanban reflects live changes.
    const channel = supabase
      .channel(`home-projects-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          loadKanban()
          loadSummary()
        }
      )
      .subscribe()

    channelRef.current = channel

    // Clean up Realtime subscription on unmount to prevent memory leaks.
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user])

  return (
    <div className="page-container" style={{ height: '100%', overflowY: 'auto' }}>

      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ marginBottom: 20 }}
      >
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: 'var(--text-primary)',
          letterSpacing: '-0.4px', margin: 0
        }}>
          {getGreeting()}, {firstName}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          })}
        </p>
      </motion.div>

      {/* ── Summary cards ── */}
      {summaryError ? (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 18,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 13
        }}>
          {summaryError}
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12, marginBottom: 18
        }}>
          <SummaryCard
            label="Active Projects"
            value={summary.activeProjects}
            sub="Not yet complete"
            colorRgb="108,99,255"
            loading={summaryLoading}
            icon={
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="5" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="8" y="4" width="5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            }
          />
          <SummaryCard
            label="Outstanding Invoices"
            value={fmtGBP(summary.outstandingTotal)}
            sub="Awaiting payment"
            colorRgb="245,158,11"
            loading={summaryLoading}
            alert={summary.outstandingTotal > 0}
            icon={
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 5.5h12M4 8.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            }
          />
          <SummaryCard
            label="Unread Messages"
            value={summary.unreadMessages}
            sub={summary.unreadMessages > 0 ? 'Needs your attention' : 'All caught up'}
            colorRgb="59,130,246"
            loading={summaryLoading}
            alert={summary.unreadMessages > 0}
            icon={
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 3a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H9l-2 2-2-2H2a1 1 0 01-1-1V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            }
          />
          <SummaryCard
            label="Due Today"
            value={summary.dueToday}
            sub={summary.dueToday > 0 ? 'Tasks need completing' : 'Nothing due today'}
            colorRgb={summary.dueToday > 0 ? '239,68,68' : '34,197,94'}
            loading={summaryLoading}
            alert={summary.dueToday > 0}
            icon={
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5 1v2M9 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            }
          />
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap'
      }}
        role="group"
        aria-label="Quick actions"
      >
        <QuickAction
          label="New Project"
          colorRgb="108,99,255"
          onClick={() => navigate('/projects', { state: { openNew: true } })}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
        <QuickAction
          label="Invite Client"
          colorRgb="34,197,94"
          onClick={() => navigate('/projects', { state: { openInvite: true } })}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 13c0-2.8 2.2-5 5-5M10 9v4M8 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
        <QuickAction
          label="New Invoice"
          colorRgb="245,158,11"
          onClick={() => navigate('/invoices', { state: { openNew: true } })}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 7h6M4 4.5h6M4 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
        <QuickAction
          label="Workflow Guide"
          colorRgb="139,92,246"
          onClick={() => navigate('/workflow')}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 3h8M3 6h6M3 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          }
        />
      </div>

      {/* ── Active Projects — Mini Kanban ── */}
      <div className="card" style={{ padding: '16px 16px 18px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            Active Projects
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/projects')}
            style={{ fontSize: 11, padding: '3px 8px', height: 'auto' }}
          >
            All projects →
          </button>
        </div>

        <MiniKanban
          projects={projects}
          loading={kanbanLoading}
          onProjectClick={(id) => navigate(`/projects`, { state: { projectId: id } })}
        />
      </div>

      <style>{`
        .skeleton-pulse { animation: skPulse 1.6s ease-in-out infinite; }
        @keyframes skPulse {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

/** Default export wraps the page in an error boundary. */
export default function HomePage() {
  return (
    <HomeErrorBoundary>
      <HomePageContent />
    </HomeErrorBoundary>
  )
}
