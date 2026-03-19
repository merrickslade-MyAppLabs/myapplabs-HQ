import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_NAMES = {
  1: 'Qualification',
  2: 'Discovery',
  3: 'Proposal',
  4: 'Kickoff',
  5: 'Build',
  6: 'Review',
  7: 'Delivery',
  8: 'Complete',
}

const STATUS_TO_STAGE = {
  qualification: 1,
  discovery:     2,
  proposal:      3,
  kickoff:       4,
  build:         5,
  review:        6,
  delivery:      7,
  complete:      8,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(fullName) {
  if (!fullName) return 'there'
  return fullName.trim().split(/\s+/)[0]
}

function fmtDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function fmtGBP(n) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0)
}

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false
  return new Date(dueDateStr) < new Date()
}

// ── Onboarding overlay ────────────────────────────────────────────────────────

function OnboardingOverlay({ settings, onDismiss }) {
  const welcomeMsg = settings?.welcome_message?.trim()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[8000] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,31,58,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.28, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-3xl shadow-modal p-8 sm:p-10 max-w-lg w-full"
      >
        {/* Logo mark */}
        <div className="w-16 h-16 bg-navy rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <svg width="32" height="32" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 11V7L7 3l5 4v4" stroke="white" strokeWidth="1.7" strokeLinejoin="round"/>
            <rect x="4.5" y="7.5" width="5" height="3.5" rx="0.5" fill="white"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-navy text-center mb-3">
          Welcome to your portal
        </h1>

        {welcomeMsg ? (
          <p className="text-gray-600 text-center leading-relaxed mb-6 text-sm whitespace-pre-wrap">
            {welcomeMsg}
          </p>
        ) : (
          <p className="text-gray-600 text-center leading-relaxed mb-6 text-sm">
            This is your dedicated project hub with MyAppLabs. Here's what you can do:
          </p>
        )}

        {/* Feature list */}
        <div className="flex flex-col gap-3 mb-8">
          {[
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="4" cy="4" r="2" stroke="#E8622A" strokeWidth="1.5"/>
                  <circle cx="4" cy="8" r="2" stroke="#E8622A" strokeWidth="1.5"/>
                  <circle cx="4" cy="12" r="2" stroke="#E8622A" strokeWidth="1.5"/>
                  <path d="M8 4h5M8 8h5M8 12h3" stroke="#E8622A" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              ),
              label: 'Track your project',
              detail: 'See exactly where your project is and what happens next.',
            },
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="#E8622A" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M9 2v4h4" stroke="#E8622A" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
              ),
              label: 'Access your documents',
              detail: 'Find proposals, contracts, and deliverables in one place.',
            },
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 3h12v8H9l-3 3v-3H2V3z" stroke="#E8622A" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              ),
              label: 'Message the team',
              detail: 'Ask questions or share feedback directly with us.',
            },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-3.5 bg-gray-50 rounded-xl">
              <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-navy">{item.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onDismiss} className="btn-primary w-full text-base py-3">
          Got It — Take Me In
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Stage tracker ─────────────────────────────────────────────────────────────

