import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { useToast } from '../../components/ui/Toast'

// ── Stage → script category mapping ──────────────────────────────────────────
// Derived from the seeded script categories in supabase-migration-v2.sql
const STAGE_SCRIPT_CATEGORIES = {
  1: ['Cold Outreach'],
  2: ['Follow Up'],
  3: ['Proposal & Pricing'],
  4: ['Handling Objections'],
  5: ['Mid-Build Update'],
  6: ['Review & Feedback'],
  7: ['Final Delivery'],
  8: ['Testimonial Request', 'Retainer Pitch', 'Referral Ask'],
}

const STAGE_COLORS = [
  '#6c63ff', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#22c55e', '#f97316', '#ec4899', '#22c55e',
]

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="wg-sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

// ── Left panel — vertical stage stepper ──────────────────────────────────────
function StageStepper({ guidance, selectedStage, onSelect, liveStageNum }) {
  return (
    <nav aria-label="Workflow stages" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {guidance.map((g, idx) => {
        const isSelected  = selectedStage === g.stage_number
        const isLiveCurrent = liveStageNum === g.stage_number
        const isLiveDone    = liveStageNum != null && g.stage_number < liveStageNum
        const color = STAGE_COLORS[idx]

        return (
          <div key={g.stage_number} style={{ display: 'flex', alignItems: 'stretch' }}>
            {/* Vertical timeline line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: isLiveDone ? color : isSelected ? color : 'var(--bg-tertiary)',
                border: isSelected && !isLiveDone ? `2.5px solid ${color}` : isLiveCurrent ? `2.5px solid ${color}` : '2px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800,
                color: (isLiveDone || (isSelected && !isLiveDone)) ? 'white' : 'var(--text-muted)',
                transition: 'all 0.2s ease',
                marginTop: 10,
              }}>
                {isLiveDone ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : g.stage_number}
              </div>
              {idx < guidance.length - 1 && (
                <div style={{
                  width: 2, flex: 1, minHeight: 8,
                  background: isLiveDone ? color : 'var(--border-color)',
                  opacity: isLiveDone ? 0.5 : 0.4, marginTop: 2
                }} />
              )}
            </div>

            {/* Stage button */}
            <button
              onClick={() => onSelect(g.stage_number)}
              aria-current={isSelected ? 'true' : undefined}
              style={{
                flex: 1, textAlign: 'left', padding: '10px 10px 10px 8px',
                background: isSelected ? `${color}14` : 'none',
                border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                borderLeft: `3px solid ${isSelected ? color : 'transparent'}`,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                fontSize: 12, fontWeight: isSelected ? 700 : 500,
                color: isSelected ? color : 'var(--text-secondary)',
                lineHeight: 1.3
              }}>
                {g.stage_name}
              </div>
              {isLiveCurrent && (
                <div style={{
                  fontSize: 9, fontWeight: 700, color: color, marginTop: 2,
                  textTransform: 'uppercase', letterSpacing: '0.3px'
                }}>
                  ● Current
                </div>
              )}
            </button>
          </div>
        )
      })}
    </nav>
  )
}

// ── Checklist item ────────────────────────────────────────────────────────────
function ChecklistItem({ item, checked, onChange, disabled }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer',
      padding: '8px 10px', borderRadius: 'var(--radius-sm)',
      background: checked ? 'rgba(34,197,94,0.06)' : 'transparent',
      transition: 'background 0.15s ease',
    }}>
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 1 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-label={item.item}
          style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
        />
        <div style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: checked ? '2px solid #22c55e' : '2px solid var(--border-color)',
          background: checked ? '#22c55e' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}>
          {checked && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
              <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 13, color: checked ? 'var(--text-muted)' : 'var(--text-primary)',
        lineHeight: 1.5, textDecoration: checked ? 'line-through' : 'none',
        transition: 'all 0.15s ease',
      }}>
        {item.item}
      </span>
    </label>
  )
}

