import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'

// ── All 7 section shortcuts ─────────────────────────────────────
const NAV_SECTIONS = [
  {
    path: '/clients',
    title: 'Clients & Projects',
    color: '#6c63ff',
    bgMuted: 'rgba(108,99,255,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/tasks',
    title: 'Task Board',
    color: '#22c55e',
    bgMuted: 'rgba(34,197,94,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="5" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="2" width="5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    path: '/prompts',
    title: 'Prompt Builder',
    color: '#f59e0b',
    bgMuted: 'rgba(245,158,11,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <path d="M3 4h12M3 8h8M3 12h10M3 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/revenue',
    title: 'Revenue & Financials',
    color: '#3b82f6',
    bgMuted: 'rgba(59,130,246,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v16M5 6c0-1.1 1.8-2 4-2s4 .9 4 2-1.8 2-4 2-4 .9-4 2 1.8 2 4 2 4-.9 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/expenses',
    title: 'Expenses',
    color: '#ef4444',
    bgMuted: 'rgba(239,68,68,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="6" cy="11" r="1.2" fill="currentColor"/>
      </svg>
    )
  },
  {
    path: '/ideas',
    title: 'Ideas Pipeline',
    color: '#8b5cf6',
    bgMuted: 'rgba(139,92,246,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <path d="M9 2a5 5 0 015 5c0 2-1.2 3.8-3 4.6V13H7v-1.4C5.2 10.8 4 9 4 7a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 15h4M7.5 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    path: '/notes',
    title: 'Notes',
    color: '#14b8a6',
    bgMuted: 'rgba(20,184,166,0.12)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  }
]

const PRIORITY_CONFIG = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'High' },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Med'  },
  low:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Low'  }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtCurrency(num) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 0
  }).format(num)
}

// ── Stat card ───────────────────────────────────────────────────
function StatCard({ label, value, sub, colorRgb, icon, loading, positive }) {
  const isNeg = positive === false
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}
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
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 26, width: 72, borderRadius: 5, background: 'var(--bg-tertiary)' }} className="skeleton-pulse" />
      ) : (
        <div style={{
          fontSize: '21px', fontWeight: 800, letterSpacing: '-0.5px',
          color: isNeg ? '#ef4444' : 'var(--text-primary)'
        }}>
          {value}
        </div>
      )}

      {sub && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>
      )}
    </motion.div>
  )
}

