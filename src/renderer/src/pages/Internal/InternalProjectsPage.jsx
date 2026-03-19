import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { subscribeToTable, addRecord, updateRecord, deleteRecord, TABLES } from '../../supabase/database'
import { supabase } from '../../supabase/client'

const STORAGE_BUCKET = 'project-resources'

const WORKFLOW_STAGES = [
  { id: 'discovery',      label: 'Discovery' },
  { id: 'design',         label: 'Design' },
  { id: 'production',     label: 'Production' },
  { id: 'quality_control',label: 'Quality Control' },
  { id: 'packaged',       label: 'Packaged' }
]

const CATEGORIES = [
  { id: 'tooling',    label: 'Tooling',    color: 'var(--accent-primary)',       bg: 'var(--accent-primary-muted)' },
  { id: 'marketing',  label: 'Marketing',  color: 'var(--info)',                 bg: 'var(--info-muted)' },
  { id: 'portfolio',  label: 'Portfolio',  color: 'var(--success)',              bg: 'var(--success-muted)' },
  { id: 'r_and_d',    label: 'R&D',        color: 'var(--warning)',              bg: 'var(--warning-muted)' },
  { id: 'learning',   label: 'Learning',   color: '#14b8a6',                     bg: 'rgba(20,184,166,0.12)' },
  { id: 'admin',      label: 'Admin',      color: 'var(--text-muted)',           bg: 'var(--bg-tertiary)' }
]

const PRIORITIES = [
  { id: 'low',    label: 'Low',    color: 'var(--text-muted)' },
  { id: 'medium', label: 'Medium', color: 'var(--warning)' },
  { id: 'high',   label: 'High',   color: 'var(--danger)' }
]

const STATUSES = ['in progress', 'review', 'completed']

const STATUS_STYLES = {
  'in progress': { bg: 'var(--info-muted)',    color: 'var(--info)' },
  'review':      { bg: 'var(--warning-muted)', color: 'var(--warning)' },
  'completed':   { bg: 'var(--success-muted)', color: 'var(--success)' }
}

