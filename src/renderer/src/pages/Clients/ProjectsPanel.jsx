import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SkeletonList } from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
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

const PROJECT_STATUSES = ['in progress', 'review', 'completed']

const STATUS_STYLES = {
  'in progress': { bg: 'var(--info-muted)', color: 'var(--info)' },
  'review': { bg: 'var(--warning-muted)', color: 'var(--warning)' },
  'completed': { bg: 'var(--success-muted)', color: 'var(--success)' }
}

function ProjectForm({ clientId, clientName, initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    status: initialData?.status || 'in progress',
    deadline: initialData?.deadline || '',
    notes: initialData?.notes || ''
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
      notes: form.notes.trim()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Project Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="input" placeholder="e.g. Website Redesign" value={form.name} onChange={(e) => handleChange('name', e.target.value)} autoFocus disabled={saving} />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <textarea className="input textarea" placeholder="Brief project description..." value={form.description} onChange={(e) => handleChange('description', e.target.value)} rows={2} disabled={saving} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Status</label>
          <select className="input select" value={form.status} onChange={(e) => handleChange('status', e.target.value)} disabled={saving}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Deadline</label>
          <input type="date" className="input" value={form.deadline} onChange={(e) => handleChange('deadline', e.target.value)} disabled={saving} />
        </div>
      </div>
      <div style={{ marginBottom: '24px' }}>
        <label className="label">Notes</label>
        <textarea className="input textarea" placeholder="Project notes..." value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} rows={2} disabled={saving} />
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Project'}
        </button>
      </div>
    </form>
  )
}

export default function ProjectsPanel({ client, onClose }) {
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Subscribe to projects for this specific client in real time
  useEffect(() => {
    if (!client?.id) return

    const unsubscribe = subscribeToProjectsByClient(
      client.id,
      (docs, err) => {
        if (err) console.error('Projects subscription error:', err)
        else setProjects(docs)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [client?.id])

  async function handleSaveProject(formData) {
    setSaving(true)
    if (editingProject) {
      const { error } = await updateRecord(TABLES.PROJECTS, editingProject.id, formData)
      if (error) { toast('Failed to update project.', 'error') }
      else { toast('Project updated.', 'success'); setModalOpen(false); setEditingProject(null) }
    } else {
      const { error } = await addRecord(TABLES.PROJECTS, formData)
      if (error) { toast('Failed to add project.', 'error') }
      else { toast('Project added.', 'success'); setModalOpen(false) }
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
    else { toast('Project deleted.', 'info') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div>
            <div className="page-title" style={{ fontSize: '17px' }}>{client.name}</div>
            <div className="page-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingProject(null); setModalOpen(true) }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Project
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close panel">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        {client.notes && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
            {client.notes}
          </div>
        )}
      </div>

      {/* Projects list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <SkeletonList count={3} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="2" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.4"/><rect x="12" y="2" width="7" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/></svg>}
            title="No projects yet"
            description="Add a project for this client to start tracking progress."
            action={<button className="btn btn-primary btn-sm" onClick={() => { setEditingProject(null); setModalOpen(true) }}>Add First Project</button>}
          />
        ) : (
          <AnimatePresence initial={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {projects.map((project) => {
                const ss = STATUS_STYLES[project.status] || STATUS_STYLES['in progress']
                return (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="card"
                    style={{ padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {project.name}
                        </div>
                        {project.description && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                            {project.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: ss.bg, color: ss.color }}>
                            {project.status}
                          </span>
                          {project.deadline && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <rect x="1" y="2" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1"/>
                                <path d="M3 1v2M7 1v2M1 5h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                              </svg>
                              {new Date(project.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditingProject(project); setModalOpen(true) }} title="Edit">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget(project)} title="Delete" style={{ color: 'var(--danger)' }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 3h8M4.5 3V2h3v1M4 4.5v4M8 4.5v4M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </AnimatePresence>
        )}
      </div>

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
