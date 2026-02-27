import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import {
  subscribeToProjectsByClient,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'

const WORKFLOW_STAGES = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'design', label: 'Design' },
  { id: 'production', label: 'Production' },
  { id: 'quality_control', label: 'Quality Control' },
  { id: 'packaged', label: 'Packaged' }
]

const PROJECT_STATUSES = ['in progress', 'review', 'completed']

const PROJ_STATUS_STYLES = {
  'in progress': { bg: 'var(--info-muted)', color: 'var(--info)' },
  'review': { bg: 'var(--warning-muted)', color: 'var(--warning)' },
  'completed': { bg: 'var(--success-muted)', color: 'var(--success)' }
}

const CLIENT_STATUS_STYLES = {
  lead: { bg: 'var(--info-muted)', color: 'var(--info)' },
  active: { bg: 'var(--success-muted)', color: 'var(--success)' },
  completed: { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' }
}

function parseResources(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

const SECTION_LABEL = {
  fontSize: '10.5px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 8,
  flexShrink: 0
}

// ── Inline project form ──────────────────────────────────────────
function ProjectForm({ clientId, clientName, initialData, onSave, onCancel, onDelete, saving }) {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    status: initialData?.status || 'in progress',
    deadline: initialData?.deadline || '',
    notes: initialData?.notes || '',
    workflowStage: initialData?.workflowStage || 'discovery'
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Project name is required.'
    return e
  }

  function handleChange(field, value) {
    setForm((p) => ({ ...p, [field]: value }))
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({
      clientId,
      clientName,
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      deadline: form.deadline,
      notes: form.notes.trim(),
      workflowStage: form.workflowStage
    })
  }

  const currentStageIdx = WORKFLOW_STAGES.findIndex(s => s.id === form.workflowStage)

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Pipeline stepper */}
      <div style={{ marginBottom: '18px' }}>
        <label className="label">Stage of Workflow</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {WORKFLOW_STAGES.map((stage, idx) => {
            const isPast = idx < currentStageIdx
            const isCurrent = idx === currentStageIdx
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', flex: idx < WORKFLOW_STAGES.length - 1 ? 1 : 'none', minWidth: 0 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleChange('workflowStage', stage.id)}
                  style={{
                    flexShrink: 0,
                    padding: '4px 9px',
                    borderRadius: 20,
                    fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 500,
                    border: 'none',
                    cursor: saving ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    background: isCurrent
                      ? 'var(--accent-primary)'
                      : isPast
                      ? 'var(--accent-primary-muted, rgba(99,102,241,0.15))'
                      : 'var(--bg-tertiary)',
                    color: isCurrent ? '#fff' : isPast ? 'var(--accent-primary)' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                    boxShadow: isCurrent ? '0 0 0 2px var(--accent-primary)' : 'none'
                  }}
                >
                  {isPast && (
                    <svg width="8" height="8" viewBox="0 0 9 9" fill="none" style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }}>
                      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {stage.label}
                </button>
                {idx < WORKFLOW_STAGES.length - 1 && (
                  <div style={{ flex: 1, height: 2, minWidth: 6, background: idx < currentStageIdx ? 'var(--accent-primary)' : 'var(--border-color)', transition: 'background 0.15s ease' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label className="label">Project Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="input" placeholder="e.g. Website Redesign" value={form.name} onChange={(e) => handleChange('name', e.target.value)} autoFocus disabled={saving} />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <textarea className="input textarea" placeholder="Brief project description..." value={form.description} onChange={(e) => handleChange('description', e.target.value)} rows={2} disabled={saving} />
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Deadline</label>
        <input type="date" className="input" value={form.deadline} onChange={(e) => handleChange('deadline', e.target.value)} disabled={saving} />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label className="label">Notes</label>
        <textarea className="input textarea" placeholder="Project notes..." value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} rows={2} disabled={saving} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {initialData && onDelete && (
            <button type="button" className="btn btn-sm" onClick={onDelete} disabled={saving}
              style={{ color: 'var(--danger)', border: '1px solid var(--danger-muted)', background: 'var(--danger-muted)' }}>
              Delete
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Main panel ───────────────────────────────────────────────────
export default function ProjectsPanel({ client, onClose, onEditClient }) {
  const toast = useToast()
  const refetchProjects = useRef(null)

  // Projects
  const [projects, setProjects] = useState([])
  const [projLoading, setProjLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Inline editable client fields
  const [localNotes, setLocalNotes] = useState(client.notes || '')
  const [localBrief, setLocalBrief] = useState(client.brief || '')
  const [localAssignedTo, setLocalAssignedTo] = useState(client.assignedTo || '')
  const [resources, setResources] = useState(() => parseResources(client.resources))
  const [resourcesDirty, setResourcesDirty] = useState(false)

  // Reset inline state when switching to a different client
  useEffect(() => {
    setLocalNotes(client.notes || '')
    setLocalBrief(client.brief || '')
    setLocalAssignedTo(client.assignedTo || '')
    setResources(parseResources(client.resources))
    setResourcesDirty(false)
    setProjLoading(true)
  }, [client.id])

  // Subscribe to this client's projects
  useEffect(() => {
    if (!client?.id) return
    const { unsubscribe, refetch } = subscribeToProjectsByClient(client.id, (docs, err) => {
      if (err) console.error('Projects subscription error:', err)
      else setProjects(docs)
      setProjLoading(false)
    })
    refetchProjects.current = refetch
    return () => {
      unsubscribe()
      refetchProjects.current = null
    }
  }, [client.id])

  async function saveClientField(field, value) {
    const { error } = await updateRecord(TABLES.CLIENTS, client.id, { [field]: value })
    if (error) toast('Failed to save. Please try again.', 'error')
  }

  async function saveResources() {
    const { error } = await updateRecord(TABLES.CLIENTS, client.id, { resources })
    if (error) toast('Failed to save resources.', 'error')
    else setResourcesDirty(false)
  }

  async function handleSaveProject(formData) {
    setSaving(true)
    if (editingProject) {
      const { error } = await updateRecord(TABLES.PROJECTS, editingProject.id, formData)
      if (error) { toast('Failed to update project.', 'error') }
      else {
        toast('Project updated.', 'success')
        setModalOpen(false)
        setEditingProject(null)
        refetchProjects.current?.()
      }
    } else {
      const { error } = await addRecord(TABLES.PROJECTS, formData)
      if (error) { toast('Failed to add project.', 'error') }
      else {
        toast('Project added.', 'success')
        setModalOpen(false)
        refetchProjects.current?.()
      }
    }
    setSaving(false)
  }

  async function handleDeleteProject() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error } = await deleteRecord(TABLES.PROJECTS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (error) { toast('Failed to delete project.', 'error') }
    else {
      toast('Project deleted.', 'info')
      refetchProjects.current?.()
    }
  }

  const clientStatus = CLIENT_STATUS_STYLES[client.status] || CLIENT_STATUS_STYLES.lead
  const initials = client.name?.split(' ').map((n) => n[0]?.toUpperCase()).join('').slice(0, 2) || '?'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Logo or initials */}
            {client.logoUrl ? (
              <img src={client.logoUrl} alt={client.name}
                style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: 10, background: 'var(--accent-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '-0.5px'
              }}>
                {initials}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {client.name}
              </div>
              <span className="badge" style={{ background: clientStatus.bg, color: clientStatus.color, marginTop: 3 }}>
                {client.status?.charAt(0).toUpperCase() + client.status?.slice(1) || 'Lead'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={onEditClient}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              Edit Client
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close panel">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Projects strip ── */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: projects.length > 0 ? 8 : 0 }}>
          <div style={SECTION_LABEL}>Projects</div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setEditingProject(null); setModalOpen(true) }}
            style={{ fontSize: '11px', padding: '3px 9px', height: 'auto' }}
          >
            + Add Project
          </button>
        </div>
        {!projLoading && projects.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {projects.map((p) => {
              const stage = WORKFLOW_STAGES.find(s => s.id === p.workflowStage) || WORKFLOW_STAGES[0]
              const stageIdx = WORKFLOW_STAGES.indexOf(stage)
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="card"
                  onClick={() => { setEditingProject(p); setModalOpen(true) }}
                  style={{ padding: '8px 11px', flexShrink: 0, cursor: 'pointer', minWidth: 120, maxWidth: 190 }}
                >
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  {/* Mini pipeline dots */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 5 }}>
                    {WORKFLOW_STAGES.map((s, i) => (
                      <div key={s.id} style={{
                        width: i === stageIdx ? 14 : 6,
                        height: 4,
                        borderRadius: 2,
                        background: i < stageIdx
                          ? 'var(--accent-primary)'
                          : i === stageIdx
                          ? 'var(--accent-primary)'
                          : 'var(--border-color)',
                        transition: 'all 0.15s ease',
                        opacity: i <= stageIdx ? 1 : 0.4
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                    {stage.label}
                  </div>
                  {p.deadline && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(p.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Main body: notes + contact / brief ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Client Notes */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px', borderRight: '1px solid var(--border-color)', minWidth: 0 }}>
          <div style={SECTION_LABEL}>Client Notes</div>
          <textarea
            className="input textarea"
            placeholder="Notes about this client..."
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={(e) => saveClientField('notes', e.target.value)}
            style={{ flex: 1, resize: 'none', lineHeight: 1.65, minHeight: 0, fontSize: '13px' }}
          />
        </div>

        {/* Right column */}
        <div style={{ width: 265, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Contact info */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            <div style={SECTION_LABEL}>Contact Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: '12.5px', color: client.email ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client.email || 'No email'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <path d="M3 2h2.5l1 3-1.5 1a8 8 0 004 4l1-1.5 3 1V12c0 .6-.5 1-1 1C5 13 1 9 1 3.5 1 2.7 1.9 2 3 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: '12.5px', color: client.phone ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {client.phone || 'No phone'}
                </span>
              </div>
            </div>
          </div>

          {/* What they want (brief) */}
          <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={SECTION_LABEL}>What They Want</div>
            <textarea
              className="input textarea"
              placeholder="Client goals, brief, requirements..."
              value={localBrief}
              onChange={(e) => setLocalBrief(e.target.value)}
              onBlur={(e) => saveClientField('brief', e.target.value)}
              style={{ flex: 1, resize: 'none', lineHeight: 1.65, minHeight: 0, fontSize: '12.5px' }}
            />
          </div>

        </div>
      </div>

      {/* ── Resources ── */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>Resources</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {resourcesDirty && (
              <button className="btn btn-primary btn-sm" onClick={saveResources}
                style={{ fontSize: '11px', padding: '3px 10px', height: 'auto' }}>
                Save
              </button>
            )}
            <button className="btn btn-ghost btn-sm"
              onClick={() => { setResources((r) => [...r, { title: '', url: '' }]); setResourcesDirty(true) }}
              style={{ fontSize: '11px', padding: '3px 8px', height: 'auto' }}>
              + Add
            </button>
          </div>
        </div>
        {resources.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No resources added yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 130, overflowY: 'auto' }}>
            {resources.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="Title"
                  value={r.title}
                  onChange={(e) => {
                    setResources((res) => res.map((item, idx) => idx === i ? { ...item, title: e.target.value } : item))
                    setResourcesDirty(true)
                  }}
                  style={{ flex: '0 0 120px', fontSize: '12px', padding: '5px 8px', height: 'auto' }}
                />
                <input
                  className="input"
                  placeholder="URL or note"
                  value={r.url}
                  onChange={(e) => {
                    setResources((res) => res.map((item, idx) => idx === i ? { ...item, url: e.target.value } : item))
                    setResourcesDirty(true)
                  }}
                  style={{ flex: 1, fontSize: '12px', padding: '5px 8px', height: 'auto' }}
                />
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={async () => {
                    const updated = resources.filter((_, idx) => idx !== i)
                    setResources(updated)
                    setResourcesDirty(false)
                    await updateRecord(TABLES.CLIENTS, client.id, { resources: updated })
                  }}
                  style={{ color: 'var(--danger)', flexShrink: 0 }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Assigned to ── */}
      <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ ...SECTION_LABEL, marginBottom: 0, whiteSpace: 'nowrap' }}>Assigned to</div>
        <input
          className="input"
          placeholder="Team member..."
          value={localAssignedTo}
          onChange={(e) => setLocalAssignedTo(e.target.value)}
          onBlur={(e) => saveClientField('assignedTo', e.target.value)}
          style={{ flex: 1, fontSize: '13px', padding: '6px 10px', height: 'auto' }}
        />
      </div>

      {/* ── Project add/edit modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingProject(null) }}
        title={editingProject ? 'Edit Project' : `New Project — ${client.name}`}
        size="md"
      >
        <ProjectForm
          clientId={client.id}
          clientName={client.name}
          initialData={editingProject}
          onSave={handleSaveProject}
          onCancel={() => { setModalOpen(false); setEditingProject(null) }}
          onDelete={editingProject ? () => { setDeleteTarget(editingProject); setModalOpen(false) } : null}
          saving={saving}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete Project"
        loading={deleteLoading}
      />
    </div>
  )
}
