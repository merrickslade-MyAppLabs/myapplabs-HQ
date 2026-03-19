import { useState, useEffect, useMemo, Component } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { useToast } from '../../components/ui/Toast'
import Modal from '../../components/ui/Modal'

// ── Error boundary ────────────────────────────────────────────────────────────
class ScriptLibraryErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[ScriptLibrary] Render error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Something went wrong</div>
          <button className="btn btn-primary btn-sm" onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="sl-sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

// ── Category badge ────────────────────────────────────────────────────────────
// Stable hue derived from category string so badges are consistent across sessions
function categoryColor(category) {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return { color: `hsl(${hue},65%,55%)`, bg: `hsla(${hue},65%,55%,0.12)` }
}

function CategoryBadge({ category }) {
  const { color, bg } = categoryColor(category)
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: bg, color, whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {category}
    </span>
  )
}

// ── Script card ───────────────────────────────────────────────────────────────
function ScriptCard({ script, isAdmin, onEdit, onDelete }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(script.body).then(() => {
      setCopied(true)
      toast.success(`"${script.title}" copied to clipboard.`)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      toast.error('Unable to copy to clipboard.')
    })
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase.from('scripts').delete().eq('id', script.id)
      if (error) throw error
      toast.success('Script deleted.')
      onDelete(script.id)
    } catch (err) {
      console.error('[Scripts] delete:', err)
      toast.error('Failed to delete script.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}
    >
      {/* Card header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <CategoryBadge category={script.category} />
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {isAdmin && (
              <>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => onEdit(script)}
                  aria-label={`Edit script: ${script.title}`}
                  title="Edit"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M9 2l2 2-7 7H2V9L9 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setConfirmDelete(true)}
                  aria-label={`Delete script: ${script.title}`}
                  title="Delete"
                  style={{ color: '#ef4444' }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 3h9M5 3V2h3v1M4 3l.5 8h4L9 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCopy}
              aria-label={`Copy script: ${script.title}`}
              style={{ minWidth: 70, fontSize: 11 }}
            >
              {copied ? '✓ Copied' : '⧉ Copy'}
            </button>
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
          {script.title}
        </h3>
      </div>

      {/* Body preview — 3 lines, truncated */}
      <div style={{
        padding: '0 16px 12px',
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
        whiteSpace: 'pre-wrap'
      }}>
        {script.body}
      </div>

      {/* Tags */}
      {script.tags?.length > 0 && (
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: 4, flexWrap: 'wrap'
        }}>
          {script.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
              background: 'var(--bg-tertiary)', color: 'var(--text-muted)'
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Delete confirm inline */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              padding: '10px 16px', borderTop: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
            }}
          >
            <span style={{ fontSize: 12, color: '#ef4444' }}>Delete this script?</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                onClick={handleDelete}
                disabled={deleting}
                style={{ background: '#ef4444', color: 'white', border: 'none' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Script modal (add / edit) ─────────────────────────────────────────────────
const EMPTY_FORM = { category: '', title: '', body: '', tags: '' }

function ScriptModal({ isOpen, onClose, onSaved, initial, userId }) {
  const { toast } = useToast()
  const [form, setForm]         = useState(EMPTY_FORM)
  const [errors, setErrors]     = useState({})
  const [submitting, setSubmitting] = useState(false)

  const isEdit = !!initial?.id

  useEffect(() => {
    if (!isOpen) return
    if (initial) {
      setForm({
        category: initial.category || '',
        title:    initial.title    || '',
        body:     initial.body     || '',
        tags:     (initial.tags || []).join(', ')
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [isOpen, initial])

  function validate() {
    const e = {}
    if (!form.category.trim()) e.category = 'Category is required.'
    if (!form.title.trim())    e.title    = 'Title is required.'
    if (form.title.trim().length > 160) e.title = 'Title must be under 160 characters.'
    if (!form.body.trim())     e.body     = 'Body is required.'
    return e
  }

  function parseTags(raw) {
    return raw.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)

    const payload = {
      category:   form.category.trim(),
      title:      form.title.trim(),
      body:       form.body.trim(),
      tags:       parseTags(form.tags),
      updated_at: new Date().toISOString(),
    }

    try {
      if (isEdit) {
        const { data, error } = await supabase
          .from('scripts')
          .update(payload)
          .eq('id', initial.id)
          .select('id, category, title, body, tags, created_at, updated_at')
          .single()
        if (error) throw error
        toast.success('Script updated.')
        onSaved(data, 'edit')
      } else {
        const { data, error } = await supabase
          .from('scripts')
          .insert({ ...payload, created_by: userId })
          .select('id, category, title, body, tags, created_at, updated_at')
          .single()
        if (error) throw error
        toast.success('Script added.')
        onSaved(data, 'add')
      }
      onClose()
    } catch (err) {
      console.error('[Scripts] save:', err)
      toast.error('Failed to save script. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function field(label, key, input, hint) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label htmlFor={`sm-${key}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </label>
        {input}
        {hint && !errors[key] && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>
        )}
        {errors[key] && (
          <span style={{ fontSize: 11, color: '#ef4444' }}>{errors[key]}</span>
        )}
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Script' : 'New Script'}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Script'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        {field('Category *', 'category',
          <input id="sm-category" className="input" type="text"
            value={form.category} maxLength={80}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Cold Outreach"
            aria-required="true" aria-invalid={!!errors.category}
          />
        )}
        {field('Title *', 'title',
          <input id="sm-title" className="input" type="text"
            value={form.title} maxLength={160}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Introduction — New Prospect Outreach"
            aria-required="true" aria-invalid={!!errors.title}
          />
        )}
        {field('Body *', 'body',
          <textarea id="sm-body" className="input" rows={10}
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Write the full script here…"
            style={{ resize: 'vertical', minHeight: 180, fontFamily: 'inherit', fontSize: 13 }}
            aria-required="true" aria-invalid={!!errors.body}
          />,
          'This full text will be copied when the Copy button is clicked.'
        )}
        {field('Tags', 'tags',
          <input id="sm-tags" className="input" type="text"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="cold-outreach, first-contact, introduction"
          />,
          'Comma-separated. Stored as an array. Spaces become hyphens.'
        )}
      </form>
    </Modal>
  )
}

// ── Category sidebar ──────────────────────────────────────────────────────────
function CategorySidebar({ categories, selectedCategory, onSelect, counts }) {
  return (
    <nav aria-label="Script categories" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {['All', ...categories].map(cat => {
        const isSelected = selectedCategory === cat
        const count      = cat === 'All' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[cat] || 0)
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            aria-current={isSelected ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 'var(--radius-md)',
              background: isSelected ? 'var(--accent-primary-muted)' : 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              borderLeft: `3px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'}`,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
          >
            <span style={{
              fontSize: 12, fontWeight: isSelected ? 700 : 400,
              color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)'
            }}>
              {cat}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
              background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: isSelected ? 'white' : 'var(--text-muted)', flexShrink: 0
            }}>
              {count}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ScriptLibraryContent() {
  const { user }  = useAuth()
  const { toast } = useToast()

  const [scripts, setScripts]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [search, setSearch]           = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [showModal, setShowModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState(null)

  // ── Fetch scripts + check admin role ───────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: sData, error: sErr }, { data: pData }] = await Promise.all([
        supabase
          .from('scripts')
          .select('id, category, title, body, tags, created_at, updated_at')
          .order('category')
          .order('title'),
        supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
      ])

      if (sErr) {
        console.error('[Scripts] load:', sErr)
        setError('Unable to load scripts.')
      } else {
        setScripts(sData || [])
      }

      if (pData?.role === 'admin' || pData?.role === 'super_admin') {
        setIsAdmin(true)
      }

      setLoading(false)
    }

    load()
  }, [user.id])

  // ── Derived data ──────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = [...new Set(scripts.map(s => s.category))].sort()
    return cats
  }, [scripts])

  const counts = useMemo(() => {
    const c = {}
    scripts.forEach(s => { c[s.category] = (c[s.category] || 0) + 1 })
    return c
  }, [scripts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return scripts.filter(s => {
      const matchesCat = selectedCategory === 'All' || s.category === selectedCategory
      if (!matchesCat) return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      )
    })
  }, [scripts, search, selectedCategory])

  // ── Mutation handlers ─────────────────────────────────────────────────────
  function handleSaved(script, mode) {
    if (mode === 'add') {
      setScripts(prev => [...prev, script])
    } else {
      setScripts(prev => prev.map(s => s.id === script.id ? script : s))
    }
  }

  function handleDeleted(id) {
    setScripts(prev => prev.filter(s => s.id !== id))
  }

  function openAdd() {
    setEditTarget(null)
    setShowModal(true)
  }

  function openEdit(script) {
    setEditTarget(script)
    setShowModal(true)
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', gap: 20 }}>
        <div style={{ width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} width="100%" height={34} />)}
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, alignContent: 'start' }}>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} width="100%" height={150} />)}
        </div>
        <style>{`.sl-sk-pulse{animation:slSk 1.6s ease-in-out infinite}@keyframes slSk{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{error}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          type="search"
          placeholder="Search scripts by title, content, or tag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search scripts"
          style={{ flex: 1, maxWidth: 420, height: 36, fontSize: 13 }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length} script{filtered.length !== 1 ? 's' : ''}
          </span>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openAdd} aria-label="Add new script">
              + New Script
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 20, overflow: 'hidden', minHeight: 0 }}>

        {/* Category sidebar */}
        <div style={{
          width: 192, flexShrink: 0, overflowY: 'auto',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', padding: '10px 8px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 6px', marginBottom: 6 }}>
            Categories
          </div>
          <CategorySidebar
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={cat => { setSelectedCategory(cat); setSearch('') }}
            counts={counts}
          />
        </div>

        {/* Script grid */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📝</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {scripts.length === 0 ? 'No scripts yet' : 'No scripts match your search'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {scripts.length === 0
                  ? 'Run the SQL migration to seed the 16 pre-built scripts.'
                  : 'Try a different search term or select a different category.'}
              </div>
              {scripts.length === 0 && isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ marginTop: 16 }}>
                  + Add First Script
                </button>
              )}
            </div>
          ) : (
            <motion.div
              layout
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14, alignContent: 'start'
              }}
            >
              <AnimatePresence mode="popLayout">
                {filtered.map(script => (
                  <ScriptCard
                    key={script.id}
                    script={script}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={handleDeleted}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      <ScriptModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        initial={editTarget}
        userId={user.id}
      />

      <style>{`
        .sl-sk-pulse { animation: slSk 1.6s ease-in-out infinite; }
        @keyframes slSk { 0%,100%{opacity:.9} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}

export default function ScriptLibraryPage() {
  return (
    <ScriptLibraryErrorBoundary>
      <ScriptLibraryContent />
    </ScriptLibraryErrorBoundary>
  )
}
