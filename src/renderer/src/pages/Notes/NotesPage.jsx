import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { SkeletonCard } from '../../components/ui/Skeleton'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'
import {
  subscribeToTable,
  getRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'

// ── Tag colour system — consistent colour per tag name ──────────
const TAG_PALETTE = [
  { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' }, // purple
  { bg: 'rgba(59, 130, 246, 0.15)',  text: '#3b82f6' }, // blue
  { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }, // green
  { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' }, // amber
  { bg: 'rgba(239, 68, 68, 0.15)',  text: '#ef4444' }, // red
  { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6' }, // teal
  { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' }, // pink
]

function getTagColour(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

// ── Reusable tag badge ──────────────────────────────────────────
function TagBadge({ tag, active, onClick, onRemove }) {
  const colour = getTagColour(tag)
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: 99,
        background: colour.bg,
        color: colour.text,
        fontSize: '11px',
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        border: active ? `1px solid ${colour.text}` : '1px solid transparent',
        transition: 'opacity 0.15s'
      }}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            lineHeight: 1
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </span>
  )
}

// ── Tag input — press Enter or comma to add ─────────────────────
function TagInput({ tags, onChange, disabled }) {
  const [inputVal, setInputVal] = useState('')

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInputVal('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputVal)
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '6px 10px',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-primary)',
        minHeight: '40px',
        alignItems: 'center',
        cursor: 'text'
      }}
      onClick={() => document.getElementById('notes-tag-input')?.focus()}
    >
      {tags.map((tag) => (
        <TagBadge
          key={tag}
          tag={tag}
          onRemove={disabled ? undefined : () => onChange(tags.filter((t) => t !== tag))}
        />
      ))}
      <input
        id="notes-tag-input"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) addTag(inputVal) }}
        placeholder={tags.length === 0 ? 'Add tags — press Enter or comma...' : ''}
        disabled={disabled}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '13px',
          color: 'var(--text-primary)',
          flex: 1,
          minWidth: '140px',
          padding: '2px 0'
        }}
      />
    </div>
  )
}

// ── Note card ───────────────────────────────────────────────────
function NoteCard({ note, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)

  const dateStr = new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        position: 'relative',
        minHeight: '130px'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit()}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{
          flex: 1,
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          wordBreak: 'break-word'
        }}>
          {note.title}
        </div>

        {/* Action buttons — visible on hover */}
        {hovered && (
          <div
            style={{ display: 'flex', gap: '2px', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onEdit}
              title="Edit"
              style={{ width: 26, height: 26, padding: 0 }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onDelete}
              title="Delete"
              style={{ width: 26, height: 26, padding: 0, color: 'var(--danger)' }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M4.5 3V2h3v1M4 4.5v4M8 4.5v4M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Content preview */}
      {note.content && (
        <div style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          flex: 1
        }}>
          {note.content}
        </div>
      )}

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {note.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* Footer — date */}
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        marginTop: 'auto',
        paddingTop: '2px'
      }}>
        {dateStr}
      </div>
    </motion.div>
  )
}