function StageTracker({ currentStage }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-start min-w-[560px] px-2">
        {Array.from({ length: 8 }, (_, i) => {
          const n        = i + 1
          const isPast   = n < currentStage
          const isCurrent = n === currentStage
          return (
            <div key={n} className="flex items-center flex-1">
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all"
                  style={{
                    background:   isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#fff',
                    borderColor:  isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#d1d5db',
                    color:        isCurrent || isPast ? '#fff' : '#9ca3af',
                    boxShadow:    isCurrent ? '0 0 0 4px rgba(232,98,42,0.2)' : 'none',
                  }}
                >
                  {isPast
                    ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : n
                  }
                </div>
                <span
                  className="text-center leading-tight"
                  style={{
                    fontSize: 10,
                    fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#9ca3af',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STAGE_NAMES[n]}
                </span>
              </div>
              {/* Connector line */}
              {i < 7 && (
                <div
                  className="flex-1 h-0.5 mb-5 mx-1"
                  style={{ background: isPast ? '#0B1F3A' : '#e5e7eb' }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Project selector ──────────────────────────────────────────────────────────

function ProjectSelector({ projects, selectedId, onSelect }) {
  return (
    <div className="mb-6">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        Your projects
      </label>
      <div className="flex flex-wrap gap-2">
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
            style={{
              background:   selectedId === p.id ? '#0B1F3A' : '#fff',
              color:        selectedId === p.id ? '#fff' : '#0B1F3A',
              borderColor:  selectedId === p.id ? '#0B1F3A' : '#d1d5db',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-4', w = 'w-full', rounded = 'rounded-lg' }) {
  return <div className={`${h} ${w} ${rounded} bg-gray-100 animate-pulse`} />
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, profile, portalSettings, dismissOnboarding } = useAuth()
  const ps = portalSettings ?? {}

  const [projects,        setProjects]        = useState([])
  const [selectedId,      setSelectedId]      = useState(null)
  const [unreadCount,     setUnreadCount]      = useState(0)
  const [invoices,        setInvoices]         = useState([])
  const [loading,         setLoading]          = useState(true)
  const [showOnboarding,  setShowOnboarding]   = useState(false)

  // ── Detect first login ────────────────────────────────────────────────────

  useEffect(() => {
    if (profile?.first_login === true) {
      setShowOnboarding(true)
    }
  }, [profile])

  async function handleDismissOnboarding() {
    setShowOnboarding(false)
    await dismissOnboarding()
  }

  // ── Fetch projects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('id, name, status, deadline')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[Dashboard] projects fetch:', error.message); setLoading(false); return }
        const rows = data ?? []
        setProjects(rows)
        if (rows.length > 0 && !selectedId) {
          setSelectedId(rows[0].id)
        }
        setLoading(false)
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch data for selected project ──────────────────────────────────────

  useEffect(() => {
    if (!selectedId) return

    // Unread messages (only messages NOT from this client)
    if (ps.show_messages !== false) {
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', selectedId)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .then(({ count, error }) => { if (!error) setUnreadCount(count ?? 0) })
    }

    // Outstanding invoices (status = 'sent' — visible to client)
    supabase
      .from('invoices')
      .select('id, reference, amount, due_date, status')
      .eq('project_id', selectedId)
      .eq('status', 'sent')
      .order('due_date', { ascending: true })
      .then(({ data, error }) => { if (!error) setInvoices(data ?? []) })
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedId) ?? null,
    [projects, selectedId]
  )

  const currentStage = selectedProject
    ? (STATUS_TO_STAGE[selectedProject.status] ?? 1)
    : 1

  const overdueInvoices = invoices.filter(inv => isOverdue(inv.due_date))
  const hasInvoices     = invoices.length > 0

  const name = firstName(profile?.full_name)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Onboarding overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingOverlay
            key="onboarding"
            settings={ps}
            onDismiss={handleDismissOnboarding}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

          {/* ── Welcome header ── */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-navy">
              {loading
                ? 'Welcome back'
                : `Welcome back, ${name}`
              }
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedProject
                ? `Here's the latest on ${selectedProject.name}`
                : 'Your project dashboard'
              }
            </p>
          </div>

          {loading ? (
            <div className="space-y-5">
              <div className="card p-6"><Skeleton h="h-6" w="w-48" /></div>
              <div className="card p-6 space-y-3">
                <Skeleton h="h-4" w="w-32" />
                <Skeleton h="h-10" />
              </div>
            </div>
          ) : projects.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="text-gray-400 text-sm">
                No projects yet. Your team will add one when your project kicks off.
              </div>
            </div>
          ) : (
            <>
              {/* Project selector (only if multiple projects) */}
              {projects.length > 1 && (
                <ProjectSelector
                  projects={projects}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}

              <div className="space-y-5">

                {/* ── Stage tracker ── */}
                {ps.show_stage_tracker !== false && selectedProject && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="card p-6"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                          Project stage
                        </div>
                        <div className="text-lg font-bold text-navy">
                          {STAGE_NAMES[currentStage]}
                          {selectedProject.status === 'complete' && (
                            <span className="ml-2 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                              Complete
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedProject.deadline && (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Deadline</div>
                          <div className="text-sm font-semibold text-navy">{fmtDate(selectedProject.deadline)}</div>
                        </div>
                      )}
                    </div>
                    <StageTracker currentStage={currentStage} />
                    {ps.show_stage_tracker !== false && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <Link
                          to="/stages"
                          className="text-sm font-medium text-brand hover:text-brand-600 transition-colors"
                        >
                          View full stage details →
                        </Link>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Unread messages ── */}
                {ps.show_messages !== false && unreadCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                  >
                    <Link to="/messages" className="block">
                      <div className="card p-5 flex items-center gap-4 hover:shadow-card-hover transition-shadow border-l-4 border-brand">
                        <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M2 3h12v8H9l-3 3v-3H2V3z" stroke="#E8622A" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-navy">
                            {unreadCount === 1
                              ? '1 unread message'
                              : `${unreadCount} unread messages`
                            }
                          </div>
                          <div className="text-xs text-gray-500">From the MyAppLabs team</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="bg-brand text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300">
                            <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )}

                {/* ── Outstanding invoices ── */}
                {hasInvoices && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                    className="card p-6"
                  >
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Outstanding {invoices.length === 1 ? 'invoice' : 'invoices'}
                    </div>
                    <div className="space-y-3">
                      {invoices.map(inv => {
                        const overdue = isOverdue(inv.due_date)
                        return (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between p-3.5 rounded-xl border"
                            style={{
                              background: overdue ? 'rgba(239,68,68,0.03)' : '#fafafa',
                              borderColor: overdue ? 'rgba(239,68,68,0.2)' : '#e5e7eb',
                            }}
                          >
                            <div>
                              <div className="text-sm font-semibold text-navy">{inv.reference}</div>
                              {inv.due_date && (
                                <div className="text-xs mt-0.5" style={{ color: overdue ? '#ef4444' : '#9ca3af' }}>
                                  {overdue ? 'Overdue — was due ' : 'Due '}{fmtDate(inv.due_date)}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-navy">{fmtGBP(inv.amount)}</div>
                              {overdue && (
                                <div className="text-xs text-red-500 font-medium">Overdue</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                      To pay or query an invoice, please contact{' '}
                      <a href="mailto:hello@myapplabs.co.uk" className="text-brand hover:underline">
                        hello@myapplabs.co.uk
                      </a>
                    </p>
                  </motion.div>
                )}

                {/* ── Quick links (only show enabled sections) ── */}
                {[
                  ps.show_stage_tracker !== false && { to: '/stages',    label: 'Project Stages',  sub: 'Track your build progress', icon: '📋' },
                  ps.show_documents     !== false && { to: '/documents',  label: 'Documents',       sub: 'Proposals, contracts & files', icon: '📄' },
                  ps.show_messages      !== false && { to: '/messages',   label: 'Messages',        sub: 'Chat with the team', icon: '💬' },
                  ps.show_referrals     !== false && { to: '/referrals',  label: 'Refer a Friend',  sub: 'Earn rewards for referrals', icon: '🤝' },
                ].filter(Boolean).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.15 }}
                    className="card p-6"
                  >
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Quick links
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        ps.show_stage_tracker !== false && { to: '/stages',    label: 'Stages',     icon: (
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 4h7M6 8h7M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        )},
                        ps.show_documents !== false && { to: '/documents', label: 'Documents', icon: (
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                        )},
                        ps.show_messages !== false && { to: '/messages',  label: 'Messages',  icon: (
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H9l-3 3v-3H2V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                        )},
                        ps.show_referrals !== false && { to: '/referrals', label: 'Referrals', icon: (
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 5.5l3.5-2M7 6.5l3.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2 13c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        )},
                      ].filter(Boolean).map(item => (
                        <Link
                          key={item.to}
                          to={item.to}
                          className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-brand/5 hover:border-brand/20 border border-transparent transition-all text-center group"
                        >
                          <div className="text-gray-400 group-hover:text-brand transition-colors">
                            {item.icon}
                          </div>
                          <span className="text-xs font-semibold text-navy">{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
