// ============================================================
// MyAppLabs HQ — Providers Page
// Secure internal directory of third-party services & tools.
// Passwords are AES-256-GCM encrypted; reveal requires re-auth.
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/ui/Toast'
import {
  subscribeToProviders,
  addRecord,
  updateRecord,
  deleteRecord,
  fetchProviderPassword,
  addAuditLog,
  TABLES
} from '../../supabase/database'
import {
  encryptPassword,
  decryptPassword,
  generatePassword,
  PLACEHOLDER_PASSWORD
} from '../../utils/crypto'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['Insurance', 'Development', 'Hosting', 'Communication', 'Finance', 'Compliance', 'Other']

const CATEGORY_COLORS = {
  Insurance:     { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  Development:   { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa' },
  Hosting:       { bg: 'rgba(34,197,94,0.15)',   text: '#4ade80' },
  Communication: { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
  Finance:       { bg: 'rgba(234,179,8,0.15)',   text: '#fbbf24' },
  Compliance:    { bg: 'rgba(239,68,68,0.15)',   text: '#f87171' },
  Other:         { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' }
}

const EMPTY_FORM = {
  name: '', category: 'Development', description: '',
  url: '', username: '', password: '', notes: ''
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const { user } = useAuth()
  const toast = useToast()

  // ── Data state
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const prevProviderIdsRef = useRef(new Set())

  // ── Filter state
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── Form state
  const [form, setForm] = useState(EMPTY_FORM)
  const [formPasswordVisible, setFormPasswordVisible] = useState(false)
  const [formPasswordChanged, setFormPasswordChanged] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  // ── Re-auth gate
  const [reAuthModal, setReAuthModal] = useState(null) // { providerId, providerName, action }
  const [reAuthPassword, setReAuthPassword] = useState('')
  const [reAuthError, setReAuthError] = useState('')
  const [reAuthLoading, setReAuthLoading] = useState(false)

  // ── Password reveal (in-memory only, never persisted)
  const [verifiedProviderIds] = useState(() => new Set()) // session-only, stable ref via useState
  const revealTimersRef = useRef({})
  const [revealedPasswords, setRevealedPasswords] = useState({})   // { [id]: plaintext }
  const [revealCountdowns, setRevealCountdowns] = useState({})     // { [id]: seconds }

  // ── Notes expansion
  const [expandedNotes, setExpandedNotes] = useState(new Set())

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToProviders((rows, err) => {
      if (err) {
        toast('Failed to load providers', 'error')
        setLoading(false)
        return
      }

      // Detect providers added by the other partner → show toast
      const newIds = new Set(rows.map((p) => p.id))
      rows.forEach((p) => {
        if (!prevProviderIdsRef.current.has(p.id) && prevProviderIdsRef.current.size > 0) {
          if (p.addedBy && p.addedBy !== user?.id) {
            toast(`New provider added: ${p.name}`, 'info')
          }
        }
      })
      prevProviderIdsRef.current = newIds

      setProviders(rows)
      setLoading(false)
    })
    return unsubscribe
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup reveal timers on unmount
  useEffect(() => {
    return () => {
      Object.values(revealTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  // ── Filtered providers ────────────────────────────────────────────────────
  const filteredProviders = providers.filter((p) => {
    if (categoryFilter !== 'All' && p.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches =
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.username?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openAddModal() {
    setEditingProvider(null)
    setForm(EMPTY_FORM)
    setFormPasswordVisible(false)
    setFormPasswordChanged(false)
    setShowModal(true)
  }

  function openEditModal(provider) {
    setEditingProvider(provider)
    setForm({
      name: provider.name || '',
      category: provider.category || 'Development',
      description: provider.description || '',
      url: provider.url || '',
      username: provider.username || '',
      password: '', // Never pre-fill — user must re-enter to change
      notes: provider.notes || ''
    })
    setFormPasswordVisible(false)
    setFormPasswordChanged(false)
    setShowModal(true)
  }

  // ── Save provider ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) {
      toast('Provider name is required', 'error')
      return
    }
    setFormLoading(true)
    try {
      let passwordEncrypted = undefined // undefined = don't touch the column on update

      if (editingProvider) {
        // Only re-encrypt if user typed a new password
        if (formPasswordChanged && form.password) {
          passwordEncrypted = await encryptPassword(form.password, user.id, user.email)
        }
      } else {
        // New provider
        passwordEncrypted = form.password
          ? await encryptPassword(form.password, user.id, user.email)
          : PLACEHOLDER_PASSWORD
      }

      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        url: form.url.trim() || null,
        username: form.username.trim() || null,
        notes: form.notes.trim() || null,
        addedBy: user.id
      }
      if (passwordEncrypted !== undefined) {
        payload.passwordEncrypted = passwordEncrypted
      }

      if (editingProvider) {
        const { error } = await updateRecord(TABLES.PROVIDERS, editingProvider.id, payload)
        if (error) throw new Error(error)
        await addAuditLog({
          userId: user.id, action: 'provider_updated',
          resourceType: 'provider', resourceId: editingProvider.id,
          metadata: { name: form.name }
        })
        toast('Provider updated', 'success')
      } else {
        const { id, error } = await addRecord(TABLES.PROVIDERS, payload)
        if (error) throw new Error(error)
        await addAuditLog({
          userId: user.id, action: 'provider_added',
          resourceType: 'provider', resourceId: id,
          metadata: { name: form.name }
        })
        toast('Provider added', 'success')
      }
      setShowModal(false)
    } catch {
      toast('Failed to save provider', 'error')
    } finally {
      setFormLoading(false)
    }
  }

  // ── Delete provider ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error } = await deleteRecord(TABLES.PROVIDERS, deleteTarget.id)
    if (error) {
      toast('Failed to delete provider', 'error')
    } else {
      await addAuditLog({
        userId: user.id, action: 'provider_deleted',
        resourceType: 'provider', resourceId: deleteTarget.id,
        metadata: { name: deleteTarget.name }
      })
      toast(`"${deleteTarget.name}" deleted`, 'success')
      // Clear any revealed password for deleted provider
      hidePassword(deleteTarget.id)
    }
    setDeleteLoading(false)
    setDeleteTarget(null)
  }

  // ── Password reveal flow ──────────────────────────────────────────────────
  function handlePasswordAction(provider, action) {
    if (verifiedProviderIds.has(provider.id)) {
      decryptAndShow(provider.id, action)
    } else {
      setReAuthModal({ providerId: provider.id, providerName: provider.name, action })
      setReAuthPassword('')
      setReAuthError('')
    }
  }

  async function handleReAuth() {
    if (!reAuthPassword) {
      setReAuthError('Please enter your password')
      return
    }
    setReAuthLoading(true)
    setReAuthError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: reAuthPassword
      })

      if (error) {
        setReAuthError('Incorrect password. Please try again.')
        await addAuditLog({
          userId: user.id, action: 'provider_reveal_failed',
          resourceType: 'provider', resourceId: reAuthModal.providerId,
          metadata: { providerName: reAuthModal.providerName }
        })
        setReAuthLoading(false)
        return
      }

      const { providerId, action } = reAuthModal
      verifiedProviderIds.add(providerId) // session-only, not persisted
      setReAuthModal(null)
      setReAuthPassword('')
      await decryptAndShow(providerId, action)
    } catch {
      setReAuthError('Authentication failed. Please try again.')
    } finally {
      setReAuthLoading(false)
    }
  }

  async function decryptAndShow(providerId, action) {
    try {
      const encryptedData = await fetchProviderPassword(providerId)

      if (!encryptedData || encryptedData === PLACEHOLDER_PASSWORD) {
        toast('No password set for this provider', 'info')
        return
      }

      const decrypted = await decryptPassword(encryptedData, user.id, user.email)

      if (action === 'copy') {
        await navigator.clipboard.writeText(decrypted)
        toast('Password copied to clipboard', 'success')
        await addAuditLog({
          userId: user.id, action: 'provider_password_copied',
          resourceType: 'provider', resourceId: providerId
        })
        return
      }

      // Reveal mode — show for 30 seconds then auto-hide
      clearRevealTimers(providerId)
      setRevealedPasswords((prev) => ({ ...prev, [providerId]: decrypted }))
      setRevealCountdowns((prev) => ({ ...prev, [providerId]: 30 }))

      revealTimersRef.current[`${providerId}_interval`] = setInterval(() => {
        setRevealCountdowns((prev) => {
          const next = (prev[providerId] ?? 1) - 1
          if (next <= 0) clearRevealTimers(providerId)
          return { ...prev, [providerId]: next }
        })
      }, 1000)

      revealTimersRef.current[providerId] = setTimeout(() => {
        hidePassword(providerId)
      }, 30000)

      await addAuditLog({
        userId: user.id, action: 'provider_password_revealed',
        resourceType: 'provider', resourceId: providerId
      })
    } catch (err) {
      if (err.message?.includes('Rate limit')) {
        toast('Too many requests. Please wait a moment.', 'error')
      } else {
        toast('Could not decrypt. Password may have been set on a different machine.', 'error')
      }
    }
  }

  function clearRevealTimers(providerId) {
    clearTimeout(revealTimersRef.current[providerId])
    clearInterval(revealTimersRef.current[`${providerId}_interval`])
    delete revealTimersRef.current[providerId]
    delete revealTimersRef.current[`${providerId}_interval`]
  }

  function hidePassword(providerId) {
    clearRevealTimers(providerId)
    setRevealedPasswords((prev) => { const n = { ...prev }; delete n[providerId]; return n })
    setRevealCountdowns((prev) => { const n = { ...prev }; delete n[providerId]; return n })
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function openUrl(url) {
    if (!url) return
    if (window.electronShell) {
      window.electronShell.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function handleGeneratePassword() {
    const pwd = generatePassword(20)
    setForm((f) => ({ ...f, password: pwd }))
    setFormPasswordChanged(true)
    navigator.clipboard.writeText(pwd).then(() => {
      toast('Generated password copied to clipboard', 'success')
    }).catch(() => {})
  }

  function toggleNotes(id) {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const allTabs = ['All', ...CATEGORIES]

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Providers</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Secure directory of third-party services · passwords encrypted at rest
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal} style={{ gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add Provider
        </button>
      </div>

      {/* ── Category tabs ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {allTabs.map((cat) => {
          const active = categoryFilter === cat
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 14px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: active ? 'var(--accent-primary)' : 'var(--border-color)',
                background: active ? 'var(--accent-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 24, maxWidth: 380 }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
          <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, description, username…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input"
          style={{ paddingLeft: 32, width: '100%' }}
        />
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 64 }}>Loading providers…</div>
      ) : filteredProviders.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 64 }}>
          {searchQuery || categoryFilter !== 'All'
            ? 'No providers match your filters.'
            : 'No providers yet — add your first one.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {filteredProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              revealedPassword={revealedPasswords[provider.id]}
              countdown={revealCountdowns[provider.id]}
              notesExpanded={expandedNotes.has(provider.id)}
              onEdit={() => openEditModal(provider)}
              onDelete={() => setDeleteTarget(provider)}
              onReveal={() => handlePasswordAction(provider, 'reveal')}
              onCopy={() => handlePasswordAction(provider, 'copy')}
              onHide={() => hidePassword(provider.id)}
              onToggleNotes={() => toggleNotes(provider.id)}
              onOpenUrl={() => openUrl(provider.url)}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProvider ? `Edit ${editingProvider.name}` : 'Add Provider'}
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={formLoading}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={formLoading}>
              {formLoading ? 'Saving…' : (editingProvider ? 'Save Changes' : 'Add Provider')}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Stripe" autoFocus />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this service used for?" />
          </div>
          <div>
            <label className="label">Login URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
              {form.url && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => openUrl(form.url)}>Test</button>
              )}
            </div>
          </div>
          <div>
            <label className="label">Username / Email</label>
            <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="admin@myapplabs.co.uk" autoComplete="off" />
          </div>
          <div>
            <label className="label">
              Password
              {editingProvider && !formPasswordChanged && (
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>leave blank to keep existing</span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  className="input"
                  type={formPasswordVisible ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setFormPasswordChanged(true) }}
                  placeholder={editingProvider ? '••••••••' : 'Enter password'}
                  autoComplete="new-password"
                  style={{ paddingRight: 36, width: '100%' }}
                />
                <button type="button" onClick={() => setFormPasswordVisible((v) => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  {formPasswordVisible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={handleGeneratePassword} style={{ whiteSpace: 'nowrap' }}>
                Generate
              </button>
            </div>
            {form.password && <PasswordStrength password={form.password} />}
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Account number, policy reference, etc." rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This permanently removes the provider and its encrypted password. This cannot be undone."
        confirmText="Delete"
        loading={deleteLoading}
      />

      {/* ── Re-auth modal ── */}
      <Modal
        isOpen={!!reAuthModal}
        onClose={() => { setReAuthModal(null); setReAuthPassword(''); setReAuthError('') }}
        title="Confirm Your Identity"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setReAuthModal(null); setReAuthPassword('') }} disabled={reAuthLoading}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReAuth} disabled={reAuthLoading || !reAuthPassword}>
              {reAuthLoading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', alignItems: 'flex-start' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <rect x="4" y="8" width="10" height="8" rx="1.5" stroke="var(--accent-primary)" strokeWidth="1.5" />
              <path d="M6 8V6a3 3 0 016 0v2" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              To {reAuthModal?.action === 'copy' ? 'copy' : 'reveal'} the password for{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{reAuthModal?.providerName}</strong>, confirm your HQ account password.
              Once verified, you won't be prompted again for this provider this session.
            </p>
          </div>
          <div>
            <label className="label">Your HQ Password</label>
            <input
              className="input"
              type="password"
              value={reAuthPassword}
              onChange={(e) => setReAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReAuth()}
              placeholder="Enter your password"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          {reAuthError && (
            <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{reAuthError}</p>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider, revealedPassword, countdown, notesExpanded,
  onEdit, onDelete, onReveal, onCopy, onHide, onToggleNotes, onOpenUrl
}) {
  const colors = CATEGORY_COLORS[provider.category] || CATEGORY_COLORS.Other
  const hasPassword = provider.passwordEncrypted !== PLACEHOLDER_PASSWORD
  const isRevealed = !!revealedPassword

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Letter avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          background: colors.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: colors.text, flexShrink: 0
        }}>
          {getInitials(provider.name)}
        </div>

        {/* Name + badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text-primary)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {provider.name}
          </div>
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 600,
            padding: '2px 8px', borderRadius: 10,
            background: colors.bg, color: colors.text,
            letterSpacing: '0.4px', textTransform: 'uppercase'
          }}>
            {provider.category}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button className="btn btn-icon btn-ghost" onClick={onEdit} title="Edit provider">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5V9l7-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onDelete} title="Delete provider" style={{ color: '#f87171' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3.5h9M4 3.5V2h4v1.5M3.5 3.5l.5 6.5h4l.5-6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* Description */}
      {provider.description && (
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {provider.description}
        </p>
      )}

      {/* URL */}
      {provider.url && (
        <button onClick={onOpenUrl} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M3.5 2H2a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V7.5M7 1h3v3M4.5 6.5l5-5" stroke="var(--accent-primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ fontSize: 11.5, color: 'var(--accent-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {provider.url.replace(/^https?:\/\//, '')}
          </span>
        </button>
      )}

      {/* Username */}
      {provider.username && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 58 }}>Username</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{provider.username}</span>
        </div>
      )}

      {/* Password row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 7,
        background: isRevealed ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
        transition: 'background 0.2s ease'
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 58, flexShrink: 0 }}>Password</span>
        <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12.5, color: isRevealed ? 'var(--text-primary)' : 'var(--text-muted)', letterSpacing: isRevealed ? 'normal' : '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!hasPassword ? (
            <span style={{ fontFamily: 'inherit', letterSpacing: 'normal', fontSize: 11 }}>No password set</span>
          ) : isRevealed ? (
            <span>{revealedPassword}<span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>{countdown}s</span></span>
          ) : (
            '••••••••'
          )}
        </div>
        {hasPassword && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button className="btn btn-icon btn-ghost btn-sm" onClick={isRevealed ? onHide : onReveal} title={isRevealed ? 'Hide' : 'Reveal password'}>
              {isRevealed ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
            </button>
            <button className="btn btn-icon btn-ghost btn-sm" onClick={onCopy} title="Copy password">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4V2H1v7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Notes (collapsible) */}
      {provider.notes && (
        <div>
          <button onClick={onToggleNotes} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: notesExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <path d="M2.5 1.5l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Notes
          </button>
          <AnimatePresence>
            {notesExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {provider.notes}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function getInitials(name) {
  return (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function EyeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <ellipse cx="7" cy="7" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  )
}

function EyeOffIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M5.5 5.6a2 2 0 002.9 2.9M3 3.8C1.8 4.8 1 7 1 7s2.5 4.5 6 4.5c.9 0 1.8-.2 2.5-.6M6 2.1C6.3 2 6.6 2 7 2c3.5 0 6 5 6 5s-.5 1.1-1.4 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function PasswordStrength({ password }) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 16) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const levels = [
    { label: 'Very weak', color: '#ef4444' },
    { label: 'Weak',      color: '#f97316' },
    { label: 'Fair',      color: '#eab308' },
    { label: 'Good',      color: '#84cc16' },
    { label: 'Strong',    color: '#22c55e' },
    { label: 'Very strong', color: '#10b981' }
  ]
  const level = levels[Math.min(score, 5)]
  const bars = Math.max(1, Math.ceil((score / 6) * 4))

  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: 30, height: 3, borderRadius: 2, background: i <= bars ? level.color : 'var(--border-color)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: level.color, fontWeight: 500 }}>{level.label}</span>
    </div>
  )
}
