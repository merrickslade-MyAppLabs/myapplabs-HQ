import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../supabase/client'
import {
  subscribeToTable,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'
import TaskForm from './TaskForm'

// ── Status config — matches task_status enum exactly ─────────────
const STATUS_MAP = {
  todo:        { label: 'Not started', bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  in_progress: { label: 'In Progress', bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  done:        { label: 'Done',        bg: 'rgba(16,185,129,0.15)',  color: '#10b981' }
}

// ── Priority config — matches task_priority enum exactly ─────────
const PRIORITY_MAP = {
  high:   { label: 'High',   bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
  medium: { label: 'Medium', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  low:    { label: 'Low',    bg: 'rgba(16,185,129,0.12)', color: '#10b981' }
}

const ASSIGNEE_OPTIONS = ['Merrick Slade', 'Sam Blakesley']

// ── Tag palette ──────────────────────────────────────────────────
const TAG_PALETTE = [
  { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
  { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6' },
  { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  { bg: 'rgba(20,184,166,0.15)', text: '#14b8a6' },
  { bg: 'rgba(236,72,153,0.15)', text: '#ec4899' },
]
function getTagColour(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

// ── Chip ─────────────────────────────────────────────────────────
function Chip({ label, bg, color }) {
  if (!label) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      background: bg, color,
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {label}
    </span>
  )
}

// ── Assignee avatar ──────────────────────────────────────────────
function Avatar({ name, size = 22 }) {
  if (!name) return null
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (parts[0]?.[0] || '?').toUpperCase()
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  const COLORS = ['#6c63ff','#4f8ef7','#4caf6a','#d4863a','#e11d6a','#06b6d4']
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: COLORS[Math.abs(hash) % COLORS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38) + 'px', fontWeight: 700, color: '#fff',
      flexShrink: 0, letterSpacing: '-0.5px'
    }}>
      {initials}
    </div>
  )
}

// ── Sortable column header ───────────────────────────────────────
function ColHeader({ label, sortKey, sortBy, sortDir, onSort, style }) {
  const active = sortBy === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 12px', textAlign: 'left',
        fontSize: '11px', fontWeight: 600,
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        position: 'sticky', top: 0, zIndex: 1,
        ...style
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {label}
        {active && (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ opacity: 0.7 }}>
            {sortDir === 'asc'
              ? <path d="M4.5 1.5L8 7H1L4.5 1.5z" fill="currentColor"/>
              : <path d="M4.5 7.5L1 2H8L4.5 7.5z" fill="currentColor"/>
            }
          </svg>
        )}
      </span>
    </th>
  )
}

// ── Inline cell dropdown ─────────────────────────────────────────
function InlineCellDropdown({ activeCell, tasks, projects, onPatch, onClose }) {
  const panelRef = useRef()
  const inputRef = useRef()

  // Local state for tag editing
  const [localTags, setLocalTags] = useState([])
  const [tagInput, setTagInput]   = useState('')

  // Sync localTags whenever a tags cell is opened
  useEffect(() => {
    if (activeCell?.field === 'tags') {
      const task = tasks.find(t => t.id === activeCell.taskId)
      setLocalTags(task?.tags || [])
      setTagInput('')
    }
  }, [activeCell?.taskId, activeCell?.field])

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!activeCell) return null
  const task = tasks.find(t => t.id === activeCell.taskId)
  if (!task) return null

  const { rect, field } = activeCell
  const winH = window.innerHeight
  const approxPanelH = 240
  const placeAbove = rect.bottom + approxPanelH > winH - 20

  const panelStyle = {
    position: 'fixed',
    top: placeAbove ? rect.top - 4 : rect.bottom + 4,
    left: Math.min(rect.left, window.innerWidth - 200),
    transform: placeAbove ? 'translateY(-100%)' : 'none',
    zIndex: 9999,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
    minWidth: Math.max(rect.width + 16, 160),
    overflow: 'hidden',
    animation: 'cell-drop-in 0.1s ease'
  }

  const Checkmark = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent-primary)' }}>
      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )

  function OptRow({ isActive, onClick, children }) {
    const [hov, setHov] = useState(false)
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 10px', borderRadius: 6,
          cursor: 'pointer',
          background: isActive || hov ? 'var(--bg-tertiary)' : 'transparent',
          transition: 'background 0.08s'
        }}
      >
        {children}
        {isActive && <Checkmark />}
      </div>
    )
  }

  let content = null

  // ─ Status ─────────────────────────────────────────────────────
  if (field === 'status') {
    content = (
      <div style={{ padding: '4px' }}>
        {Object.entries(STATUS_MAP).map(([val, cfg]) => (
          <OptRow key={val} isActive={task.status === val} onClick={() => onPatch(task.id, { status: val })}>
            <Chip label={cfg.label} bg={cfg.bg} color={cfg.color} />
          </OptRow>
        ))}
      </div>
    )

  // ─ Priority ───────────────────────────────────────────────────
  } else if (field === 'priority') {
    content = (
      <div style={{ padding: '4px' }}>
        {Object.entries(PRIORITY_MAP).map(([val, cfg]) => (
          <OptRow key={val} isActive={task.priority === val} onClick={() => onPatch(task.id, { priority: val })}>
            <Chip label={cfg.label} bg={cfg.bg} color={cfg.color} />
          </OptRow>
        ))}
      </div>
    )

  // ─ Assignee (single-select) ───────────────────────────────────
  } else if (field === 'assignee') {
    content = (
      <div style={{ padding: '4px', minWidth: '180px' }}>
        <OptRow isActive={!task.assignee} onClick={() => onPatch(task.id, { assignee: null })}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Unassigned</span>
        </OptRow>
        {ASSIGNEE_OPTIONS.map(a => (
          <OptRow
            key={a}
            isActive={task.assignee === a}
            onClick={() => onPatch(task.id, { assignee: a })}
          >
            <Avatar name={a} size={20} />
            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{a}</span>
          </OptRow>
        ))}
      </div>
    )

  // ─ Due Date ───────────────────────────────────────────────────
  } else if (field === 'dueDate') {
    content = (
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Due Date
        </div>
        <input
          ref={inputRef}
          type="date"
          className="input"
          defaultValue={task.dueDate || ''}
          autoFocus
          style={{ width: '100%', fontSize: '13px' }}
          onKeyDown={e => {
            if (e.key === 'Enter') onPatch(task.id, { dueDate: e.target.value || null })
          }}
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: '12px' }}>Cancel</button>
          {task.dueDate && (
            <button className="btn btn-ghost btn-sm" onClick={() => onPatch(task.id, { dueDate: null })} style={{ fontSize: '12px', color: 'var(--danger)' }}>Clear</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => onPatch(task.id, { dueDate: inputRef.current?.value || null })} style={{ fontSize: '12px' }}>
            Set Date
          </button>
        </div>
      </div>
    )

  // ─ Linked Project ─────────────────────────────────────────────
  } else if (field === 'projectId') {
    content = (
      <div style={{ padding: '4px', minWidth: '220px' }}>
        <OptRow isActive={!task.projectId} onClick={() => onPatch(task.id, { projectId: null })}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>— Not linked —</span>
        </OptRow>
        {projects.map(p => (
          <OptRow key={p.id} isActive={task.projectId === p.id} onClick={() => onPatch(task.id, { projectId: p.id })}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{p.name}</span>
            {p.clientName && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{p.clientName}</span>
            )}
          </OptRow>
        ))}
      </div>
    )

  // ─ Tags ───────────────────────────────────────────────────────
  } else if (field === 'tags') {
    function addLocalTag(raw) {
      const tag = raw.trim().replace(/,/g, '')
      if (tag && !localTags.includes(tag)) setLocalTags(prev => [...prev, tag])
      setTagInput('')
    }
    content = (
      <div style={{ padding: '10px 12px', minWidth: '240px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Tags
        </div>
        {localTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
            {localTags.map(tag => {
              const c = getTagColour(tag)
              return (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '2px 8px', borderRadius: 99,
                  background: c.bg, color: c.text, fontSize: '11px', fontWeight: 600
                }}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => setLocalTags(prev => prev.filter(t => t !== tag))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </span>
              )
            })}
          </div>
        )}
        <input
          type="text"
          className="input"
          placeholder="Add tag — press Enter or ,"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLocalTag(tagInput) }
            else if (e.key === 'Backspace' && !tagInput && localTags.length > 0) setLocalTags(prev => prev.slice(0, -1))
          }}
          onBlur={() => { if (tagInput.trim()) addLocalTag(tagInput) }}
          autoFocus
          style={{ width: '100%', fontSize: '12.5px' }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
          Press <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: 3, fontSize: '10px' }}>Enter</kbd>
          {' '}or{' '}
          <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: 3, fontSize: '10px' }}>,</kbd>
          {' '}to add · <kbd style={{ padding: '1px 4px', border: '1px solid var(--border-color)', borderRadius: 3, fontSize: '10px' }}>⌫</kbd> to remove last
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: '12px' }}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onPatch(task.id, { tags: localTags })} style={{ fontSize: '12px' }}>Save</button>
        </div>
      </div>
    )

  // ─ Task Name (Title) ──────────────────────────────────────────
  } else if (field === 'title') {
    content = (
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Task Title
        </div>
        <input
          ref={inputRef}
          type="text"
          className="input"
          defaultValue={task.title}
          autoFocus
          style={{ width: '100%', fontSize: '13px', minWidth: '260px' }}
          onKeyDown={e => {
            if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) onPatch(task.id, { title: v }) }
          }}
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: '12px' }}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => { const v = inputRef.current?.value.trim(); if (v) onPatch(task.id, { title: v }) }} style={{ fontSize: '12px' }}>
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={panelRef} style={panelStyle}>
      {content}
    </div>
  )
}

