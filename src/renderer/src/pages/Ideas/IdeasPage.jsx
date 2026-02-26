import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { SkeletonCard } from '../../components/ui/Skeleton'
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

// Pipeline stages
const IDEA_COLUMNS = [
  { id: 'concept',    label: 'Concept',    color: 'var(--text-muted)' },
  { id: 'validating', label: 'Validating', color: 'var(--warning)' },
  { id: 'building',   label: 'Building',   color: 'var(--info)' },
  { id: 'launched',   label: 'Launched',   color: 'var(--success)' },
  { id: 'shelved',    label: 'Shelved',    color: 'var(--danger)' }
]

const PLATFORMS = ['iOS', 'Android', 'Web', 'macOS', 'Cross-platform', 'Other']

// ── Idea Card ──────────────────────────────────────────────────
function IdeaCard({ idea, isDragging, onEdit, onDelete }) {
  return (
    <div
      className="card"
      style={{
        padding: '12px 14px',
        cursor: 'grab',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : undefined,
        userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {idea.name}
          </div>
          {idea.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {idea.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {idea.platform && (
              <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '10px' }}>
                {idea.platform}
              </span>
            )}
            {idea.potentialRevenue && (
              <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>
                {idea.potentialRevenue}
              </span>
            )}
            {idea.appStoreLink && (
              <span style={{ fontSize: '10px', color: 'var(--info)' }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ verticalAlign: 'middle', marginRight: '2px' }}>
                  <path d="M1 9l8-8M9 1H4M9 1v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Listed
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0, marginTop: '-2px' }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onEdit}
            title="Edit"
            style={{ width: 24, height: 24, padding: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onDelete}
            title="Delete"
            style={{ width: 24, height: 24, padding: 0, color: 'var(--danger)' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M4.5 3V2h3v1M4 4.5v4M8 4.5v4M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Idea Form ──────────────────────────────────────────────────
function IdeaForm({ initialData, defaultColumn, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:            initialData?.name             || '',
    description:     initialData?.description      || '',
    platform:        initialData?.platform         || 'iOS',
    stage:           initialData?.stage            || defaultColumn || 'concept',
    potentialRevenue: initialData?.potentialRevenue || '',
    appStoreLink:    initialData?.appStoreLink      || '',
    notes:           initialData?.notes            || ''
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Idea name is required.'
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
      name:             form.name.trim(),
      description:      form.description.trim(),
      platform:         form.platform,
      stage:            form.stage,
      potentialRevenue: form.potentialRevenue.trim(),
      appStoreLink:     form.appStoreLink.trim(),
      notes:            form.notes.trim()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Idea Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="e.g. Habit Tracker Pro"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <textarea
          className="input textarea"
          placeholder="What does this app do? Who is it for?"
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={2}
          disabled={saving}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Platform</label>
          <select className="input select" value={form.platform} onChange={(e) => handleChange('platform', e.target.value)} disabled={saving}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="input select" value={form.stage} onChange={(e) => handleChange('stage', e.target.value)} disabled={saving}>
            {IDEA_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Potential Revenue</label>
          <input
            className="input"
            placeholder="e.g. £500/mo"
            value={form.potentialRevenue}
            onChange={(e) => handleChange('potentialRevenue', e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">App Store Link</label>
          <input
            className="input"
            placeholder="https://apps.apple.com/..."
            value={form.appStoreLink}
            onChange={(e) => handleChange('appStoreLink', e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label className="label">Notes</label>
        <textarea
          className="input textarea"
          placeholder="Research notes, competitors, monetisation ideas..."
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={2}
          disabled={saving}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Idea'}
        </button>
      </div>
    </form>
  )
}

// ── Ideas Pipeline Page ────────────────────────────────────────
export default function IdeasPage() {
  const toast = useToast()
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingIdea, setEditingIdea] = useState(null)
  const [defaultColumn, setDefaultColumn] = useState('concept')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.IDEAS,
      (docs, err) => {
        if (err) setError('Failed to load ideas.')
        else { setIdeas(docs); setError(null) }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Group ideas by pipeline stage
  const ideasByColumn = IDEA_COLUMNS.reduce((acc, col) => {
    acc[col.id] = ideas.filter((i) => i.stage === col.id)
    return acc
  }, {})

  async function handleDragEnd(result) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const idea = ideas.find((i) => i.id === draggableId)
    if (!idea) return

    // Optimistic update
    setIdeas((prev) =>
      prev.map((i) => i.id === draggableId ? { ...i, stage: destination.droppableId } : i)
    )

    const { error: err } = await updateRecord(TABLES.IDEAS, draggableId, {
      stage: destination.droppableId
    })
    if (err) {
      // Revert on failure
      setIdeas((prev) =>
        prev.map((i) => i.id === draggableId ? { ...i, stage: source.droppableId } : i)
      )
      toast('Failed to move idea. Please try again.', 'error')
    }
  }

  function openAddModal(columnId = 'concept') {
    setEditingIdea(null)
    setDefaultColumn(columnId)
    setModalOpen(true)
  }

  function openEditModal(idea) {
    setEditingIdea(idea)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingIdea(null)
  }

  async function handleSaveIdea(formData) {
    setSaving(true)
    if (editingIdea) {
      const { error: err } = await updateRecord(TABLES.IDEAS, editingIdea.id, formData)
      if (err) toast('Failed to update idea.', 'error')
      else { toast('Idea updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.IDEAS, formData)
      if (err) toast('Failed to add idea.', 'error')
      else { toast('Idea added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDeleteIdea() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.IDEAS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete idea.', 'error')
    else toast('Idea deleted.', 'info')
  }

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
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div>
          <div className="page-title">Ideas Pipeline</div>
          <div className="page-subtitle">{ideas.length} idea{ideas.length !== 1 ? 's' : ''} tracked</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openAddModal()}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add Idea
        </button>
      </div>

      {/* Kanban Board */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '20px 24px' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '14px',
              height: '100%'
            }}
          >
            {IDEA_COLUMNS.map((col) => {
              const colIdeas = ideasByColumn[col.id] || []

              return (
                <div
                  key={col.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Column Header */}
                  <div
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                      <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {col.label}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: 99,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-muted)'
                        }}
                      >
                        {colIdeas.length}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => openAddModal(col.id)}
                      title={`Add idea to ${col.label}`}
                      style={{ width: 24, height: 24, padding: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>

                  {/* Droppable list */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          padding: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          minHeight: '60px',
                          background: snapshot.isDraggingOver ? 'var(--accent-primary-muted)' : 'transparent',
                          transition: 'background 0.15s ease',
                          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                        }}
                      >
                        {loading ? (
                          Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
                        ) : colIdeas.length === 0 && !snapshot.isDraggingOver ? (
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                              fontStyle: 'italic',
                              padding: '20px 0',
                              textAlign: 'center'
                            }}
                          >
                            Drop ideas here
                          </div>
                        ) : (
                          colIdeas.map((idea, index) => (
                            <Draggable key={idea.id} draggableId={idea.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.85 : 1
                                  }}
                                >
                                  <IdeaCard
                                    idea={idea}
                                    isDragging={snapshot.isDragging}
                                    onEdit={() => openEditModal(idea)}
                                    onDelete={() => setDeleteTarget(idea)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingIdea ? 'Edit Idea' : 'Add New Idea'}
        size="md"
      >
        <IdeaForm
          initialData={editingIdea}
          defaultColumn={defaultColumn}
          onSave={handleSaveIdea}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteIdea}
        title="Delete Idea"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete Idea"
        loading={deleteLoading}
      />
    </div>
  )
}
