import { useState, useEffect, useMemo } from 'react'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import {
  subscribeToTable,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'
import TaskForm from './TaskForm'

// ── Status config ────────────────────────────────────────────────
const STATUS_MAP = {
  todo:       { label: 'Not started', bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  inprogress: { label: 'In Progress', bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  done:       { label: 'Done',        bg: 'rgba(16,185,129,0.15)',  color: '#10b981' }
}

// ── Priority config ──────────────────────────────────────────────
const PRIORITY_MAP = {
  high:   { label: 'High',   bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
  medium: { label: 'Medium', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  low:    { label: 'Low',    bg: 'rgba(16,185,129,0.12)', color: '#10b981' }
}

// ── Effort config ────────────────────────────────────────────────
const EFFORT_MAP = {
  small:  { label: 'Small',  bg: 'rgba(20,184,166,0.12)',  color: '#14b8a6' },
  medium: { label: 'Medium', bg: 'rgba(99,102,241,0.12)',  color: '#6366f1' },
  large:  { label: 'Large',  bg: 'rgba(168,85,247,0.12)',  color: '#a855f7' }
}

// ── Task type colours ────────────────────────────────────────────
const TYPE_COLORS = {
  legal:       { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  development: { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  social:      { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7' },
  polish:      { bg: 'rgba(236,72,153,0.1)',  color: '#ec4899' },
  design:      { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  research:    { bg: 'rgba(20,184,166,0.1)',  color: '#14b8a6' },
  general:     { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8' }
}

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

// ── Main page ────────────────────────────────────────────────────
export default function TasksPage() {
  const toast = useToast()
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)

  // Filters & sort
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy]             = useState('createdAt')
  const [sortDir, setSortDir]           = useState('desc')

  useEffect(() => {
    const unsub = subscribeToTable(TABLES.TASKS, (docs, err) => {
      if (err) setError('Failed to load tasks.')
      else { setTasks(docs); setError(null) }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  function handleSort(key) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const assignees = useMemo(() => {
    return [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))].sort()
  }, [tasks])

  const visibleTasks = useMemo(() => {
    let list = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.assignedTo?.toLowerCase().includes(q) ||
        t.taskType?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all')   list = list.filter(t => t.column === filterStatus)
    if (filterAssignee !== 'all') list = list.filter(t => t.assignedTo === filterAssignee)
    if (filterPriority !== 'all') list = list.filter(t => t.priority === filterPriority)

    return [...list].sort((a, b) => {
      let va = a[sortBy] ?? ''
      let vb = b[sortBy] ?? ''
      if (sortBy === 'dueDate') { va = va || '9999-99-99'; vb = vb || '9999-99-99' }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tasks, search, filterStatus, filterAssignee, filterPriority, sortBy, sortDir])

  function openAdd()          { setEditingTask(null); setModalOpen(true) }
  function openEdit(task)     { setEditingTask(task); setModalOpen(true) }
  function closeModal()       { setModalOpen(false); setEditingTask(null) }

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

  const hasFilters = search || filterStatus !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all'
  function clearFilters() { setSearch(''); setFilterStatus('all'); setFilterAssignee('all'); setFilterPriority('all') }

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
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '240px' }}>
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
            <option value="inprogress">In Progress</option>
            <option value="done">Done</option>
          </select>

          <select className="input select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '130px', width: 'auto' }}>
            <option value="all">All assignees</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select className="input select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ height: '32px', fontSize: '12.5px', minWidth: '120px', width: 'auto' }}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
          )}
        </div>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
            <thead>
              <tr>
                <ColHeader label="Task name"   sortKey="title"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 230, paddingLeft: 24 }} />
                <ColHeader label="Status"      sortKey="column"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 120 }} />
                <ColHeader label="Assignee"    sortKey="assignedTo"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 150 }} />
                <ColHeader label="Due date"    sortKey="dueDate"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 105 }} />
                <ColHeader label="Priority"    sortKey="priority"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 90 }} />
                <ColHeader label="Type"        sortKey="taskType"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 115 }} />
                <ColHeader label="Description" sortKey="description" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 190 }} />
                <ColHeader label="Effort"      sortKey="effortLevel" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 80 }} />
                <ColHeader label="Tags"        sortKey="tags"        sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ minWidth: 160 }} />
                <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1, minWidth: 64 }} />
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map(task => {
                const status   = STATUS_MAP[task.column] || STATUS_MAP.todo
                const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium
                const effort   = task.effortLevel ? EFFORT_MAP[task.effortLevel.toLowerCase()] : null
                const typeKey  = (task.taskType || '').toLowerCase()
                const typeStyle = TYPE_COLORS[typeKey] || TYPE_COLORS.general
                const isHovered = hoveredRow === task.id

                const dueStr = task.dueDate
                  ? new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
                const isOverdue = task.dueDate && task.column !== 'done'
                  && new Date(task.dueDate + 'T23:59:59') < new Date()

                return (
                  <tr
                    key={task.id}
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => openEdit(task)}
                    style={{
                      background: isHovered ? 'var(--bg-tertiary)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                  >
                    {/* Task name */}
                    <td style={{ padding: '11px 12px 11px 24px' }}>
                      <span style={{
                        fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: 230
                      }}>
                        {task.title}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '11px 12px' }}>
                      <Chip label={status.label} bg={status.bg} color={status.color} />
                    </td>

                    {/* Assignee */}
                    <td style={{ padding: '11px 12px' }}>
                      {task.assignedTo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <Avatar name={task.assignedTo} size={22} />
                          <span style={{
                            fontSize: '12.5px', color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110
                          }}>
                            {task.assignedTo}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Due date */}
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{
                        fontSize: '12.5px',
                        color: isOverdue ? 'var(--danger)' : 'var(--text-secondary)',
                        fontWeight: isOverdue ? 600 : 400,
                        whiteSpace: 'nowrap'
                      }}>
                        {dueStr}
                      </span>
                    </td>

                    {/* Priority */}
                    <td style={{ padding: '11px 12px' }}>
                      <Chip label={priority.label} bg={priority.bg} color={priority.color} />
                    </td>

                    {/* Task type */}
                    <td style={{ padding: '11px 12px' }}>
                      {task.taskType ? (
                        <Chip
                          label={task.taskType.charAt(0).toUpperCase() + task.taskType.slice(1)}
                          bg={typeStyle.bg}
                          color={typeStyle.color}
                        />
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Description */}
                    <td style={{ padding: '11px 12px', maxWidth: 190 }}>
                      <span style={{
                        fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {task.description || '—'}
                      </span>
                    </td>

                    {/* Effort */}
                    <td style={{ padding: '11px 12px' }}>
                      {effort
                        ? <Chip label={effort.label} bg={effort.bg} color={effort.color} />
                        : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>

                    {/* Tags */}
                    <td style={{ padding: '11px 12px' }}>
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
                      </div>
                    </td>

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
      `}</style>
    </div>
  )
}