// ── Editable cell TD ─────────────────────────────────────────────
function EditCell({ children, onOpen, style, isRowHovered }) {
  const [hov, setHov] = useState(false)
  return (
    <td
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ padding: '11px 12px', cursor: 'pointer', ...style }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
        {children}
        {hov && isRowHovered && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--text-muted)', opacity: 0.55, flexShrink: 0 }}>
            <path d="M7 1.5l1.5 1.5-5.5 5.5H1.5V7L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </td>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function TasksPage() {
  const toast = useToast()
  const [tasks, setTasks]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [projects, setProjects]         = useState([])   // for filter + form dropdown
  const [modalOpen, setModalOpen]       = useState(false)
  const [editingTask, setEditingTask]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [hoveredRow, setHoveredRow]     = useState(null)

  // Multi-select
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Inline cell editing
  const [activeCell, setActiveCell] = useState(null)

  // Filters & sort
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterProject, setFilterProject]   = useState('all')
  const [sortBy, setSortBy]                 = useState('createdAt')
  const [sortDir, setSortDir]               = useState('desc')

  // ── Subscribe to tasks ────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToTable(TABLES.TASKS, (docs, err) => {
      if (err) setError('Failed to load tasks.')
      else { setTasks(docs); setError(null) }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // ── Fetch projects for dropdown/filter ────────────────────────
  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, client_name, status')
      .neq('status', 'complete')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setProjects((data || []).map(p => ({
          id:         p.id,
          name:       p.name,
          clientName: p.client_name || ''
        })))
      })
  }, [])

  function handleSort(key) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const visibleTasks = useMemo(() => {
    let list = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.assignee?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all')   list = list.filter(t => t.status === filterStatus)
    if (filterAssignee !== 'all') list = list.filter(t => t.assignee === filterAssignee)
    if (filterPriority !== 'all') list = list.filter(t => t.priority === filterPriority)
    if (filterProject !== 'all')  list = list.filter(t => t.projectId === filterProject)

    return [...list].sort((a, b) => {
      let va = a[sortBy] ?? ''
      let vb = b[sortBy] ?? ''
      if (sortBy === 'dueDate') { va = va || '9999-99-99'; vb = vb || '9999-99-99' }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tasks, search, filterStatus, filterAssignee, filterPriority, filterProject, sortBy, sortDir])

  function openAdd()      { setEditingTask(null); setModalOpen(true) }
  function openEdit(task) { setEditingTask(task); setModalOpen(true) }
  function closeModal()   { setModalOpen(false); setEditingTask(null) }

  function openCell(e, taskId, field) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setActiveCell({ taskId, field, rect })
  }

  const closeCellDropdown = useCallback(() => setActiveCell(null), [])

  async function patchTask(taskId, updates) {
    const { error: err } = await updateRecord(TABLES.TASKS, taskId, updates)
    if (err) toast('Failed to update.', 'error')
    setActiveCell(null)
  }

  async function handleSave(formData) {
    setSaving(true)
    if (editingTask) {
      const { error: err } = await updateRecord(TABLES.TASKS, editingTask.id, formData)
      if (err) toast('Failed to update task.', 'error')
      else { toast('Task updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.TASKS, formData)
      if (err) toast('Failed to add task.', 'error')
      else { toast('Task added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.TASKS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete task.', 'error')
    else toast('Task deleted.', 'info')
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleTasks.length && visibleTasks.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleTasks.map(t => t.id)))
    }
  }

  async function handleBulkDelete() {
    if (!selectedIds.size) return
    setBulkDeleting(true)
    const ids = [...selectedIds]
    let failed = 0
    for (const id of ids) {
      const { error: err } = await deleteRecord(TABLES.TASKS, id)
      if (err) failed++
    }
    setBulkDeleting(false)
    setSelectedIds(new Set())
    if (failed > 0) toast(`${failed} task(s) failed to delete.`, 'error')
    else toast(`${ids.length} task${ids.length !== 1 ? 's' : ''} deleted.`, 'info')
  }

  const hasFilters = search || filterStatus !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all' || filterProject !== 'all'
  function clearFilters() {
    setSearch(''); setFilterStatus('all'); setFilterAssignee('all')
    setFilterPriority('all'); setFilterProject('all')
  }

  // Project name lookup for display in table rows
  const projectMap = useMemo(() => {
    const m = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  if (error) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--danger)', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Connection Error</div>
          <div style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '20px 24px 14px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div className="page-title">Task Board</div>
            <div className="page-subtitle">
              {loading ? 'Loading…' : `${visibleTasks.length} of ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add Task
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '200px' }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none'
            }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              className="input" placeholder="Search tasks…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '30px', height: '32px', fontSize: '12.5px' }}
            />
          </div>

          <select className="input select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '130px', width: 'auto' }}>
            <option value="all">All statuses</option>
            <option value="todo">Not started</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>

          <select className="input select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '130px', width: 'auto' }}>
            <option value="all">All assignees</option>
            {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a.split(' ')[0]}</option>)}
          </select>

          <select className="input select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '120px', width: 'auto' }}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select className="input select" value={filterProject} onChange={e => setFilterProject(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '140px', width: 'auto' }}>
            <option value="all">All projects</option>
            <option value="none">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginTop: '10px', padding: '8px 12px',
            background: 'var(--accent-primary-muted)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-md)'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>
              {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setSelectedIds(new Set())}
              style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
            >
              Deselect all
            </button>
            <button
              className="btn btn-sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{ fontSize: '12px', color: 'var(--danger)', background: 'var(--danger-muted)', border: '1px solid var(--danger-muted)', marginLeft: 'auto' }}
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </button>
          </div>
        )}
      </div>

      {/* ── Table area ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ height: '42px', borderRadius: 6, background: 'var(--bg-tertiary)', animation: 'task-pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.07}s` }} />
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: '12px', color: 'var(--text-muted)', padding: '40px' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.2 }}>
              <rect x="6" y="6" width="36" height="36" rx="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M14 18h20M14 25h14M14 32h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>No tasks found</div>
            <div style={{ fontSize: '12.5px', textAlign: 'center' }}>
              {tasks.length === 0 ? 'Create your first task to get started' : 'Try adjusting your search or filters'}
            </div>
            {tasks.length === 0 && (
              <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ marginTop: '4px' }}>Add Task</button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '10px 8px 10px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  position: 'sticky', top: 0, zIndex: 1, width: 36
                }}>
                  <div
                    onClick={toggleSelectAll}
                    style={{
                      width: 15, height: 15, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                      border: `1.5px solid ${selectedIds.size > 0 && selectedIds.size === visibleTasks.length ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: selectedIds.size > 0 && selectedIds.size === visibleTasks.length ? 'var(--accent-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease'
                    }}
                  >
                    {selectedIds.size > 0 && selectedIds.size === visibleTasks.length && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {selectedIds.size > 0 && selectedIds.size < visibleTasks.length && (
                      <div style={{ width: 7, height: 1.5, background: 'var(--accent-primary)', borderRadius: 1 }} />
                    )}
                  </div>
                </th>
                <ColHeader label="Task"        sortKey="title"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 230, paddingLeft: 8 }} />
                <ColHeader label="Status"      sortKey="status"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 120 }} />
                <ColHeader label="Assignee"    sortKey="assignee"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 130 }} />
                <ColHeader label="Due date"    sortKey="dueDate"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 110 }} />
                <ColHeader label="Priority"    sortKey="priority"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 90 }} />
                <ColHeader label="Project"     sortKey="projectId" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 160 }} />
                <ColHeader label="Tags"        sortKey="tags"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 160 }} />
                <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1, minWidth: 64 }} />
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map(task => {
                const statusCfg = STATUS_MAP[task.status] || STATUS_MAP.todo
                const priorityCfg = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium
                const isHovered = hoveredRow === task.id

                const dueStr = task.dueDate
                  ? new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
                const isOverdue = task.dueDate && task.status !== 'done'
                  && new Date(task.dueDate + 'T23:59:59') < new Date()

                const linkedProject = task.projectId ? projectMap[task.projectId] : null

                return (
                  <tr
                    key={task.id}
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: selectedIds.has(task.id)
                        ? 'var(--accent-primary-muted)'
                        : isOverdue
                        ? 'rgba(239,68,68,0.04)'
                        : isHovered ? 'var(--bg-tertiary)' : 'transparent',
                      transition: 'background 0.1s ease',
                      borderBottom: `1px solid ${isOverdue ? 'rgba(239,68,68,0.15)' : 'var(--border-color)'}`
                    }}
                  >
                    {/* Row checkbox */}
                    <td
                      style={{ padding: '11px 8px 11px 16px', width: 36 }}
                      onClick={(e) => { e.stopPropagation(); toggleSelect(task.id) }}
                    >
                      <div style={{
                        width: 15, height: 15, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                        border: `1.5px solid ${selectedIds.has(task.id) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: selectedIds.has(task.id) ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease'
                      }}>
                        {selectedIds.has(task.id) && (
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </td>

                    {/* Task name — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'title')} style={{ paddingLeft: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isOverdue && (
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: '#ef4444', flexShrink: 0 }} title="Overdue">
                            <path d="M7 1L13 12H1L7 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                            <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        )}
                        <span style={{
                          fontSize: '13px', fontWeight: 600,
                          color: isOverdue ? '#ef4444' : 'var(--text-primary)',
                          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', maxWidth: 210
                        }}>
                          {task.title}
                        </span>
                      </div>
                    </EditCell>

                    {/* Status — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'status')}>
                      <Chip label={statusCfg.label} bg={statusCfg.bg} color={statusCfg.color} />
                    </EditCell>

                    {/* Assignee — inline edit (single) */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'assignee')}>
                      {task.assignee ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Avatar name={task.assignee} size={22} />
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {task.assignee.split(' ')[0]}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </EditCell>

                    {/* Due date — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'dueDate')}>
                      <span style={{
                        fontSize: '12.5px',
                        color: isOverdue ? '#ef4444' : 'var(--text-secondary)',
                        fontWeight: isOverdue ? 600 : 400,
                        whiteSpace: 'nowrap'
                      }}>
                        {dueStr}
                      </span>
                    </EditCell>

                    {/* Priority — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'priority')}>
                      <Chip label={priorityCfg.label} bg={priorityCfg.bg} color={priorityCfg.color} />
                    </EditCell>

                    {/* Linked project — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'projectId')}>
                      {linkedProject ? (
                        <div>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                            {linkedProject.name}
                          </div>
                          {linkedProject.clientName && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 1 }}>
                              {linkedProject.clientName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </EditCell>

                    {/* Tags — inline edit */}
                    <EditCell isRowHovered={isHovered} onOpen={e => openCell(e, task.id, 'tags')}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(task.tags || []).slice(0, 3).map(tag => {
                          const c = getTagColour(tag)
                          return (
                            <span key={tag} style={{
                              padding: '2px 7px', borderRadius: 99,
                              background: c.bg, color: c.text,
                              fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                            }}>
                              {tag}
                            </span>
                          )
                        })}
                        {(task.tags || []).length > 3 && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                            +{task.tags.length - 3}
                          </span>
                        )}
                        {(task.tags || []).length === 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </EditCell>

                    {/* Actions */}
                    <td style={{ padding: '11px 12px' }} onClick={e => e.stopPropagation()}>
                      {isHovered && (
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => openEdit(task)}
                            title="Edit task"
                            style={{ width: 26, height: 26, padding: 0 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setDeleteTarget(task)}
                            title="Delete task"
                            style={{ width: 26, height: 26, padding: 0, color: 'var(--danger)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 3h8M4.5 3V2h3v1M4 4.5v4M8 4.5v4M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Inline cell dropdown ── */}
      <InlineCellDropdown
        activeCell={activeCell}
        tasks={tasks}
        projects={projects}
        onPatch={patchTask}
        onClose={closeCellDropdown}
      />

      {/* ── Add / Edit modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTask ? 'Edit Task' : 'New Task'}
        size="md"
      >
        <TaskForm
          initialData={editingTask}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
          projects={projects}
        />
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmText="Delete Task"
        loading={deleteLoading}
      />

      <style>{`
        @keyframes task-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes cell-drop-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