// ── Script card ───────────────────────────────────────────────────────────────
function ScriptCard({ script }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(script.body).then(() => {
      setCopied(true)
      toast.success(`"${script.title}" copied to clipboard.`)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      toast.error('Unable to copy to clipboard.')
    })
  }

  return (
    <div style={{
      border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
      overflow: 'hidden', background: 'var(--bg-secondary)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-color)',
        gap: 12
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {script.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {script.category}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCopy}
          aria-label={`Copy script: ${script.title}`}
          style={{ flexShrink: 0, minWidth: 80 }}
        >
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '12px 14px', fontSize: 12, lineHeight: 1.7,
        color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontFamily: 'inherit', maxHeight: 220, overflowY: 'auto',
        background: 'var(--bg-tertiary)'
      }}>
        {script.body}
      </pre>
    </div>
  )
}

// ── Stage content panel ───────────────────────────────────────────────────────
function StagePanel({
  guidance, scripts, selectedStage,
  localChecked, onLocalCheck,
  liveMode, liveChecked, onLiveCheck, savingId,
}) {
  const g = guidance.find(x => x.stage_number === selectedStage)
  if (!g) return null

  const stageScripts = (STAGE_SCRIPT_CATEGORIES[selectedStage] || [])
    .flatMap(cat => scripts.filter(s => s.category === cat))

  const checklist = [...(g.checklist || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
  const checked   = liveMode ? liveChecked : localChecked

  const doneCount  = checklist.filter(item => checked[item.id]).length
  const totalCount = checklist.length
  const color      = STAGE_COLORS[selectedStage - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Stage heading */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color
          }} />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {g.stage_name}
          </h2>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
            background: `${color}18`, color }}>
            Stage {selectedStage} of 8
          </span>
        </div>
      </div>

      {/* What to do */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px 0' }}>
          What to do
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
          {g.what_to_do}
        </p>
      </div>

      {/* Checklist */}
      {checklist.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
              Checklist
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {liveMode && (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', padding: '1px 6px', borderRadius: 99, background: 'rgba(34,197,94,0.1)' }}>
                  Saving to project
                </span>
              )}
              <span style={{ fontSize: 11, color: doneCount === totalCount ? '#22c55e' : 'var(--text-muted)' }}>
                {doneCount} / {totalCount}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-tertiary)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: color,
              width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {checklist.map(item => (
              <ChecklistItem
                key={item.id}
                item={item}
                checked={!!checked[item.id]}
                disabled={savingId === item.id}
                onChange={() => {
                  liveMode ? onLiveCheck(item.id, !checked[item.id]) : onLocalCheck(item.id, !checked[item.id])
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scripts */}
      {stageScripts.length > 0 && (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px 0' }}>
            Scripts for this stage
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stageScripts.map(s => <ScriptCard key={s.id} script={s} />)}
          </div>
        </div>
      )}

      {/* Tips */}
      {g.tips && (
        <div style={{
          padding: '14px 16px', borderRadius: 'var(--radius-md)',
          background: `${color}0d`, border: `1px solid ${color}30`
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            💡 Tips
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            {g.tips}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkflowGuidePage() {
  const { toast } = useToast()

  // ── Data
  const [guidance, setGuidance]     = useState([])
  const [scripts, setScripts]       = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  // ── Navigation
  const [selectedStage, setSelectedStage] = useState(1)

  // ── Local checklist state (not persisted) — per stage
  const [localChecked, setLocalChecked] = useState({})

  // ── Live Project Mode
  const [liveMode, setLiveMode]           = useState(false)
  const [activeProjects, setActiveProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState('')
  const [liveChecked, setLiveChecked]     = useState({})
  const [liveStageNum, setLiveStageNum]   = useState(null)
  const [savingId, setSavingId]           = useState(null)
  const [stageRowId, setStageRowId]       = useState(null)

  // ── Fetch guidance + scripts on mount ─────────────────────────────────────
  useEffect(() => {
    async function loadStaticData() {
      const [{ data: gData, error: gErr }, { data: sData, error: sErr }] = await Promise.all([
        supabase
          .from('workflow_guidance')
          .select('id, stage_number, stage_name, what_to_do, checklist, tips')
          .order('stage_number'),
        supabase
          .from('scripts')
          .select('id, category, title, body, tags')
          .order('category')
          .order('title'),
      ])

      if (gErr) console.error('[WorkflowGuide] guidance fetch:', gErr)
      if (sErr) console.error('[WorkflowGuide] scripts fetch:', sErr)

      setGuidance(gData || [])
      setScripts(sData || [])
      setDataLoading(false)
    }

    loadStaticData()
  }, [])

  // ── Fetch active projects when live mode is turned on ─────────────────────
  useEffect(() => {
    if (!liveMode) return
    setProjectsLoading(true)
    supabase
      .from('projects')
      .select('id, title, status, current_stage, profiles!client_id (full_name)')
      .neq('status', 'complete')
      .order('title')
      .then(({ data, error }) => {
        if (error) console.error('[WorkflowGuide] active projects:', error)
        setActiveProjects(data || [])
        setProjectsLoading(false)
      })
  }, [liveMode])

  // ── Load project_stages checklist_state when project or stage changes ─────
  useEffect(() => {
    if (!liveMode || !activeProjectId) {
      setLiveChecked({})
      setLiveStageNum(null)
      setStageRowId(null)
      return
    }

    // Find the project's current stage number for the stepper indicator
    const proj = activeProjects.find(p => p.id === activeProjectId)
    if (proj) setLiveStageNum(proj.current_stage)

    // Load checklist_state for the currently viewed stage
    supabase
      .from('project_stages')
      .select('id, checklist_state')
      .eq('project_id', activeProjectId)
      .eq('stage_number', selectedStage)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          console.error('[WorkflowGuide] stage row fetch:', error)
        }
        if (data) {
          setStageRowId(data.id)
          // Build checked map from checklist_state array
          const map = {}
          ;(data.checklist_state || []).forEach(s => { map[s.id] = s.checked })
          setLiveChecked(map)
        } else {
          setStageRowId(null)
          setLiveChecked({})
        }
      })
  }, [liveMode, activeProjectId, selectedStage, activeProjects])

  // ── Local check handler ───────────────────────────────────────────────────
  function handleLocalCheck(itemId, value) {
    setLocalChecked(prev => ({ ...prev, [itemId]: value }))
  }

  // ── Live check handler — saves immediately to project_stages ─────────────
  async function handleLiveCheck(itemId, value) {
    // Optimistic update
    setLiveChecked(prev => ({ ...prev, [itemId]: value }))
    setSavingId(itemId)

    try {
      const currentGuidance = guidance.find(g => g.stage_number === selectedStage)
      if (!currentGuidance) return

      // Build full checklist_state from current liveChecked + this change
      const newState = (currentGuidance.checklist || []).map(item => ({
        id:      item.id,
        checked: item.id === itemId ? value : !!(liveChecked[item.id])
      }))

      const { error } = await supabase
        .from('project_stages')
        .update({ checklist_state: newState })
        .eq('project_id', activeProjectId)
        .eq('stage_number', selectedStage)

      if (error) throw error
    } catch (err) {
      console.error('[WorkflowGuide] live save:', err)
      // Roll back optimistic update
      setLiveChecked(prev => ({ ...prev, [itemId]: !value }))
      toast.error('Failed to save checklist item.')
    } finally {
      setSavingId(null)
    }
  }

  // ── Toggle live mode ──────────────────────────────────────────────────────
  function handleToggleLiveMode(enabled) {
    setLiveMode(enabled)
    if (!enabled) {
      setActiveProjectId('')
      setLiveChecked({})
      setLiveStageNum(null)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', gap: 20, padding: '0 4px' }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width="100%" height={42} style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton width={300} height={26} />
          <Skeleton width="100%" height={100} />
          <Skeleton width="100%" height={200} />
        </div>
        <style>{`.wg-sk-pulse{animation:wgSk 1.6s ease-in-out infinite}@keyframes wgSk{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
      </div>
    )
  }

  // ── Empty state if no guidance loaded ─────────────────────────────────────
  if (guidance.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          No workflow guidance found
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Run the SQL migration to seed workflow_guidance data.
        </div>
      </div>
    )
  }

  const selectedProject = activeProjects.find(p => p.id === activeProjectId)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Live Project Mode bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
        background: liveMode ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)',
        border: '1px solid',
        borderColor: liveMode ? 'rgba(34,197,94,0.25)' : 'var(--border-color)',
        borderRadius: 'var(--radius-md)', marginBottom: 20, flexWrap: 'wrap',
        transition: 'all 0.2s ease',
      }}>
        {/* Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <div
            role="switch"
            aria-checked={liveMode}
            aria-label="Live Project Mode"
            onClick={() => handleToggleLiveMode(!liveMode)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleToggleLiveMode(!liveMode)}
            tabIndex={0}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
              background: liveMode ? '#22c55e' : 'var(--bg-tertiary)',
              border: '1px solid',
              borderColor: liveMode ? '#22c55e' : 'var(--border-color)',
              position: 'relative', transition: 'all 0.2s ease', flexShrink: 0
            }}
          >
            <div style={{
              position: 'absolute', top: 2,
              left: liveMode ? 17 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: 'white', transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: liveMode ? '#22c55e' : 'var(--text-secondary)'
          }}>
            Live Project Mode
          </span>
        </label>

        {/* Description when off */}
        {!liveMode && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Enable to sync checklist state with a real project.
          </span>
        )}

        {/* Project dropdown when on */}
        {liveMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <select
              className="input"
              value={activeProjectId}
              onChange={e => setActiveProjectId(e.target.value)}
              style={{ maxWidth: 320, height: 34, fontSize: 13 }}
              aria-label="Select active project"
            >
              <option value="">
                {projectsLoading ? 'Loading projects…' : '— Select a project —'}
              </option>
              {activeProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}{p.profiles?.full_name ? ` (${p.profiles.full_name})` : ''}
                </option>
              ))}
            </select>

            {selectedProject && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Current stage:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {guidance.find(g => g.stage_number === selectedProject.current_stage)?.stage_name || '—'}
                </strong>
              </span>
            )}

            {!activeProjectId && !projectsLoading && activeProjects.length === 0 && (
              <span style={{ fontSize: 12, color: '#f59e0b' }}>
                No active projects found.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', gap: 20, overflow: 'hidden', minHeight: 0 }}>

        {/* Left panel — stage stepper */}
        <div style={{
          width: 220, flexShrink: 0, overflowY: 'auto',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', padding: '12px 8px',
        }}>
          <StageStepper
            guidance={guidance}
            selectedStage={selectedStage}
            onSelect={stageNum => {
              setSelectedStage(stageNum)
              setLocalChecked({}) // reset local state on stage switch
            }}
            liveStageNum={liveMode && activeProjectId ? liveStageNum : null}
          />
        </div>

        {/* Right panel — stage content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedStage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <StagePanel
                guidance={guidance}
                scripts={scripts}
                selectedStage={selectedStage}
                localChecked={localChecked}
                onLocalCheck={handleLocalCheck}
                liveMode={liveMode && !!activeProjectId}
                liveChecked={liveChecked}
                onLiveCheck={handleLiveCheck}
                savingId={savingId}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .wg-sk-pulse { animation: wgSk 1.6s ease-in-out infinite; }
        @keyframes wgSk { 0%,100%{opacity:.9} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}