function parseResources(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function parseSubProjects(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

const SUB_STATUS_CYCLE = { 'in progress': 'review', 'review': 'completed', 'completed': 'in progress' }
const SUB_STATUS_STYLE = {
  'in progress': { bg: 'var(--info-muted)',    color: 'var(--info)',    label: 'In Progress' },
  'review':      { bg: 'var(--warning-muted)', color: 'var(--warning)', label: 'Review' },
  'completed':   { bg: 'var(--success-muted)', color: 'var(--success)', label: 'Done' }
}

function getCategoryStyle(id) {
  return CATEGORIES.find(c => c.id === id) || { label: id || 'General', color: 'var(--text-muted)', bg: 'var(--bg-tertiary)' }
}

function getPriorityColor(id) {
  return PRIORITIES.find(p => p.id === id)?.color || 'var(--text-muted)'
}

// ── Form ────────────────────────────────────────────────────────────
function InternalProjectForm({ initialData, onSave, onCancel, onDelete, saving }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name:          initialData?.name          || '',
    description:   initialData?.description   || '',
    category:      initialData?.category      || 'tooling',
    priority:      initialData?.priority      || 'medium',
    status:        initialData?.status        || 'in progress',
    deadline:      initialData?.deadline      || '',
    notes:         initialData?.notes         || '',
    workflowStage: initialData?.workflowStage || 'discovery'
  })
  const [resources, setResources]     = useState(() => parseResources(initialData?.resources))
  const [subProjects, setSubProjects] = useState(() => parseSubProjects(initialData?.subProjects))
  const [errors, setErrors]           = useState({})
  const [uploadingIdx, setUploadingIdx] = useState(null)
  const fileInputRef    = useRef(null)
  const currentUploadIdx = useRef(null)

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const i = currentUploadIdx.current
    e.target.value = ''
    setUploadingIdx(i)
    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file)
    if (uploadError) {
      toast('Upload failed: ' + uploadError.message, 'error')
      setUploadingIdx(null)
      return
    }
    const autoTitle = file.name.replace(/\.[^.]+$/, '')
    setResources(res => res.map((item, idx) =>
      idx === i ? { ...item, url: '', storagePath, fileName: file.name, title: item.title || autoTitle } : item
    ))
    setUploadingIdx(null)
  }

  async function openStorageFile(storagePath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 3600)
    if (error) { toast('Could not open file.', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  function handleChange(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Project name is required.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({
      name: form.name.trim(), description: form.description.trim(),
      category: form.category, priority: form.priority, status: form.status,
      deadline: form.deadline, notes: form.notes.trim(),
      workflowStage: form.workflowStage, resources, subProjects
    })
  }

  const currentStageIdx = WORKFLOW_STAGES.findIndex(s => s.id === form.workflowStage)

  return (
    <form onSubmit={handleSubmit} noValidate>

      {/* Workflow stepper */}
      <div style={{ marginBottom: 18 }}>
        <label className="label">Stage of Workflow</label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {WORKFLOW_STAGES.map((stage, idx) => {
            const isPast    = idx < currentStageIdx
            const isCurrent = idx === currentStageIdx
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', flex: idx < WORKFLOW_STAGES.length - 1 ? 1 : 'none', minWidth: 0 }}>
                <button type="button" disabled={saving} onClick={() => handleChange('workflowStage', stage.id)}
                  style={{
                    flexShrink: 0, padding: '4px 9px', borderRadius: 20, fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 500, border: 'none', cursor: saving ? 'default' : 'pointer',
                    whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                    background: isCurrent ? 'var(--accent-primary)' : isPast ? 'var(--accent-primary-muted)' : 'var(--bg-tertiary)',
                    color: isCurrent ? '#fff' : isPast ? 'var(--accent-primary)' : 'var(--text-muted)',
                    boxShadow: isCurrent ? '0 0 0 2px var(--accent-primary)' : 'none'
                  }}>
                  {isPast && (
                    <svg width="8" height="8" viewBox="0 0 9 9" fill="none" style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }}>
                      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {stage.label}
                </button>
                {idx < WORKFLOW_STAGES.length - 1 && (
                  <div style={{ flex: 1, height: 2, minWidth: 6, transition: 'background 0.15s ease', background: idx < currentStageIdx ? 'var(--accent-primary)' : 'var(--border-color)' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Name */}
      <div style={{ marginBottom: 14 }}>
        <label className="label">Project Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="input" placeholder="e.g. Portfolio Website Redesign" value={form.name}
          onChange={e => handleChange('name', e.target.value)} autoFocus disabled={saving} />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: 4 }}>{errors.name}</div>}
      </div>

      {/* Category + Priority */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => handleChange('category', e.target.value)} disabled={saving}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={form.priority} onChange={e => handleChange('priority', e.target.value)} disabled={saving}>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Status + Deadline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => handleChange('status', e.target.value)} disabled={saving}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Deadline</label>
          <input type="date" className="input" value={form.deadline} onChange={e => handleChange('deadline', e.target.value)} disabled={saving} />
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 14 }}>
        <label className="label">Description</label>
        <textarea className="input textarea" placeholder="What is this project about?" value={form.description}
          onChange={e => handleChange('description', e.target.value)} rows={2} disabled={saving} />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label className="label">Notes</label>
        <textarea className="input textarea" placeholder="Additional notes..." value={form.notes}
          onChange={e => handleChange('notes', e.target.value)} rows={2} disabled={saving} />
      </div>

      {/* Sub-Projects */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label className="label" style={{ marginBottom: 0 }}>
            Sub-Projects
            {subProjects.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                {subProjects.filter(s => s.status === 'completed').length}/{subProjects.length} done
              </span>
            )}
          </label>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setSubProjects(s => [...s, { id: `${Date.now()}`, name: '', status: 'in progress', workflowStage: 'discovery' }])}
            disabled={saving} style={{ fontSize: '11px', padding: '3px 8px', height: 'auto' }}>
            + Add
          </button>
        </div>
        {subProjects.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No sub-projects yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {subProjects.map((sp, i) => {
              const spStyle = SUB_STATUS_STYLE[sp.status] || SUB_STATUS_STYLE['in progress']
              return (
                <div key={sp.id || i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Completion tick */}
                  <button type="button"
                    onClick={() => setSubProjects(s => s.map((x, idx) => idx === i ? { ...x, status: sp.status === 'completed' ? 'in progress' : 'completed' } : x))}
                    title={sp.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                    style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${sp.status === 'completed' ? 'var(--success)' : 'var(--border-color)'}`, background: sp.status === 'completed' ? 'var(--success-muted)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    {sp.status === 'completed' && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  {/* Name */}
                  <input className="input" placeholder="Sub-project name" value={sp.name}
                    onChange={e => setSubProjects(s => s.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    disabled={saving}
                    style={{ flex: 1, fontSize: '12px', padding: '5px 8px', height: 'auto', textDecoration: sp.status === 'completed' ? 'line-through' : 'none', color: sp.status === 'completed' ? 'var(--text-muted)' : undefined }} />
                  {/* Status cycle badge */}
                  <button type="button"
                    onClick={() => setSubProjects(s => s.map((x, idx) => idx === i ? { ...x, status: SUB_STATUS_CYCLE[x.status] || 'in progress' } : x))}
                    title="Click to change status"
                    style={{ flexShrink: 0, padding: '3px 7px', borderRadius: 10, fontSize: '10px', fontWeight: 600, border: 'none', cursor: 'pointer', background: spStyle.bg, color: spStyle.color, whiteSpace: 'nowrap' }}>
                    {spStyle.label}
                  </button>
                  {/* Remove */}
                  <button type="button" className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setSubProjects(s => s.filter((_, idx) => idx !== i))}
                    disabled={saving} style={{ color: 'var(--danger)', flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Resources */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label className="label" style={{ marginBottom: 0 }}>Resources</label>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setResources(r => [...r, { title: '', url: '' }])}
            disabled={saving} style={{ fontSize: '11px', padding: '3px 8px', height: 'auto' }}>
            + Add
          </button>
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
        {resources.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No resources yet — add a link or upload a file.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resources.map((r, i) => {
              const isStorageFile = !!r.storagePath
              const isUploading   = uploadingIdx === i
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" placeholder="Title" value={r.title}
                    onChange={e => setResources(res => res.map((item, idx) => idx === i ? { ...item, title: e.target.value } : item))}
                    disabled={saving || isUploading} style={{ flex: '0 0 120px', fontSize: '12px', padding: '5px 8px', height: 'auto' }} />
                  {isStorageFile ? (
                    <div style={{ flex: 1, fontSize: '12px', padding: '5px 8px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.fileName || r.storagePath}
                    </div>
                  ) : (
                    <input className="input" placeholder="Paste URL or upload file →" value={r.url}
                      onChange={e => setResources(res => res.map((item, idx) => idx === i ? { ...item, url: e.target.value } : item))}
                      disabled={saving || isUploading} style={{ flex: 1, fontSize: '12px', padding: '5px 8px', height: 'auto' }} />
                  )}
                  {/* Upload button */}
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Upload file"
                    disabled={saving || uploadingIdx !== null}
                    onClick={() => { currentUploadIdx.current = i; fileInputRef.current?.click() }}
                    style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                    {isUploading ? (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ animation: 'resSpin 0.7s linear infinite', color: 'var(--accent-primary)' }}>
                        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="16 6" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 9v2h9V9M6.5 1v7M4 3.5L6.5 1 9 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  {/* Open */}
                  {(r.url || isStorageFile) && (
                    isStorageFile ? (
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Open file"
                        onClick={() => openStorageFile(r.storagePath)} style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M3 1h5l3 3v8H3V1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                          <path d="M7 1v3h3M5 7h3M5 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    ) : (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open link"
                        style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4v4M12 1L6 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    )
                  )}
                  {/* Remove */}
                  <button type="button" className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setResources(res => res.filter((_, idx) => idx !== i))}
                    disabled={saving || isUploading} style={{ color: 'var(--danger)', flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes resSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {initialData && onDelete && (
            <button type="button" className="btn btn-sm" onClick={onDelete} disabled={saving}
              style={{ color: 'var(--danger)', border: '1px solid var(--danger-muted)', background: 'var(--danger-muted)' }}>
              Delete
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Page ─────────────────────────────────────────────────────────────
export default function InternalProjectsPage() {
  const toast = useToast()
  const [projects, setProjects]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCat, setFilterCat]       = useState('all')
  const [search, setSearch]             = useState('')
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToTable(TABLES.INTERNAL_PROJECTS, (docs, err) => {
      if (err) console.error('Internal projects error:', err)
      else setProjects(docs)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  async function handleSave(formData) {
    setSaving(true)
    if (editing) {
      const { error } = await updateRecord(TABLES.INTERNAL_PROJECTS, editing.id, formData)
      if (error) toast('Failed to update.', 'error')
      else { toast('Project updated.', 'success'); setModalOpen(false); setEditing(null) }
    } else {
      const { error } = await addRecord(TABLES.INTERNAL_PROJECTS, formData)
      if (error) toast('Failed to add project.', 'error')
      else { toast('Project added.', 'success'); setModalOpen(false) }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error } = await deleteRecord(TABLES.INTERNAL_PROJECTS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (error) toast('Failed to delete.', 'error')
    else toast('Project deleted.', 'info')
  }

  const filtered = projects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (filterCat    !== 'all' && p.category !== filterCat)  return false
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total:      projects.length,
    inProgress: projects.filter(p => p.status === 'in progress').length,
    review:     projects.filter(p => p.status === 'review').length,
    completed:  projects.filter(p => p.status === 'completed').length
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 24px 0', flexShrink: 0 }}>
        {[
          { label: 'Total',       value: stats.total,      color: 'var(--accent-primary)' },
          { label: 'In Progress', value: stats.inProgress, color: 'var(--info)' },
          { label: 'Review',      value: stats.review,     color: 'var(--warning)' },
          { label: 'Completed',   value: stats.completed,  color: 'var(--success)' }
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '10px 16px', flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ padding: '12px 24px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input className="input" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 30, fontSize: '13px' }} />
        </div>
        {/* Status filters */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all',         label: 'All' },
            { key: 'in progress', label: 'In Progress' },
            { key: 'review',      label: 'Review' },
            { key: 'completed',   label: 'Completed' }
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`btn btn-sm ${filterStatus === f.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '5px 10px' }}>
              {f.label}
            </button>
          ))}
        </div>
        {/* Category filter */}
        <select className="input" value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ fontSize: '12px', padding: '6px 10px', width: 'auto', flex: '0 0 auto' }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModalOpen(true) }}
          style={{ flexShrink: 0, marginLeft: 'auto' }}>
          + Add Project
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: '13px' }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--text-muted)', gap: 10 }}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" opacity="0.35">
              <rect x="6" y="4" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M14 14h16M14 21h16M14 28h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: '13px' }}>
              {projects.length === 0 ? 'No internal projects yet — add your first one!' : 'No projects match your filters.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            <AnimatePresence>
              {filtered.map(p => {
                const catStyle     = getCategoryStyle(p.category)
                const priorityColor = getPriorityColor(p.priority)
                const statusStyle  = STATUS_STYLES[p.status] || STATUS_STYLES['in progress']
                const stageIdx     = WORKFLOW_STAGES.findIndex(s => s.id === p.workflowStage)
                const stage        = WORKFLOW_STAGES[Math.max(0, stageIdx)]
                return (
                  <motion.div key={p.id} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="card"
                    onClick={() => { setEditing(p); setModalOpen(true) }}
                    style={{ cursor: 'pointer', padding: '14px 16px', transition: 'border-color 0.15s ease' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary-muted)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = ''}>

                    {/* Top row: name + priority dot + category */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                        <div title={`${p.priority || 'medium'} priority`}
                          style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor, flexShrink: 0 }} />
                        <span className="badge" style={{ background: catStyle.bg, color: catStyle.color, fontSize: '10px' }}>
                          {catStyle.label}
                        </span>
                      </div>
                    </div>

                    {/* Description snippet */}
                    {p.description && (
                      <div style={{
                        fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {p.description}
                      </div>
                    )}

                    {/* Sub-project progress */}
                    {(() => {
                      const subs = parseSubProjects(p.subProjects)
                      if (subs.length === 0) return null
                      const done = subs.filter(s => s.status === 'completed').length
                      const pct  = Math.round((done / subs.length) * 100)
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {done}/{subs.length} sub-projects done
                            </span>
                            <span style={{ fontSize: '10px', color: done === subs.length ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                              {pct}%
                            </span>
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: done === subs.length ? 'var(--success)' : 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )
                    })()}

                    {/* Workflow mini-bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8 }}>
                      {WORKFLOW_STAGES.map((s, i) => (
                        <div key={s.id} style={{
                          width: i === stageIdx ? 14 : 6, height: 4, borderRadius: 2,
                          background: i <= stageIdx ? 'var(--accent-primary)' : 'var(--border-color)',
                          opacity: i <= stageIdx ? 1 : 0.4, transition: 'all 0.15s ease'
                        }} />
                      ))}
                      <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600, marginLeft: 4 }}>
                        {stage.label}
                      </span>
                    </div>

                    {/* Footer: status + deadline */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: '10px' }}>
                        {p.status?.charAt(0).toUpperCase() + p.status?.slice(1)}
                      </span>
                      {p.deadline && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(p.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditing(null) }}
        title={editing ? 'Edit Internal Project' : 'New Internal Project'} size="md">
        <InternalProjectForm
          initialData={editing}
          onSave={handleSave}
          onCancel={() => { setModalOpen(false); setEditing(null) }}
          onDelete={editing ? () => { setDeleteTarget(editing); setModalOpen(false) } : null}
          saving={saving}
        />
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Project" message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete Project" loading={deleteLoading} />
    </div>
  )
}
