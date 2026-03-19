import { useState } from 'react'

const STATUS_OPTIONS = [
  { value: 'todo',        label: 'Not started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' }
]

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' }
]

const ASSIGNEE_OPTIONS = ['Merrick Slade', 'Sam Blakesley']

// ── Single-select assignee toggle ────────────────────────────────
function AssigneeToggle({ assignee, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {ASSIGNEE_OPTIONS.map(name => {
        const active = assignee === name
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(active ? '' : name)}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '6px 12px', borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: active ? 'var(--accent-primary-muted)' : 'var(--bg-primary)',
              color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: active ? 600 : 400,
              transition: 'all 0.15s ease', flex: 1, justifyContent: 'center'
            }}
          >
            {active && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1.5 5.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {name.split(' ')[0]}
          </button>
        )
      })}
    </div>
  )
}

// ── Tag input ────────────────────────────────────────────────────
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

function TagInput({ tags, onChange, disabled }) {
  const [inputVal, setInputVal] = useState('')

  function addTag(raw) {
    const tag = raw.trim().replace(/,/g, '')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInputVal('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inputVal) }
    else if (e.key === 'Backspace' && !inputVal && tags.length > 0) onChange(tags.slice(0, -1))
  }

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px',
        padding: '6px 10px',
        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
        background: 'var(--bg-primary)', minHeight: '40px',
        alignItems: 'center', cursor: 'text'
      }}
      onClick={() => document.getElementById('task-tag-input')?.focus()}
    >
      {tags.map(tag => {
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
              onClick={() => onChange(tags.filter(t => t !== tag))}
              disabled={disabled}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </span>
        )
      })}
      <input
        id="task-tag-input"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) addTag(inputVal) }}
        placeholder={tags.length === 0 ? 'Add tags — press Enter or comma...' : ''}
        disabled={disabled}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: '13px', color: 'var(--text-primary)',
          flex: 1, minWidth: '100px', padding: '2px 0'
        }}
      />
    </div>
  )
}

// ── Form ─────────────────────────────────────────────────────────
/**
 * @param {object}   props.initialData  — task being edited, or null for new
 * @param {function} props.onSave       — called with form data on submit
 * @param {function} props.onCancel
 * @param {boolean}  props.saving
 * @param {Array}    props.projects     — [{id, name, clientName}] for the linked-project dropdown
 */
export default function TaskForm({ initialData, onSave, onCancel, saving, projects = [] }) {
  const [form, setForm] = useState({
    title:       initialData?.title       || '',
    description: initialData?.description || '',
    status:      initialData?.status      || 'todo',
    priority:    initialData?.priority    || 'medium',
    assignee:    initialData?.assignee    || '',
    dueDate:     initialData?.dueDate     || '',
    projectId:   initialData?.projectId   || '',
    tags:        Array.isArray(initialData?.tags) ? initialData.tags : []
  })
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.title.trim()) errs.title = 'Task title is required.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({
      title:       form.title.trim(),
      description: form.description.trim(),
      status:      form.status,
      priority:    form.priority,
      assignee:    form.assignee || null,
      dueDate:     form.dueDate || null,
      projectId:   form.projectId || null,
      tags:        form.tags
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Task Title <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="e.g. Design landing page mockup"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.title && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.title}</div>}
      </div>

      {/* Status + Priority */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Status</label>
          <select className="input select" value={form.status} onChange={e => set('status', e.target.value)} disabled={saving}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input select" value={form.priority} onChange={e => set('priority', e.target.value)} disabled={saving}>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Assignee + Due Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Assigned To</label>
          <AssigneeToggle assignee={form.assignee} onChange={v => set('assignee', v)} disabled={saving} />
        </div>
        <div>
          <label className="label">Due Date</label>
          <input type="date" className="input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} disabled={saving} />
        </div>
      </div>

      {/* Linked Project */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Linked Project <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
        <select className="input select" value={form.projectId} onChange={e => set('projectId', e.target.value)} disabled={saving}>
          <option value="">— Not linked to a project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.clientName ? ` — ${p.clientName}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <textarea
          className="input textarea"
          placeholder="Add details about this task…"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          disabled={saving}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      </div>

      {/* Tags */}
      <div style={{ marginBottom: '24px' }}>
        <label className="label">Tags</label>
        <TagInput tags={form.tags} onChange={t => set('tags', t)} disabled={saving} />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
          Press{' '}
          <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>Enter</kbd>
          {' '}or{' '}
          <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>,</kbd>
          {' '}to add · <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>⌫</kbd> to remove last
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initialData ? 'Save Changes' : 'Add Task'}
        </button>
      </div>
    </form>
  )
}