// ── Note form ───────────────────────────────────────────────────
function NoteForm({ initialData, defaultType, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    title:   initialData?.title   || '',
    content: initialData?.content || '',
    tags:    Array.isArray(initialData?.tags) ? initialData.tags : [],
    type:    initialData?.type    || defaultType || 'shared'
  })
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }))
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.title.trim()) errs.title = 'Title is required.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave({ title: form.title.trim(), content: form.content.trim(), tags: form.tags, type: form.type })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Type toggle */}
      <div style={{ marginBottom: '16px' }}>
        <label className="label">Note Type</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'shared',   emoji: '👥', label: 'Shared',    desc: 'Both of you can see this' },
            { id: 'personal', emoji: '🔒', label: 'My Note',   desc: 'Only visible to you' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set('type', t.id)}
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: form.type === t.id ? 'var(--accent-primary)' : 'var(--border-color)',
                background: form.type === t.id ? 'var(--accent-primary-muted)' : 'var(--bg-secondary)',
                color: form.type === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ fontSize: '15px', marginBottom: '2px' }}>{t.emoji} {t.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.75 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Title <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="Note title..."
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.title && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.title}</div>}
      </div>

      {/* Content */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Content</label>
        <textarea
          className="input textarea"
          placeholder="Write your note here..."
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          rows={6}
          disabled={saving}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      </div>

      {/* Tags */}
      <div style={{ marginBottom: '24px' }}>
        <label className="label">Tags</label>
        <TagInput
          tags={form.tags}
          onChange={(t) => set('tags', t)}
          disabled={saving}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
          Press <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>Enter</kbd> or <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>,</kbd> to add · <kbd style={{ padding: '1px 5px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '10px' }}>⌫</kbd> to remove last
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Note'}
        </button>
      </div>
    </form>
  )
}

// ── Empty state ─────────────────────────────────────────────────
function EmptyState({ tab, tagFilter, onAdd }) {
  const msg = tagFilter
    ? `No ${tab === 'shared' ? 'shared' : 'personal'} notes tagged "${tagFilter}"`
    : tab === 'shared'
      ? 'No shared notes yet — create one your whole team can see'
      : 'No personal notes yet — keep your private thoughts here'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: '14px',
      color: 'var(--text-muted)',
      paddingBottom: '80px'
    }}>
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ opacity: 0.25 }}>
        <rect x="8" y="6" width="36" height="40" rx="5" stroke="currentColor" strokeWidth="2"/>
        <path d="M17 18h18M17 25h18M17 32h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>No notes here</div>
      <div style={{ fontSize: '12.5px', textAlign: 'center', maxWidth: '260px', lineHeight: 1.5 }}>{msg}</div>
      {!tagFilter && (
        <button className="btn btn-primary btn-sm" onClick={onAdd} style={{ marginTop: '4px' }}>
          Create first note
        </button>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────
export default function NotesPage() {
  const toast = useToast()
  const { user } = useAuth()

  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('shared') // 'shared' | 'personal'
  const [tagFilter, setTagFilter] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = subscribeToTable(TABLES.NOTES, (docs, err) => {
      if (err) setError('Failed to load notes.')
      else { setNotes(docs); setError(null) }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Notes filtered by tab
  const tabNotes = notes.filter((n) => {
    if (activeTab === 'shared') return n.type === 'shared'
    return n.type === 'personal' && n.userId === user?.id
  })

  // Unique tags across current tab
  const allTags = [...new Set(tabNotes.flatMap((n) => n.tags || []))]

  // Further filter by active tag
  const visibleNotes = tagFilter
    ? tabNotes.filter((n) => (n.tags || []).includes(tagFilter))
    : tabNotes

  const sharedCount   = notes.filter((n) => n.type === 'shared').length
  const personalCount = notes.filter((n) => n.type === 'personal' && n.userId === user?.id).length

  // Manual refetch — called after save/delete as a fallback in case
  // the realtime subscription hasn't been enabled for the notes table yet.
  async function refetch() {
    const { data } = await getRecords(TABLES.NOTES)
    setNotes(data)
  }

  function openAdd() {
    setEditingNote(null)
    setModalOpen(true)
  }

  function openEdit(note) {
    setEditingNote(note)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingNote(null)
  }

  async function handleSave(formData) {
    setSaving(true)
    const payload = { ...formData, userId: user?.id }

    if (editingNote) {
      const { error: err } = await updateRecord(TABLES.NOTES, editingNote.id, payload)
      if (err) toast('Failed to update note.', 'error')
      else { await refetch(); toast('Note updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.NOTES, payload)
      if (err) toast('Failed to add note.', 'error')
      else { await refetch(); toast('Note added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.NOTES, deleteTarget.id)
    if (!err) await refetch()
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete note.', 'error')
    else toast('Note deleted.', 'info')
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

      {/* ── Page header + tabs ── */}
      <div style={{
        padding: '20px 24px 0',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div className="page-title">Notes</div>
            <div className="page-subtitle">
              {loading ? 'Loading…' : `${visibleNotes.length} note${visibleNotes.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New Note
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex' }}>
          {[
            { id: 'shared',   label: '👥 Shared',   count: sharedCount },
            { id: 'personal', label: '🔒 My Notes', count: personalCount }
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setTagFilter(null) }}
                style={{
                  padding: '8px 18px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  background: 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  transition: 'all 0.15s ease',
                  marginBottom: '-1px'
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 99,
                  background: isActive ? 'var(--accent-primary-muted)' : 'var(--bg-tertiary)',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)'
                }}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tag filter bar (only when tags exist) ── */}
      {allTags.length > 0 && (
        <div style={{
          padding: '8px 24px',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginRight: '2px' }}>
            Filter by tag:
          </span>

          <button
            onClick={() => setTagFilter(null)}
            style={{
              padding: '3px 10px',
              borderRadius: 99,
              border: '1px solid',
              borderColor: !tagFilter ? 'var(--accent-primary)' : 'var(--border-color)',
              background: !tagFilter ? 'var(--accent-primary-muted)' : 'transparent',
              color: !tagFilter ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: !tagFilter ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            All
          </button>

          {allTags.map((tag) => {
            const colour = getTagColour(tag)
            const isActive = tagFilter === tag
            return (
              <button
                key={tag}
                onClick={() => setTagFilter(isActive ? null : tag)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 99,
                  border: `1px solid ${isActive ? colour.text : 'var(--border-color)'}`,
                  background: isActive ? colour.bg : 'transparent',
                  color: isActive ? colour.text : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Notes grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : visibleNotes.length === 0 ? (
          <EmptyState tab={activeTab} tagFilter={tagFilter} onAdd={openAdd} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {visibleNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => openEdit(note)}
                onDelete={(e) => { if (e) e.stopPropagation(); setDeleteTarget(note) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingNote ? 'Edit Note' : 'New Note'}
        size="md"
      >
        <NoteForm
          initialData={editingNote}
          defaultType={activeTab === 'personal' ? 'personal' : 'shared'}
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
        title="Delete Note"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmText="Delete Note"
        loading={deleteLoading}
      />
    </div>
  )
}