// ── Today task row ──────────────────────────────────────────────
function TodayTaskRow({ task, onClick }) {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const isDone = task.column === 'done'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: 'var(--radius-md)',
        background: 'var(--bg-tertiary)', cursor: 'pointer',
        transition: 'background 0.12s ease'
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
    >
      {/* Circle indicator */}
      <div style={{
        width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${isDone ? '#22c55e' : 'var(--border-color)'}`,
        background: isDone ? 'rgba(34,197,94,0.2)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {isDone && (
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
            <path d="M1 4l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 500,
          color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: isDone ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {task.title}
        </div>
        {task.assignedTo && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
            {task.assignedTo}
          </div>
        )}
      </div>

      <span style={{
        fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
        background: p.bg, color: p.color, flexShrink: 0
      }}>
        {p.label}
      </span>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stats, setStats] = useState({ revenue: 0, expenses: 0, todayCount: 0, overdueCount: 0 })
  const [todayTasks, setTodayTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const displayName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
    || 'there'
  const name = displayName.charAt(0).toUpperCase() + displayName.slice(1)

  useEffect(() => {
    if (!user) return
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      // Filter today's tasks and overdue count to only the current user.
      // Matches against the full_name set in their profile, falling back to
      // the email-derived name. Uses ilike for case-insensitive matching.
      const assignedName = user?.user_metadata?.full_name
        || user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
        || ''

      let todayQuery   = supabase.from('tasks').select('id, title, column, priority, assigned_to').eq('due_date', today)
      let overdueQuery = supabase.from('tasks').select('id').lt('due_date', today).neq('column', 'done')

      if (assignedName) {
        todayQuery   = todayQuery.ilike('assigned_to', assignedName)
        overdueQuery = overdueQuery.ilike('assigned_to', assignedName)
      }

      const [revRes, expRes, todayRes, overdueRes] = await Promise.all([
        supabase.from('revenue').select('amount').eq('status', 'paid').gte('date', monthStart),
        supabase.from('expenses').select('amount').gte('date', monthStart),
        todayQuery,
        overdueQuery
      ])

      const revenue  = (revRes.data  || []).reduce((s, r) => s + (r.amount || 0), 0)
      const expenses = (expRes.data  || []).reduce((s, r) => s + (r.amount || 0), 0)

      const taskList = (todayRes.data || []).map(t => ({
        ...t,
        assignedTo: t.assigned_to
      }))

      setStats({
        revenue,
        expenses,
        todayCount:   taskList.length,
        overdueCount: (overdueRes.data || []).length
      })
      setTodayTasks(taskList)
      setLoading(false)
    }
    load()
  }, [user])

  const profit = stats.revenue - stats.expenses

  return (
    <div className="page-container" style={{ height: '100%', overflowY: 'auto' }}>

      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ marginBottom: '20px' }}
      >
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
          {getGreeting()}, {name}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </motion.div>

      {/* ── Stats row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '18px'
      }}>
        <StatCard
          label="Revenue this month"
          value={fmtCurrency(stats.revenue)}
          sub="Paid invoices"
          colorRgb="59,130,246"
          loading={loading}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M4.5 4c0-.8 1.1-1.5 2.5-1.5S9.5 3.2 9.5 4 8.4 5.5 7 5.5 4.5 6.2 4.5 7 5.6 8.5 7 8.5s2.5-.7 2.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
        <StatCard
          label="Expenses this month"
          value={fmtCurrency(stats.expenses)}
          sub="All categories"
          colorRgb="239,68,68"
          loading={loading}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 5.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="4.5" cy="8.5" r="1" fill="currentColor"/>
            </svg>
          }
        />
        <StatCard
          label="Net profit"
          value={fmtCurrency(profit)}
          sub="This month"
          colorRgb={profit >= 0 ? '34,197,94' : '239,68,68'}
          loading={loading}
          positive={profit >= 0}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M1.5 9.5l3-3 2 2 5.5-6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Due today"
          value={stats.todayCount}
          sub={stats.overdueCount > 0 ? `${stats.overdueCount} overdue` : 'Nothing overdue'}
          colorRgb={stats.overdueCount > 0 ? '239,68,68' : '34,197,94'}
          loading={loading}
          icon={
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5 1v2M9 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {/* ── Two-panel layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'start' }}>

        {/* Today's Tasks */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Today's Tasks
              {stats.todayCount > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                  borderRadius: 99, background: 'var(--accent-primary-muted)', color: 'var(--accent-primary)'
                }}>
                  {stats.todayCount}
                </span>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/tasks')}
              style={{ fontSize: '11px', padding: '3px 8px', height: 'auto' }}
            >
              All tasks →
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 36, borderRadius: 8,
                  background: 'var(--bg-tertiary)',
                  opacity: 1 - i * 0.2
                }} className="skeleton-pulse" />
              ))}
            </div>
          ) : todayTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '22px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Nothing due today</div>
              <div style={{ fontSize: '12px', marginTop: '3px', color: 'var(--text-muted)' }}>
                Enjoy the breathing room!
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {todayTasks.map(task => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  onClick={() => navigate('/tasks')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quick Navigate */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px' }}>
            Quick Navigate
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {NAV_SECTIONS.map((s, i) => (
              <motion.button
                key={s.path}
                onClick={() => navigate(s.path)}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.04, duration: 0.2 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '7px 10px', width: '100%', textAlign: 'left',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid transparent',
                  background: 'transparent', cursor: 'pointer',
                  transition: 'all 0.12s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = s.bgMuted
                  e.currentTarget.style.borderColor = `${s.color}35`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'transparent'
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: s.bgMuted, color: s.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {s.icon}
                </div>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {s.title}
                </span>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.button>
            ))}
          </div>
        </div>

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
