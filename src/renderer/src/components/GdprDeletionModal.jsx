import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function RoleBadge({ role }) {
  const cfg = role === 'super_admin'
    ? { label: 'Super Admin', bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }
    : role === 'admin'
    ? { label: 'Admin',       bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' }
    : { label: 'Client',      bg: 'rgba(16,185,129,0.15)', color: '#10b981' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600
    }}>
      {cfg.label}
    </span>
  )
}

// ── Step indicators ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }) {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700,
      background: done ? '#10b981' : active ? '#ef4444' : 'var(--bg-tertiary)',
      color: done || active ? '#fff' : 'var(--text-muted)',
      border: `2px solid ${done ? '#10b981' : active ? '#ef4444' : 'var(--border-color)'}`,
      transition: 'all 0.2s'
    }}>
      {done
        ? <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l2.5 2.5 5.5-5.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : n
      }
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * GDPR data deletion tool — super_admin only.
 *
 * Steps:
 *  1. Search client by email
 *  2. Preview all data linked to that client
 *  3. Type client email to confirm
 *  4. Execute deletion via Edge Function gdpr-delete-client (Part 5)
 */
export default function GdprDeletionModal({ isOpen, onClose }) {
  const { user } = useAuth()

  // step: 'search' | 'preview' | 'confirm' | 'done' | 'error'
  const [step,          setStep]          = useState('search')
  const [emailInput,    setEmailInput]    = useState('')
  const [searchError,   setSearchError]   = useState('')
  const [searching,     setSearching]     = useState(false)
  const [clientProfile, setClientProfile] = useState(null)  // profiles row
  const [preview,       setPreview]       = useState(null)  // counts object
  const [confirmEmail,  setConfirmEmail]  = useState('')
  const [deleting,      setDeleting]      = useState(false)
  const [deleteError,   setDeleteError]   = useState('')

  function reset() {
    setStep('search'); setEmailInput(''); setSearchError(''); setSearching(false)
    setClientProfile(null); setPreview(null); setConfirmEmail(''); setDeleting(false)
    setDeleteError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Step 1: search ──────────────────────────────────────────────

  async function handleSearch(e) {
    e.preventDefault()
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    setSearching(true)
    setSearchError('')

    // Find client profile by email
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at, last_seen')
      .eq('email', email)
      .eq('role', 'client')
      .maybeSingle()

    if (profileErr) {
      setSearchError('Database error. Please try again.')
      setSearching(false)
      return
    }
    if (!profile) {
      setSearchError('No client account found with that email address.')
      setSearching(false)
      return
    }

    // Fetch counts of all linked data
    const [projectsRes, messagesRes, documentsRes, invoicesRes, settingsRes] = await Promise.all([
      supabase.from('projects').select('id, name', { count: 'exact' }).eq('client_id', profile.id),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', profile.id),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('uploaded_by', profile.id),
      supabase.from('invoices').select('id', { count: 'exact', head: true })
        .in('project_id',
          (await supabase.from('projects').select('id').eq('client_id', profile.id)).data?.map(p => p.id) || []
        ),
      supabase.from('client_portal_settings').select('id', { count: 'exact', head: true }).eq('client_id', profile.id),
    ])

    const projectIds = (projectsRes.data || []).map(p => p.id)

    // Count project_stages for those projects
    const stagesRes = projectIds.length
      ? await supabase.from('project_stages').select('id', { count: 'exact', head: true }).in('project_id', projectIds)
      : { count: 0 }

    // Count all messages in their projects (not just sent by them)
    const threadMessagesRes = projectIds.length
      ? await supabase.from('messages').select('id', { count: 'exact', head: true }).in('project_id', projectIds)
      : { count: 0 }

    // Count all documents in their projects
    const projectDocsRes = projectIds.length
      ? await supabase.from('documents').select('id', { count: 'exact', head: true }).in('project_id', projectIds)
      : { count: 0 }

    const invCount = projectIds.length
      ? (invoicesRes.count ?? 0)
      : 0

    setClientProfile(profile)
    setPreview({
      projects:           projectsRes.count      ?? 0,
      projectNames:       (projectsRes.data || []).map(p => p.name),
      projectStages:      stagesRes.count        ?? 0,
      messages:           threadMessagesRes.count ?? 0,
      documents:          projectDocsRes.count    ?? 0,
      invoices:           invCount,
      portalSettings:     settingsRes.count       ?? 0,
    })
    setSearching(false)
    setStep('preview')
  }

  // ── Step 3: execute deletion ────────────────────────────────────

  async function handleDelete() {
    if (confirmEmail.trim().toLowerCase() !== clientProfile.email.toLowerCase()) return
    setDeleting(true)
    setDeleteError('')

    // gdpr-delete-client handles the full deletion sequence with service_role:
    //   step 1:  audit gdpr_deletion_initiated  (written FIRST inside the function)
    //   steps 2–10: data + auth user deletion
    //   step 11: audit gdpr_deletion_completed  (written LAST inside the function)
    // audit_log rows are never touched except for those two inserts.
    const { data: fnData, error: fnError } = await supabase.functions.invoke('gdpr-delete-client', {
      body: { client_id: clientProfile.id },
    })

    if (fnError || !fnData?.success) {
      const step = fnData?.step ? ` (failed at step ${fnData.step})` : ''
      const msg  = fnData?.error ?? fnError?.message ?? 'Unknown error'
      setDeleteError(`Deletion failed${step}: ${msg}`)
      setDeleting(false)
      return
    }

    if (fnData?.warning) {
      // All data deleted but the completion audit log entry failed — show a
      // warning in the done screen so the super_admin can record it manually.
      setDeleteError(`Warning: ${fnData.warning}`)
    }

    setDeleting(false)
    setStep('done')
  }

  if (!isOpen) return null

  const emailMatch = confirmEmail.trim().toLowerCase() === clientProfile?.email?.toLowerCase()
  const stepN = step === 'search' ? 1 : step === 'preview' ? 2 : step === 'confirm' ? 3 : 3

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 640,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-modal)',
          borderRadius: 14, border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.06)', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="#ef4444" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M8 6v3.5M8 11.5h.01" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                GDPR Data Deletion
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Permanently removes all client data — this cannot be undone
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        {step !== 'done' && (
          <div style={{
            padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0
          }}>
            <StepDot n={1} active={step === 'search'} done={stepN > 1} />
            <span style={{ fontSize: 12, color: stepN === 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: stepN === 1 ? 600 : 400 }}>Search</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <StepDot n={2} active={step === 'preview'} done={stepN > 2} />
            <span style={{ fontSize: 12, color: stepN === 2 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: stepN === 2 ? 600 : 400 }}>Preview</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <StepDot n={3} active={step === 'confirm'} done={step === 'done'} />
            <span style={{ fontSize: 12, color: stepN === 3 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: stepN === 3 ? 600 : 400 }}>Confirm</span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* ── Step 1: Search ── */}
          {step === 'search' && (
            <form onSubmit={handleSearch}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                Enter the client's registered email address to find their account and preview all associated data before deletion.
              </p>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Client Email Address
              </label>
              <input
                type="email"
                className="input"
                placeholder="client@example.com"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setSearchError('') }}
                autoFocus
                style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
              />
              {searchError && (
                <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
                  {searchError}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!emailInput.trim() || searching}
                style={{ width: '100%' }}
              >
                {searching ? 'Searching…' : 'Find Client'}
              </button>
            </form>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 'preview' && clientProfile && preview && (
            <div>
              {/* Client identity */}
              <div style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, background: 'var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0
                  }}>
                    {(clientProfile.full_name || clientProfile.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {clientProfile.full_name || '(No name)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{clientProfile.email}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <RoleBadge role={clientProfile.role} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Account created {fmtDate(clientProfile.created_at)} · Last seen {fmtDate(clientProfile.last_seen)}
                </div>
              </div>

              {/* Data preview */}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                Data that will be permanently deleted:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {[
                  { label: 'Projects',         count: preview.projects,       warn: preview.projects > 0 },
                  { label: 'Project stages',    count: preview.projectStages,  warn: false },
                  { label: 'Messages',          count: preview.messages,       warn: false },
                  { label: 'Documents',         count: preview.documents,      warn: preview.documents > 0 },
                  { label: 'Invoices',          count: preview.invoices,       warn: preview.invoices > 0 },
                  { label: 'Portal settings',   count: preview.portalSettings, warn: false },
                  { label: 'Client profile',    count: 1,                      warn: true },
                  { label: 'Auth account',      count: 1,                      warn: true },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 7,
                    background: row.warn && row.count > 0 ? 'rgba(239,68,68,0.05)' : 'var(--bg-secondary)',
                    border: `1px solid ${row.warn && row.count > 0 ? 'rgba(239,68,68,0.15)' : 'var(--border-subtle)'}`
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: row.warn && row.count > 0 ? '#ef4444' : 'var(--text-primary)'
                    }}>
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>

              {/* Project names preview */}
              {preview.projectNames.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Projects to be deleted:
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                    {preview.projectNames.map(n => (
                      <li key={n} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                fontSize: 12, color: '#f59e0b', lineHeight: 1.5, marginBottom: 20
              }}>
                <strong>Note:</strong> Audit log entries for this client are retained permanently as required by law. All other data is irreversibly deleted.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStep('search')} style={{ flex: 1 }}>
                  Back
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => setStep('confirm')}
                  style={{ flex: 1 }}
                >
                  Continue to Confirmation
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 'confirm' && clientProfile && (
            <div>
              <div style={{
                padding: '12px 16px', borderRadius: 8, marginBottom: 20,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 13, color: '#ef4444', lineHeight: 1.5
              }}>
                <strong>Final warning.</strong> This action permanently deletes all data for <strong>{clientProfile.email}</strong> and cannot be undone. Type the client's full email address below to confirm.
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Type <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>{clientProfile.email}</code> to confirm
              </label>
              <input
                type="text"
                className="input"
                placeholder={clientProfile.email}
                value={confirmEmail}
                onChange={e => { setConfirmEmail(e.target.value); setDeleteError('') }}
                autoFocus
                style={{
                  width: '100%', marginBottom: 12, boxSizing: 'border-box',
                  borderColor: confirmEmail && !emailMatch ? '#ef4444' : undefined
                }}
              />

              {deleteError && (
                <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.5 }}>
                  {deleteError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStep('preview')} disabled={deleting} style={{ flex: 1 }}>
                  Back
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={!emailMatch || deleting}
                  style={{ flex: 1 }}
                >
                  {deleting ? 'Deleting…' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(16,185,129,0.12)', border: '2px solid #10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L19 7" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Deletion complete
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                All data for <strong>{clientProfile?.email}</strong> has been permanently deleted.
                Audit log entries have been preserved as required by law.
              </div>
              <button className="btn btn-secondary" onClick={handleClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
