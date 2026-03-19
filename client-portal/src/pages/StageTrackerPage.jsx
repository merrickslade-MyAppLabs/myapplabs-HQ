import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

// ── Stage content ─────────────────────────────────────────────────────────────
// Client-facing descriptions — intentionally separate from the admin-facing
// workflow_guidance table which contains internal team instructions.

const STAGE_INFO = {
  1: {
    name: 'Qualification',
    description:
      "We're exploring whether we're the right fit for your project and getting a clear picture of what you need — no commitment required at this stage.",
    next: "We'll schedule a discovery session to explore your goals and requirements in detail.",
  },
  2: {
    name: 'Discovery',
    description:
      "We're asking all the right questions before a single line of code is written — diving deep into your goals, users, and technical needs to make sure we build the right thing.",
    next: "We'll prepare a detailed proposal, scope of work, and quote for your review.",
  },
  3: {
    name: 'Proposal',
    description:
      "We've prepared a full scope of work covering what we'll build, how long it'll take, and the investment required. Please review and let us know if you have any questions.",
    next: "Once you approve the proposal we'll book a kickoff session to officially start the project.",
  },
  4: {
    name: 'Kickoff',
    description:
      "Your project is officially underway. We're setting up tools, environments, and workflows — everything needed before development begins in earnest.",
    next: "Development starts now. Expect regular updates and check-ins from the team.",
  },
  5: {
    name: 'Build',
    description:
      "We're actively designing and building your application. This is where the work happens. We'll keep you updated with progress and reach out if we have questions.",
    next: "When a preview is ready to share, we'll move into the review stage so you can explore it and give feedback.",
  },
  6: {
    name: 'Review',
    description:
      "We've shared a preview of your project. This is your chance to explore it, test it, and give feedback. We'll work through any adjustments before moving to launch.",
    next: "Once you're happy with everything, we'll move to final delivery and launch preparation.",
  },
  7: {
    name: 'Delivery',
    description:
      "We're applying the finishing touches and preparing everything for launch — including handover documentation, training materials, and production setup.",
    next: "Your project goes live. We'll support the launch and make sure everything is running smoothly.",
  },
  8: {
    name: 'Complete',
    description:
      "Your project is complete and live. Thank you for working with us — it's been a pleasure building something great together. We're here if you need anything.",
    next: null,
  },
}

const STATUS_TO_STAGE = {
  qualification: 1, discovery: 2, proposal: 3, kickoff: 4,
  build: 5, review: 6, delivery: 7, complete: 8,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

// ── Stage row ─────────────────────────────────────────────────────────────────

function StageRow({ n, info, state, isLast }) {
  // state: 'complete' | 'current' | 'upcoming'
  const isPast    = state === 'complete'
  const isCurrent = state === 'current'

  return (
    <div className="flex gap-4 sm:gap-6">
      {/* Left: circle + connector */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0 transition-all"
          style={{
            background:  isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#fff',
            borderColor: isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#d1d5db',
            color:       isCurrent || isPast ? '#fff' : '#9ca3af',
            boxShadow:   isCurrent ? '0 0 0 5px rgba(232,98,42,0.15)' : 'none',
          }}
        >
          {isPast
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7l3.5 3.5 5.5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : n
          }
        </div>
        {!isLast && (
          <div
            className="w-0.5 flex-1 mt-2"
            style={{ background: isPast ? '#0B1F3A' : '#e5e7eb', minHeight: 32 }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className={`pb-8 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-base font-bold"
            style={{ color: isCurrent ? '#E8622A' : isPast ? '#0B1F3A' : '#9ca3af' }}
          >
            {info.name}
          </span>
          {isCurrent && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
              Current stage
            </span>
          )}
          {isPast && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-navy/8 text-navy-400 border border-navy/10"
              style={{ background: 'rgba(11,31,58,0.06)', color: '#6b7280' }}>
              Complete
            </span>
          )}
        </div>

        {/* Description — show for current and completed only */}
        {(isCurrent || isPast) && (
          <p className="text-sm leading-relaxed mb-2"
            style={{ color: isCurrent ? '#374151' : '#9ca3af' }}>
            {info.description}
          </p>
        )}

        {/* Upcoming label */}
        {!isPast && !isCurrent && (
          <p className="text-sm text-gray-400">Upcoming</p>
        )}

        {/* What comes next — current stage only */}
        {isCurrent && info.next && (
          <div className="mt-3 p-3.5 rounded-xl border flex items-start gap-2.5"
            style={{ background: 'rgba(232,98,42,0.04)', borderColor: 'rgba(232,98,42,0.15)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5" aria-hidden="true">
              <path d="M5 2l5 5-5 5" stroke="#E8622A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
              <span className="font-semibold">What comes next: </span>{info.next}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-4', w = 'w-full' }) {
  return <div className={`${h} ${w} rounded-lg bg-gray-100 animate-pulse`} />
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StageTrackerPage() {
  const { user } = useAuth()

  const [projects,    setProjects]    = useState([])
  const [selectedId,  setSelectedId]  = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('id, name, status, deadline, description')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = data ?? []
        setProjects(rows)
        if (rows.length > 0) setSelectedId(rows[0].id)
        setLoading(false)
      })
  }, [user])

  const project     = projects.find(p => p.id === selectedId) ?? null
  const currentStage = project ? (STATUS_TO_STAGE[project.status] ?? 1) : 1

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy">Project Stages</h1>
          <p className="text-sm text-gray-500 mt-1">
            A live view of where your project stands and what comes next.
          </p>
        </div>

        {loading ? (
          <div className="card p-6 space-y-4">
            <Skeleton h="h-6" w="w-48" />
            <Skeleton h="h-4" w="w-64" />
            <Skeleton h="h-32" />
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-10 text-center text-gray-400 text-sm">
            No project data available yet.
          </div>
        ) : (
          <>
            {/* Project selector (multiple projects only) */}
            {projects.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
                    style={{
                      background:  selectedId === p.id ? '#0B1F3A' : '#fff',
                      color:       selectedId === p.id ? '#fff' : '#0B1F3A',
                      borderColor: selectedId === p.id ? '#0B1F3A' : '#d1d5db',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {project && (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Project header card */}
                <div className="card p-6 mb-6">
                  <h2 className="text-lg font-bold text-navy mb-1">{project.name}</h2>
                  {project.description && (
                    <p className="text-sm text-gray-500 leading-relaxed mb-3">
                      {project.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                        Current stage
                      </div>
                      <div className="text-sm font-semibold text-brand">
                        {currentStage}. {STAGE_INFO[currentStage]?.name}
                      </div>
                    </div>
                    {project.deadline && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                          Estimated delivery
                        </div>
                        <div className="text-sm font-semibold text-navy">
                          {fmtDate(project.deadline)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                        Progress
                      </div>
                      <div className="text-sm font-semibold text-navy">
                        Stage {currentStage} of 8
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((currentStage - 1) / 7) * 100}%`,
                        background: 'linear-gradient(90deg, #0B1F3A, #E8622A)',
                        minWidth: currentStage === 1 ? 8 : undefined,
                      }}
                    />
                  </div>
                </div>

                {/* Stage timeline */}
                <div className="card p-6 sm:p-8">
                  {Array.from({ length: 8 }, (_, i) => {
                    const n     = i + 1
                    const state = n < currentStage ? 'complete' : n === currentStage ? 'current' : 'upcoming'
                    return (
                      <StageRow
                        key={n}
                        n={n}
                        info={STAGE_INFO[n]}
                        state={state}
                        isLast={n === 8}
                      />
                    )
                  })}
                </div>

              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
