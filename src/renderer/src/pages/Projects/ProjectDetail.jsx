import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { addAuditLog } from '../../supabase/database'
import { useToast } from '../../components/ui/Toast'
import Modal from '../../components/ui/Modal'

// ── Constants (local copy — avoids circular dep with ProjectsPage) ─────────────

const STAGE_STATUS = [
  '', 'qualification', 'discovery', 'proposal',
  'kickoff', 'build', 'review', 'delivery', 'complete'
]

const STAGE_NAMES = [
  '', 'Lead Qualification', 'Discovery Call', 'Proposal & Contract',
  'Project Kickoff', 'Build Phase', 'Client Review', 'Final Delivery', 'Post-Delivery'
]

const STATUS_META = {
  qualification: { label: 'Lead Qualification', color: '#6c63ff', bg: 'rgba(108,99,255,0.12)' },
  discovery:     { label: 'Discovery Call',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  proposal:      { label: 'Proposal & Contract', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  kickoff:       { label: 'Project Kickoff',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  build:         { label: 'Build Phase',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  review:        { label: 'Client Review',       color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  delivery:      { label: 'Final Delivery',      color: '#ec4899', bg: 'rgba(236,72,153,0.12)'  },
  complete:      { label: 'Complete',            color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
}

const INVOICE_STATUS_META = {
  draft:     { label: 'Draft',     color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  sent:      { label: 'Sent',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  paid:      { label: 'Paid',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  overdue:   { label: 'Overdue',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  cancelled: { label: 'Cancelled', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
}

const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
const MAX_FILE_SIZE = 20 * 1024 * 1024

const TABS = ['Overview', 'Messages', 'Documents', 'Invoices', 'Notes', 'Audit']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000)
}


function fmtGBP(amount) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

// ── Shared mini-components ────────────────────────────────────────────────────

function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {m.label}
    </span>
  )
}

function InvoiceBadge({ status }) {
  const m = INVOICE_STATUS_META[status] || INVOICE_STATUS_META.draft
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {m.label}
    </span>
  )
}

function SectionHeading({ children }) {
  return (
    <h3 style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px 0'
    }}>
      {children}
    </h3>
  )
}

// ── Stage Tracker ─────────────────────────────────────────────────────────────

function StageTracker({ project, stages, onAdvanced }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [showConfirm, setShowConfirm] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const isComplete     = project.status === 'complete'
  const currentStageNum = project.current_stage || 1
  const nextStageNum    = currentStageNum + 1
  const isLastStage     = currentStageNum >= 8
  const nextStageName   = isLastStage ? 'Complete' : STAGE_NAMES[nextStageNum]

  async function doAdvance() {
    setAdvancing(true)
    try {
      // Mark current stage complete
      await supabase
        .from('project_stages')
        .update({ status: 'complete', completed_at: new Date().toISOString(), completed_by: user.id })
        .eq('project_id', project.id)
        .eq('stage_number', currentStageNum)

      if (!isLastStage) {
        await supabase
          .from('project_stages')
          .update({ status: 'current' })
          .eq('project_id', project.id)
          .eq('stage_number', nextStageNum)

        await supabase
          .from('projects')
          .update({ current_stage: nextStageNum, status: STAGE_STATUS[nextStageNum] })
          .eq('id', project.id)
      } else {
        await supabase
          .from('projects')
          .update({ status: 'complete' })
          .eq('id', project.id)
      }

      await addAuditLog({
        userId: user.id, action: 'stage_advanced',
        entityType: 'project', entityId: project.id,
        metadata: {
          from_stage: currentStageNum,
          from_stage_name: STAGE_NAMES[currentStageNum],
          to_stage: isLastStage ? 'complete' : nextStageNum,
          to_stage_name: nextStageName
        }
      })

      toast.success(isLastStage ? 'Project marked as complete!' : `Advanced to ${nextStageName}`)
      setShowConfirm(false)
      onAdvanced()
    } catch (err) {
      console.error('[StageTracker] advance error:', err)
      toast.error('Failed to advance stage. Please try again.')
    } finally {
      setAdvancing(false)
    }
  }

  function stageState(stageNum) {
    const obj = stages.find(s => s.stage_number === stageNum)
    if (obj) return obj.status
    if (isComplete) return 'complete'
    if (stageNum < currentStageNum) return 'complete'
    if (stageNum === currentStageNum) return 'current'
    return 'pending'
  }

  return (
    <div>
      {/* Visual progress */}
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 4 }}>
        {Array.from({ length: 8 }, (_, i) => {
          const stageNum = i + 1
          const state    = stageState(stageNum)
          const isComp   = state === 'complete'
          const isCurr   = state === 'current'
          const color    = STATUS_META[STAGE_STATUS[stageNum]]?.color || '#6c63ff'

          return (
            <div key={stageNum} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 64 }}>
                {/* Circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: (isComp || isCurr) ? color : 'var(--bg-tertiary)',
                  border: isCurr ? `2.5px solid ${color}` : isComp ? 'none' : '2px solid var(--border-color)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isCurr ? `0 0 0 4px ${color}22` : 'none',
                  transition: 'all 0.25s ease'
                }}>
                  {isComp ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : isCurr ? (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
                  ) : (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-color)' }} />
                  )}
                </div>
                {/* Label */}
                <div style={{
                  fontSize: 9, fontWeight: isCurr ? 700 : 500, textAlign: 'center', lineHeight: 1.3,
                  color: isCurr ? color : isComp ? 'var(--text-secondary)' : 'var(--text-muted)',
                  maxWidth: 60, wordBreak: 'break-word'
                }}>
                  {STAGE_NAMES[stageNum].split(' ').slice(0, 2).join(' ')}
                </div>
              </div>
              {/* Connector */}
              {stageNum < 8 && (
                <div style={{
                  flex: 1, height: 2, margin: '0 2px', marginBottom: 20, borderRadius: 1,
                  background: isComp ? color : 'var(--bg-tertiary)',
                  opacity: isComp ? 0.6 : 0.3, transition: 'background 0.3s ease'
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Advance button — hidden when complete */}
      {!isComplete && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowConfirm(true)} disabled={advancing}>
            {isLastStage ? 'Mark as Complete' : `Advance to ${nextStageName} →`}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Current stage:{' '}
            <strong style={{ color: 'var(--text-secondary)' }}>{STAGE_NAMES[currentStageNum]}</strong>
          </span>
        </div>
      )}

      {/* Confirmation modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => !advancing && setShowConfirm(false)}
        title="Advance Stage"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)} disabled={advancing}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={doAdvance} disabled={advancing}>
              {advancing ? 'Advancing…' : 'Confirm'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Advance this project from{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{STAGE_NAMES[currentStageNum]}</strong>
          {' '}to{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{nextStageName}</strong>?
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
          This action will be recorded in the audit log and cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

// ── Documents Panel ───────────────────────────────────────────────────────────

function DocumentsPanel({ projectId }) {
  const { user }  = useAuth()
  const { toast } = useToast()
  const [docs, setDocs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [downloadingId, setDLId]      = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingType, setPendingType] = useState('other')
  const fileRef = useRef(null)

  async function loadDocs() {
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, type, storage_path, uploaded_at, profiles!uploaded_by (full_name)')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })
    if (error) console.error('[Docs] load:', error)
    setDocs(data || [])
    setLoading(false)
  }

  useEffect(() => { loadDocs() }, [projectId])

  function handleFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error('Only PDF, PNG, JPEG, and DOCX files are allowed.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File must be under 20 MB.')
      return
    }

    // Stage the file and open the type-selection modal
    setPendingFile(file)
    setPendingType('other')
  }

  async function doUpload() {
    if (!pendingFile) return
    setUploading(true)
    try {
      const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${projectId}/${Date.now()}-${safeName}`

      const { error: stErr } = await supabase.storage
        .from('project-documents')
        .upload(path, pendingFile, { contentType: pendingFile.type })
      if (stErr) throw stErr

      const { error: dbErr } = await supabase.from('documents').insert({
        project_id:   projectId,
        name:         pendingFile.name,
        type:         pendingType,
        storage_path: path,
        uploaded_by:  user.id
      })
      if (dbErr) throw dbErr

      await addAuditLog({
        userId: user.id, action: 'document_uploaded',
        entityType: 'project', entityId: projectId,
        metadata: { file_name: pendingFile.name, document_type: pendingType }
      })

      toast.success('Document uploaded.')
      setPendingFile(null)
      loadDocs()
    } catch (err) {
      console.error('[Docs] upload:', err)
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(doc) {
    setDLId(doc.id)
    try {
      const { data, error } = await supabase.functions.invoke('get-signed-url', {
        body: { path: doc.storage_path }
      })
      if (error) throw error
      if (data?.signedUrl) {
        window.electronShell?.openExternal(data.signedUrl)
      } else {
        throw new Error('No signed URL returned')
      }
    } catch (err) {
      console.error('[Docs] download:', err)
      toast.error('Failed to generate download link.')
    } finally {
      setDLId(null)
    }
  }

  function typeIcon(type) {
    const icons = { proposal: '📋', contract: '📜', invoice: '🧾', handover: '📦', other: '📎' }
    return icons[type] || '📎'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionHeading>Documents</SectionHeading>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Upload document"
        >
          {uploading ? 'Uploading…' : '+ Upload'}
        </button>
        <input
          ref={fileRef} type="file"
          accept=".pdf,.png,.jpg,.jpeg,.docx"
          onChange={handleFileSelected}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={52} />)}
        </div>
      ) : docs.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No documents yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>PDF, PNG, JPEG, or DOCX — max 20 MB</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)'
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{typeIcon(doc.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {doc.type} · {fmtDate(doc.uploaded_at)} · {doc.profiles?.full_name || 'Unknown'}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc.id}
                aria-label={`Download ${doc.name}`}
              >
                {downloadingId === doc.id ? '…' : '↓ Download'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Document type selection modal */}
      <Modal
        isOpen={!!pendingFile}
        onClose={() => !uploading && setPendingFile(null)}
        title="Upload Document"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingFile(null)} disabled={uploading}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={doUpload} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              File
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-primary)', padding: '8px 12px',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {pendingFile?.name}
            </div>
          </div>
          <div>
            <label htmlFor="doc-type-select" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Document Type
            </label>
            <select
              id="doc-type-select"
              className="input"
              value={pendingType}
              onChange={e => setPendingType(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="proposal">Proposal</option>
              <option value="contract">Contract</option>
              <option value="invoice">Invoice</option>
              <option value="handover">Handover</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Invoices Panel ────────────────────────────────────────────────────────────

function InvoicesPanel({ projectId }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('invoices')
      .select('id, invoice_number, amount, status, due_date, paid_at, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Invoices] load:', error)
        setInvoices(data || [])
        setLoading(false)
      })
  }, [projectId])

  const outstanding = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + (i.amount || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionHeading>Invoices</SectionHeading>
        {outstanding > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
            Outstanding: {fmtGBP(outstanding)}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => <Skeleton key={i} width="100%" height={56} />)}
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No invoices yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Invoices for this project will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {invoices.map(inv => (
            <div key={inv.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {inv.invoice_number || `INV-${inv.id.slice(0, 8).toUpperCase()}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  Due: {fmtDate(inv.due_date)}
                  {inv.paid_at && ` · Paid: ${fmtDate(inv.paid_at)}`}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {fmtGBP(inv.amount)}
              </div>
              <InvoiceBadge status={inv.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Message Thread ────────────────────────────────────────────────────────────

function MessageThread({ projectId, isLocked }) {
  const { user }  = useAuth()
  const { toast } = useToast()
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [body, setBody]         = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef  = useRef(null)
  const channelRef = useRef(null)

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, sender_id, created_at, profiles!sender_id (id, full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (error) console.error('[Messages] load:', error)
    setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadMessages()
    const ch = supabase
      .channel(`msgs-${projectId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: `project_id=eq.${projectId}`
      }, loadMessages)
      .subscribe()
    channelRef.current = ch
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > 5000) return
    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({
        project_id: projectId,
        sender_id:  user.id,
        body:       trimmed
      })
      if (error) throw error
      setBody('')
    } catch (err) {
      console.error('[Messages] send:', err)
      toast.error('Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <Skeleton width={28} height={28} radius={14} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Skeleton width={90} height={10} />
                  <Skeleton width="75%" height={36} />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No messages yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Messages to or from the client will appear here.</div>
          </div>
        ) : (
          messages.map(msg => {
            const isOwn = msg.sender_id === user.id
            const name  = msg.profiles?.full_name || 'Unknown'
            return (
              <div key={msg.id} style={{
                display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row',
                gap: 8, alignItems: 'flex-end', padding: '0 2px'
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: isOwn ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  color: isOwn ? 'white' : 'var(--text-secondary)'
                }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div style={{
                  maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 3,
                  alignItems: isOwn ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {name} · {fmtDateTime(msg.created_at)}
                  </div>
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: isOwn ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isOwn ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isOwn ? 'white' : 'var(--text-primary)',
                    fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                  }}>
                    {msg.body}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input or locked notice */}
      {isLocked ? (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-tertiary)', marginTop: 12, fontSize: 12,
          color: 'var(--text-muted)', textAlign: 'center'
        }} role="status">
          This project is complete — the message thread is read-only.
        </div>
      ) : (
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <textarea
            className="input"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) }
            }}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            maxLength={5000}
            rows={2}
            style={{ flex: 1, resize: 'none', fontSize: 13 }}
            aria-label="Message input"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={sending || !body.trim()}
            style={{ alignSelf: 'flex-end' }}
            aria-label="Send message"
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Project Notes ─────────────────────────────────────────────────────────────

function ProjectNotes({ projectId, initialNotes }) {
  const [notes, setNotes]         = useState(initialNotes || '')
  const [saveStatus, setSaveStatus] = useState(null)
  const debounceRef = useRef(null)

  // Reset when switching projects
  useEffect(() => {
    setNotes(initialNotes || '')
    setSaveStatus(null)
  }, [projectId])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  function handleChange(value) {
    setNotes(value)
    setSaveStatus('saving')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('projects')
          .update({ notes: value || null })
          .eq('id', projectId)
        if (error) throw error
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(null), 2000)
      } catch (err) {
        console.error('[Notes] save:', err)
        setSaveStatus('error')
      }
    }, 800)
  }

  const saveColor = saveStatus === 'saved' ? '#22c55e'
    : saveStatus === 'error' ? '#ef4444'
    : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHeading>Notes</SectionHeading>
        {saveStatus && (
          <span style={{ fontSize: 11, color: saveColor }}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
          </span>
        )}
      </div>
      <textarea
        className="input"
        value={notes}
        onChange={e => handleChange(e.target.value)}
        placeholder="Internal notes for this project…"
        aria-label="Project notes"
        style={{ flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.7, minHeight: 300 }}
      />
    </div>
  )
}

// ── Audit History Panel ───────────────────────────────────────────────────────

function AuditHistoryPanel({ projectId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('id, action, metadata, created_at, profiles!user_id (full_name)')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Audit] load:', error)
        setEntries(data || [])
        setLoading(false)
      })
  }, [projectId])

  function humanise(action) {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function detail(metadata) {
    if (!metadata) return null
    const parts = []
    if (metadata.from_stage_name) {
      parts.push(`${metadata.from_stage_name} → ${metadata.to_stage_name || 'Complete'}`)
    }
    if (metadata.file_name) parts.push(metadata.file_name)
    return parts.join(', ') || null
  }

  return (
    <div>
      <SectionHeading>Audit History</SectionHeading>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={44} />)}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No audit entries</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Actions on this project will be recorded here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {entries.map(entry => (
            <div key={entry.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              borderLeft: '2px solid var(--border-color)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {humanise(entry.action)}
                </div>
                {detail(entry.metadata) && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                    {detail(entry.metadata)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {entry.profiles?.full_name || 'System'} · {fmtDateTime(entry.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ProjectDetail (main export) ───────────────────────────────────────────────

export default function ProjectDetail({ projectId, onBack }) {
  const [project, setProject] = useState(null)
  const [stages, setStages]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('Overview')

  async function loadProject() {
    try {
      const [{ data: proj, error: pErr }, { data: stgs, error: sErr }] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            id, title, description, status, current_stage,
            target_delivery_date, notes, created_at,
            profiles!client_id (id, full_name, email)
          `)
          .eq('id', projectId)
          .single(),
        supabase
          .from('project_stages')
          .select('id, stage_number, status, completed_at')
          .eq('project_id', projectId)
          .order('stage_number')
      ])
      if (pErr) throw pErr
      if (sErr) throw sErr
      setProject(proj)
      setStages(stgs || [])
      setError(null)
    } catch (err) {
      console.error('[ProjectDetail] load:', err)
      setError('Unable to load project details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setProject(null)
    setStages([])
    setActiveTab('Overview')
    loadProject()
  }, [projectId])

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton width={80} height={26} />
          <Skeleton width={240} height={22} />
          <Skeleton width={100} height={20} radius={99} />
        </div>
        <Skeleton width="100%" height={96} />
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => <Skeleton key={t} width={80} height={32} />)}
        </div>
        <Skeleton width="100%" height={300} />
        <style>{`.sk-pulse{animation:skP 1.6s ease-in-out infinite}@keyframes skP{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !project) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {error || 'Project not found'}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 16 }}>
          ← Back to Projects
        </button>
      </div>
    )
  }

  const isComplete = project.status === 'complete'
  const days       = daysUntil(project.target_delivery_date)
  const isOverdue  = days !== null && days < 0 && !isComplete

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Back + header */}
      <div style={{ marginBottom: 16 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onBack}
          style={{ fontSize: 12, padding: '4px 8px', marginBottom: 10 }}
          aria-label="Back to projects list"
        >
          ← Projects
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {project.title}
              </h2>
              <StatusBadge status={project.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {project.profiles?.full_name || '—'}
              {project.profiles?.email && ` · ${project.profiles.email}`}
              {project.target_delivery_date && (
                <span style={{ marginLeft: 12, color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                  · Target: {fmtDate(project.target_delivery_date)}
                  {!isComplete && days !== null && (
                    <strong style={{ marginLeft: 6 }}>
                      ({isOverdue
                        ? `${Math.abs(days)}d overdue`
                        : days === 0 ? 'Due today'
                        : `${days}d remaining`})
                    </strong>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Complete banner */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 'var(--radius-md)',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            marginBottom: 16
          }}
          role="status"
          aria-label="Project complete"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="#22c55e"/>
            <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
            Project complete — the stage tracker is locked.
          </span>
        </motion.div>
      )}

      {/* Tab bar */}
      <div
        style={{
          display: 'flex', gap: 2, borderBottom: '1px solid var(--border-color)',
          marginBottom: 20, overflowX: 'auto', flexShrink: 0
        }}
        role="tablist"
        aria-label="Project sections"
      >
        {TABS.map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 14px', fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-secondary)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-primary)' : 'transparent'}`,
              marginBottom: -1, whiteSpace: 'nowrap', transition: 'all 0.15s ease'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }} role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%' }}
          >

            {activeTab === 'Overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card" style={{ padding: 20 }}>
                  <SectionHeading>Stage Progress</SectionHeading>
                  <StageTracker project={project} stages={stages} onAdvanced={loadProject} />
                </div>
                {project.description && (
                  <div className="card" style={{ padding: 20 }}>
                    <SectionHeading>Description</SectionHeading>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                      {project.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Messages' && (
              <div className="card" style={{ padding: 20, height: '100%', minHeight: 480 }}>
                <MessageThread projectId={projectId} isLocked={isComplete} />
              </div>
            )}

            {activeTab === 'Documents' && (
              <div className="card" style={{ padding: 20 }}>
                <DocumentsPanel projectId={projectId} />
              </div>
            )}

            {activeTab === 'Invoices' && (
              <div className="card" style={{ padding: 20 }}>
                <InvoicesPanel projectId={projectId} />
              </div>
            )}

            {activeTab === 'Notes' && (
              <div className="card" style={{ padding: 20, height: '100%', minHeight: 400 }}>
                <ProjectNotes projectId={projectId} initialNotes={project.notes} />
              </div>
            )}

            {activeTab === 'Audit' && (
              <div className="card" style={{ padding: 20 }}>
                <AuditHistoryPanel projectId={projectId} />
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      <style>{`
        .sk-pulse { animation: skP 1.6s ease-in-out infinite; }
        @keyframes skP { 0%,100%{opacity:.9} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}
