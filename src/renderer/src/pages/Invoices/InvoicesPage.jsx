import { useState, useEffect, useMemo, useRef, Component } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { jsPDF } from 'jspdf'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase/client'
import { addAuditLog } from '../../supabase/database'
import { useToast } from '../../components/ui/Toast'
import Modal from '../../components/ui/Modal'
import { loadBusinessInfo } from '../../config/businessInfo'

// ── Error boundary ────────────────────────────────────────────────────────────
class InvoicesErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[Invoices] Render error:', err) }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 24 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>
          Something went wrong
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => this.setState({ hasError: false })} style={{ marginTop: 16 }}>
          Try again
        </button>
      </div>
    )
    return this.props.children
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtGBP(amount) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000)
}

function slugify(str) {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPE_META = {
  deposit:        { label: 'Deposit',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  final:          { label: 'Final',          color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  change_request: { label: 'Change Request', color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
}

const STATUS_META = {
  draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  sent:  { label: 'Sent',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  paid:  { label: 'Paid',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ width, height, radius = 6, style = {} }) {
  return (
    <div className="inv-sk-pulse" style={{
      width, height, borderRadius: radius,
      background: 'var(--bg-tertiary)', flexShrink: 0, ...style
    }} />
  )
}

// ── Badges ────────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const m = TYPE_META[type] || { label: type, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ invoices }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const outstanding = invoices
    .filter(i => i.status === 'sent')
    .reduce((s, i) => s + Number(i.amount), 0)

  const paidThisMonth = invoices
    .filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= monthStart)
    .reduce((s, i) => s + Number(i.amount), 0)

  const overdueCount = invoices.filter(i =>
    i.status !== 'paid' && i.due_date && daysUntil(i.due_date) < 0
  ).length

  const cards = [
    {
      label: 'Outstanding',
      value: fmtGBP(outstanding),
      color: outstanding > 0 ? '#f59e0b' : '#22c55e',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 2v14M5 6c0-1.1 1.8-2 4-2s4 .9 4 2-1.8 2-4 2-4 .9-4 2 1.8 2 4 2 4-.9 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      label: 'Paid This Month',
      value: fmtGBP(paidThisMonth),
      color: '#22c55e',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      label: 'Overdue',
      value: overdueCount.toString(),
      color: overdueCount > 0 ? '#ef4444' : 'var(--text-muted)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9 5v5M9 12v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
      {cards.map(card => (
        <div key={card.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ color: card.color, flexShrink: 0 }}>{card.icon}</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: card.color, marginTop: 2 }}>
              {card.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
// businessInfo is always passed as a parameter — never read from constants directly here.
function generateInvoicePDF(invoice, project, client, businessInfo) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const margin = 20
  const contentW = pageW - margin * 2
  let y = margin

  // ── Colours
  const navy  = [11, 31, 58]
  const grey  = [100, 116, 139]
  const light = [241, 245, 249]
  const green = [34, 197, 94]
  const black = [15, 23, 42]

  function setFont(size, weight = 'normal', color = black) {
    doc.setFontSize(size)
    doc.setFont('helvetica', weight)
    doc.setTextColor(...color)
  }

  function line(x1, y1, x2, y2, color = light) {
    doc.setDrawColor(...color)
    doc.line(x1, y1, x2, y2)
  }

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageW, 42, 'F')

  // Company name
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(businessInfo.name, margin, 18)

  // "INVOICE" label top-right
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('INVOICE', pageW - margin, 18, { align: 'right' })

  // Reference below label
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 200, 220)
  doc.text(invoice.reference, pageW - margin, 26, { align: 'right' })

  // Registered address in header (small)
  const addr = businessInfo.registeredAddress
  const addrLine = [addr.line1, addr.line2, addr.city, addr.postcode]
    .filter(Boolean).join(', ')
  if (addrLine) {
    doc.setFontSize(8)
    doc.setTextColor(160, 185, 210)
    doc.text(addrLine, margin, 28)
  }
  if (businessInfo.email) {
    doc.setFontSize(8)
    doc.text(businessInfo.email, margin, 34)
  }
  if (businessInfo.website) {
    doc.text(businessInfo.website, margin + 55, 34)
  }

  y = 54

  // ── Invoice meta + client details (two-column) ────────────────────────────
  const leftX  = margin
  const rightX = pageW / 2 + 4

  // Left: Invoice details
  setFont(8, 'bold', grey)
  doc.text('INVOICE DETAILS', leftX, y)
  y += 5

  const metaRows = [
    ['Reference',  invoice.reference],
    ['Type',       TYPE_META[invoice.type]?.label || invoice.type],
    ['Date',       fmtDate(invoice.created_at)],
    ['Due Date',   fmtDate(invoice.due_date)],
    ...(invoice.paid_at ? [['Paid On', fmtDate(invoice.paid_at)]] : []),
    ['Project',    project?.title || '—'],
  ]

  metaRows.forEach(([label, value]) => {
    setFont(8, 'normal', grey)
    doc.text(label + ':', leftX, y)
    setFont(8, 'bold', black)
    doc.text(String(value || '—'), leftX + 28, y)
    y += 5
  })

  // Right: Bill to
  const rightStartY = 59
  setFont(8, 'bold', grey)
  doc.text('BILL TO', rightX, rightStartY)

  let clientY = rightStartY + 5
  const clientLines = [
    client?.full_name || '—',
    client?.email     || '',
    ...(client?.address ? [client.address] : []),
  ].filter(Boolean)

  clientLines.forEach(txt => {
    setFont(9, clientLines.indexOf(txt) === 0 ? 'bold' : 'normal', black)
    doc.text(txt, rightX, clientY)
    clientY += 5
  })

  y = Math.max(y, clientY) + 10

  // ── Divider ───────────────────────────────────────────────────────────────
  line(margin, y, pageW - margin, y, [226, 232, 240])
  y += 8

  // ── Amount table ──────────────────────────────────────────────────────────
  // Header row
  doc.setFillColor(...light)
  doc.rect(margin, y - 4, contentW, 10, 'F')

  setFont(8, 'bold', grey)
  doc.text('DESCRIPTION', leftX + 2, y + 2)
  doc.text('AMOUNT', pageW - margin - 2, y + 2, { align: 'right' })
  y += 10

  // Line item
  const description = `${TYPE_META[invoice.type]?.label || invoice.type} — ${project?.title || 'Project'}`
  setFont(10, 'normal', black)
  doc.text(description, leftX + 2, y + 4)
  setFont(10, 'bold', black)
  doc.text(fmtGBP(invoice.amount), pageW - margin - 2, y + 4, { align: 'right' })
  y += 12

  // Total row
  line(margin, y, pageW - margin, y, [226, 232, 240])
  y += 6

  setFont(11, 'bold', navy)
  doc.text('TOTAL DUE', pageW - margin - 42, y)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(invoice.status === 'paid' ? green : navy))
  doc.text(fmtGBP(invoice.amount), pageW - margin - 2, y, { align: 'right' })

  if (invoice.status === 'paid') {
    y += 6
    setFont(9, 'bold', green)
    doc.text('✓ PAID', pageW - margin - 2, y, { align: 'right' })
  }

  y += 14

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    line(margin, y, pageW - margin, y, [226, 232, 240])
    y += 8
    setFont(8, 'bold', grey)
    doc.text('NOTES', leftX, y)
    y += 5
    setFont(9, 'normal', black)
    const noteLines = doc.splitTextToSize(invoice.notes, contentW)
    noteLines.forEach(l => { doc.text(l, leftX, y); y += 5 })
    y += 4
  }

  // ── Bank details ──────────────────────────────────────────────────────────
  if (invoice.status !== 'paid' && (businessInfo.bankDetails?.accountNumber)) {
    line(margin, y, pageW - margin, y, [226, 232, 240])
    y += 8
    setFont(8, 'bold', grey)
    doc.text('PAYMENT DETAILS', leftX, y)
    y += 5
    const bd = businessInfo.bankDetails
    const bankRows = [
      ['Account Name',   bd.accountName],
      ['Sort Code',      bd.sortCode],
      ['Account Number', bd.accountNumber],
    ].filter(r => r[1])
    bankRows.forEach(([label, value]) => {
      setFont(8, 'normal', grey)
      doc.text(label + ':', leftX, y)
      setFont(8, 'bold', black)
      doc.text(value, leftX + 36, y)
      y += 5
    })
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 280
  line(margin, footerY, pageW - margin, footerY, [226, 232, 240])

  setFont(7.5, 'normal', grey)
  const footerParts = [
    businessInfo.name,
    businessInfo.companiesHouseNumber ? `Companies House: ${businessInfo.companiesHouseNumber}` : null,
    `ICO: ${businessInfo.icoNumber}`,
    businessInfo.vatNumber ? `VAT: ${businessInfo.vatNumber}` : null,
    businessInfo.registeredAddress?.country || null,
  ].filter(Boolean)

  doc.text(footerParts.join('  ·  '), pageW / 2, footerY + 5, { align: 'center' })

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`${invoice.reference}.pdf`)
}

// ── New / Edit invoice modal ──────────────────────────────────────────────────
const EMPTY_FORM = {
  projectId: '', clientId: '', reference: '',
  amount: '', type: 'deposit', dueDate: '', notes: ''
}

function InvoiceModal({ isOpen, onClose, onSaved, initial, userId }) {
  const { toast } = useToast()
  const [projects, setProjects] = useState([])
  const [form, setForm]         = useState(EMPTY_FORM)
  const [errors, setErrors]     = useState({})
  const [submitting, setSubmitting] = useState(false)
  const isEdit = !!initial?.id

  // Load projects for dropdown
  useEffect(() => {
    if (!isOpen) return
    supabase
      .from('projects')
      .select('id, title, client_id, profiles!client_id (id, full_name)')
      .neq('status', 'complete')
      .order('title')
      .then(({ data }) => setProjects(data || []))

    if (initial) {
      setForm({
        projectId: initial.project_id || '',
        clientId:  initial.client_id  || '',
        reference: initial.reference  || '',
        amount:    initial.amount != null ? String(initial.amount) : '',
        type:      initial.type        || 'deposit',
        dueDate:   initial.due_date    || '',
        notes:     initial.notes       || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [isOpen, initial])

  // Auto-suggest reference when project + type changes
  useEffect(() => {
    if (isEdit || !form.projectId || !form.type) return
    const proj = projects.find(p => p.id === form.projectId)
    if (!proj) return
    const clientSlug = slugify(proj.profiles?.full_name || '')
    const projSlug   = slugify(proj.title)
    const typeMap    = { deposit: 'DEP', final: 'FIN', change_request: 'CR' }
    setForm(f => ({ ...f, clientId: proj.client_id, reference: `${clientSlug}-${projSlug}-${typeMap[f.type]}` }))
  }, [form.projectId, form.type, projects, isEdit])

  function validate() {
    const e = {}
    if (!form.projectId)         e.projectId  = 'Project is required.'
    if (!form.reference.trim())  e.reference  = 'Reference is required.'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
                                  e.amount    = 'Enter a valid amount greater than 0.'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)

    const payload = {
      project_id: form.projectId,
      client_id:  form.clientId,
      reference:  form.reference.trim(),
      amount:     Number(form.amount),
      type:       form.type,
      due_date:   form.dueDate || null,
      notes:      form.notes.trim() || null,
    }

    try {
      if (isEdit) {
        const { data, error } = await supabase.from('invoices')
          .update(payload).eq('id', initial.id)
          .select('*, profiles!client_id (id, full_name, email), projects!project_id (id, title)')
          .single()
        if (error) throw error
        toast.success('Invoice updated.')
        onSaved(data, 'edit')
      } else {
        const { data, error } = await supabase.from('invoices')
          .insert(payload)
          .select('*, profiles!client_id (id, full_name, email), projects!project_id (id, title)')
          .single()
        if (error) throw error

        await addAuditLog({
          userId, action: 'invoice_status_changed',
          entityType: 'invoice', entityId: data.id,
          metadata: { reference: data.reference, status: 'draft', event: 'created' }
        })
        toast.success('Invoice created.')
        onSaved(data, 'add')
      }
      onClose()
    } catch (err) {
      console.error('[Invoices] save:', err)
      toast.error('Failed to save invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  function f(label, key, input) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label htmlFor={`inv-${key}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </label>
        {input}
        {errors[key] && <span style={{ fontSize: 11, color: '#ef4444' }}>{errors[key]}</span>}
      </div>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Invoice' : 'New Invoice'} size="md"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        {f('Project *', 'projectId',
          <select id="inv-projectId" className="input" value={form.projectId}
            onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}
            aria-required="true" aria-invalid={!!errors.projectId}>
            <option value="">Select a project…</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}{p.profiles?.full_name ? ` — ${p.profiles.full_name}` : ''}
              </option>
            ))}
          </select>
        )}
        {f('Type *', 'type',
          <select id="inv-type" className="input" value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            <option value="deposit">Deposit</option>
            <option value="final">Final</option>
            <option value="change_request">Change Request</option>
          </select>
        )}
        {f('Reference *', 'reference',
          <input id="inv-reference" className="input" type="text" value={form.reference}
            onChange={e => setForm(p => ({ ...p, reference: e.target.value }))}
            placeholder="e.g. ACME-WEBSITE-DEP"
            aria-required="true" aria-invalid={!!errors.reference}
          />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {f('Amount (£) *', 'amount',
            <input id="inv-amount" className="input" type="number" min="0.01" step="0.01"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
              aria-required="true" aria-invalid={!!errors.amount}
            />
          )}
          {f('Due Date', 'dueDate',
            <input id="inv-dueDate" className="input" type="date" value={form.dueDate}
              onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
            />
          )}
        </div>
        {f('Notes', 'notes',
          <textarea id="inv-notes" className="input" rows={3} value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Payment terms, VAT note, or any other details…"
            style={{ resize: 'vertical' }}
          />
        )}
      </form>
    </Modal>
  )
}

// ── Mark as Paid modal ────────────────────────────────────────────────────────
function MarkPaidModal({ isOpen, invoice, onClose, onPaid, userId }) {
  const { toast }  = useToast()
  const [paidAt, setPaidAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) setPaidAt(new Date().toISOString().slice(0, 10))
  }, [isOpen])

  async function handleConfirm() {
    setSaving(true)
    try {
      const paidAtISO = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString()
      const { error } = await supabase.from('invoices')
        .update({ status: 'paid', paid_at: paidAtISO })
        .eq('id', invoice.id)
      if (error) throw error

      await addAuditLog({
        userId, action: 'invoice_status_changed',
        entityType: 'invoice', entityId: invoice.id,
        metadata: { reference: invoice.reference, from: 'sent', to: 'paid', paid_at: paidAtISO }
      })

      toast.success(`Invoice ${invoice.reference} marked as paid.`)
      onPaid(invoice.id, paidAtISO)
      onClose()
    } catch (err) {
      console.error('[Invoices] mark paid:', err)
      toast.error('Failed to update invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark as Paid" size="sm"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm Payment'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Mark <strong style={{ color: 'var(--text-primary)' }}>{invoice?.reference}</strong> ({fmtGBP(invoice?.amount)}) as paid.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label htmlFor="paid-date" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Payment Received Date
          </label>
          <input id="paid-date" className="input" type="date" value={paidAt}
            onChange={e => setPaidAt(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

// ── Invoice table row ─────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onEdit, onMarkSent, onMarkPaid, onExportPDF }) {
  const days = daysUntil(invoice.due_date)
  const isOverdue = invoice.status !== 'paid' && days !== null && days < 0

  return (
    <tr className="inv-row-hover">
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
          {invoice.reference}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
          {fmtDate(invoice.created_at)}
        </div>
      </td>
      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
        {invoice.profiles?.full_name || '—'}
      </td>
      <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 180 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {invoice.projects?.title || '—'}
        </div>
      </td>
      <td style={{ padding: '12px 14px' }}>
        <TypeBadge type={invoice.type} />
      </td>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {fmtGBP(invoice.amount)}
        </div>
      </td>
      <td style={{ padding: '12px 14px' }}>
        <StatusBadge status={invoice.status} />
      </td>
      <td style={{ padding: '12px 14px', fontSize: 11, whiteSpace: 'nowrap' }}>
        {invoice.status === 'paid' ? (
          <span style={{ color: '#22c55e', fontWeight: 600 }}>Paid {fmtDate(invoice.paid_at)}</span>
        ) : (
          <span style={{ color: isOverdue ? '#ef4444' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
            {days === null ? '—' : days === 0 ? 'Due today' : isOverdue ? `${Math.abs(days)}d overdue` : `${days}d`}
          </span>
        )}
      </td>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Status advancement */}
          {invoice.status === 'draft' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onMarkSent(invoice)}
              style={{ fontSize: 10, padding: '3px 8px' }} title="Mark as Sent">
              → Sent
            </button>
          )}
          {invoice.status === 'sent' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onMarkPaid(invoice)}
              style={{ fontSize: 10, padding: '3px 8px', color: '#22c55e' }} title="Mark as Paid">
              ✓ Paid
            </button>
          )}
          {/* Edit */}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(invoice)}
            aria-label={`Edit invoice ${invoice.reference}`} title="Edit">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M8 2l2 2-6 6H2V8L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* PDF */}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onExportPDF(invoice)}
            aria-label={`Export PDF: ${invoice.reference}`} title="Export PDF">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="2" y="1" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 5h4M4 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main page content ─────────────────────────────────────────────────────────
function InvoicesContent() {
  const { user }  = useAuth()
  const { toast } = useToast()

  const [invoices, setInvoices]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [filterStatus, setFilter]   = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [paidTarget, setPaidTarget] = useState(null)
  const [exporting, setExporting]   = useState(null)

  async function load() {
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*, profiles!client_id (id, full_name, email), projects!project_id (id, title)')
        .order('created_at', { ascending: false })
      if (err) throw err
      setInvoices(data || [])
      setError(null)
    } catch (err) {
      console.error('[Invoices] load:', err)
      setError('Unable to load invoices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Unique clients from loaded invoices for client filter
  const clientOptions = useMemo(() => {
    const map = {}
    invoices.forEach(i => {
      if (i.profiles?.id) map[i.profiles.id] = i.profiles.full_name
    })
    return Object.entries(map).sort((a, b) => a[1]?.localeCompare(b[1]))
  }, [invoices])

  const filtered = useMemo(() => invoices.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (filterClient !== 'all' && i.client_id !== filterClient) return false
    return true
  }), [invoices, filterStatus, filterClient])

  // ── Mutations ─────────────────────────────────────────────────────────────
  function handleSaved(invoice, mode) {
    if (mode === 'add')  setInvoices(p => [invoice, ...p])
    else                 setInvoices(p => p.map(i => i.id === invoice.id ? invoice : i))
  }

  async function handleMarkSent(invoice) {
    try {
      const { error } = await supabase.from('invoices')
        .update({ status: 'sent' }).eq('id', invoice.id)
      if (error) throw error

      await addAuditLog({
        userId: user.id, action: 'invoice_status_changed',
        entityType: 'invoice', entityId: invoice.id,
        metadata: { reference: invoice.reference, from: 'draft', to: 'sent' }
      })

      setInvoices(p => p.map(i => i.id === invoice.id ? { ...i, status: 'sent' } : i))
      toast.success(`Invoice ${invoice.reference} marked as sent.`)
    } catch (err) {
      console.error('[Invoices] mark sent:', err)
      toast.error('Failed to update invoice.')
    }
  }

  function handlePaid(invoiceId, paidAt) {
    setInvoices(p => p.map(i => i.id === invoiceId ? { ...i, status: 'paid', paid_at: paidAt } : i))
  }

  async function handleExportPDF(invoice) {
    setExporting(invoice.id)
    try {
      const businessInfo = await loadBusinessInfo()
      generateInvoicePDF(invoice, invoice.projects, invoice.profiles, businessInfo)

      await addAuditLog({
        userId: user.id, action: 'document_downloaded',
        entityType: 'invoice', entityId: invoice.id,
        metadata: { reference: invoice.reference, format: 'pdf' }
      })
    } catch (err) {
      console.error('[Invoices] PDF export:', err)
      toast.error('Failed to generate PDF.')
    } finally {
      setExporting(null)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={72} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} width="100%" height={52} />)}
        </div>
        <style>{`.inv-sk-pulse{animation:invSk 1.6s ease-in-out infinite}@keyframes invSk{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{error}</div>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginTop: 16 }}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Summary cards */}
      <SummaryCards invoices={invoices} />

      {/* Filters + actions bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={filterStatus} onChange={e => setFilter(e.target.value)}
          style={{ width: 130, height: 34, fontSize: 13 }} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
        </select>
        <select className="input" value={filterClient} onChange={e => setFilterClient(e.target.value)}
          style={{ width: 180, height: 34, fontSize: 13 }} aria-label="Filter by client">
          <option value="all">All clients</option>
          {clientOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditTarget(null); setShowModal(true) }}>
            + New Invoice
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🧾</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {invoices.length === 0 ? 'No invoices yet' : 'No invoices match your filters'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {invoices.length === 0 ? 'Create your first invoice above.' : 'Try adjusting your filters.'}
            </div>
            {invoices.length === 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => { setEditTarget(null); setShowModal(true) }} style={{ marginTop: 16 }}>
                + New Invoice
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Invoices">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['Reference', 'Client', 'Project', 'Type', 'Amount', 'Status', 'Due / Paid', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px',
                      background: 'var(--bg-secondary)', position: 'sticky', top: 0, whiteSpace: 'nowrap'
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(invoice => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    onEdit={inv => { setEditTarget(inv); setShowModal(true) }}
                    onMarkSent={handleMarkSent}
                    onMarkPaid={inv => setPaidTarget(inv)}
                    onExportPDF={handleExportPDF}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <InvoiceModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        initial={editTarget}
        userId={user.id}
      />
      <MarkPaidModal
        isOpen={!!paidTarget}
        invoice={paidTarget}
        onClose={() => setPaidTarget(null)}
        onPaid={handlePaid}
        userId={user.id}
      />

      <style>{`
        .inv-sk-pulse { animation: invSk 1.6s ease-in-out infinite; }
        @keyframes invSk { 0%,100%{opacity:.9} 50%{opacity:.4} }
        .inv-row-hover:hover td { background: var(--bg-tertiary); }
      `}</style>
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <InvoicesErrorBoundary>
      <InvoicesContent />
    </InvoicesErrorBoundary>
  )
}
