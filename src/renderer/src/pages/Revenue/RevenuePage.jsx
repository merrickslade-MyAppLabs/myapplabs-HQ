import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SkeletonList } from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
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
import RevenueForm from './RevenueForm'

const STATUS_STYLES = {
  invoiced: { bg: 'var(--warning-muted)', color: 'var(--warning)', label: 'Invoiced' },
  paid: { bg: 'var(--success-muted)', color: 'var(--success)', label: 'Paid' }
}

function formatCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '£0.00'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function StatCard({ label, value, color, icon }) {
  return (
    <div
      className="card"
      style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: color || 'var(--text-primary)', letterSpacing: '-0.5px' }}>
        {value}
      </div>
    </div>
  )
}

export default function RevenuePage() {
  const toast = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.REVENUE,
      (docs, err) => {
        if (err) setError('Failed to load revenue data.')
        else { setEntries(docs); setError(null) }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Filtered entries
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (dateFrom && e.date && e.date < dateFrom) return false
      if (dateTo && e.date && e.date > dateTo) return false
      return true
    })
  }, [entries, statusFilter, dateFrom, dateTo])

  // Aggregate stats across ALL entries (not just filtered)
  const stats = useMemo(() => {
    const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const paid = entries.filter((e) => e.status === 'paid').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const outstanding = entries.filter((e) => e.status === 'invoiced').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { total, paid, outstanding }
  }, [entries])

  function closeModal() {
    setModalOpen(false)
    setEditingEntry(null)
  }

  async function handleSave(formData) {
    setSaving(true)
    if (editingEntry) {
      const { error: err } = await updateRecord(TABLES.REVENUE, editingEntry.id, formData)
      if (err) toast('Failed to update entry.', 'error')
      else { toast('Entry updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.REVENUE, formData)
      if (err) toast('Failed to add entry.', 'error')
      else { toast('Entry added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.REVENUE, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete entry.', 'error')
    else toast('Entry deleted.', 'info')
  }

  if (error) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--danger)', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Connection Error</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="page-title">Revenue & Financials</div>
          <div className="page-subtitle">Track income, invoices and payments</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingEntry(null); setModalOpen(true) }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Log Income
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <StatCard
          label="Total Revenue"
          value={formatCurrency(stats.total)}
          color="var(--accent-primary)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2v14M5 5.5C5 4.1 6.8 3 9 3s4 1.1 4 2.5S11.2 8 9 8 5 9.1 5 10.5 6.8 13 9 13s4-1.1 4-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(stats.paid)}
          color="var(--success)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          color="var(--warning)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 5.5v4M9 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap'
        }}
      >
        {/* Status filter */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'invoiced', 'paid'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="btn btn-sm"
              style={{
                background: statusFilter === s ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: statusFilter === s ? 'var(--accent-primary)' : 'var(--border-color)',
                textTransform: 'capitalize'
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>From</span>
          <input
            type="date"
            className="input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>To</span>
          <input
            type="date"
            className="input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }}
          />
          {(dateFrom || dateTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 120px 120px 90px 80px',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            flexShrink: 0
          }}
        >
          {['Client', 'Project', 'Amount', 'Date', 'Status', ''].map((h) => (
            <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {h}
            </div>
          ))}
        </div>

        {/* Table Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '12px' }}><SkeletonList count={4} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v16M7 7c0-1.7 1.8-3 4-3s4 1.3 4 3-1.8 3-4 3-4 1.3-4 3 1.8 3 4 3 4-1.3 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              }
              title={statusFilter !== 'all' || dateFrom || dateTo ? 'No matching entries' : 'No income logged yet'}
              description={
                statusFilter !== 'all' || dateFrom || dateTo
                  ? 'Try adjusting your filters.'
                  : 'Log your first income entry to get started.'
              }
              action={
                statusFilter === 'all' && !dateFrom && !dateTo && (
                  <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
                    Log First Entry
                  </button>
                )
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((entry) => {
                const ss = STATUS_STYLES[entry.status] || STATUS_STYLES.invoiced
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 120px 120px 90px 80px',
                      gap: '8px',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.clientName || '—'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.projectName || '—'}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: entry.status === 'paid' ? 'var(--success)' : 'var(--text-primary)' }}>
                      {formatCurrency(Number(entry.amount))}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {entry.date ? new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </div>
                    <span className="badge" style={{ background: ss.bg, color: ss.color }}>
                      {ss.label}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditingEntry(entry); setModalOpen(true) }} title="Edit">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget(entry)} title="Delete" style={{ color: 'var(--danger)' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 3h8M4.5 3V2h3v1M4 4.5v4M8 4.5v4M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Table footer — row count */}
        {filtered.length > 0 && (
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border-color)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              flexShrink: 0
            }}
          >
            Showing {filtered.length} of {entries.length} entries
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingEntry ? 'Edit Income Entry' : 'Log Income'}
        size="md"
      >
        <RevenueForm
          initialData={editingEntry}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Entry"
        message="Are you sure you want to delete this income entry? This cannot be undone."
        confirmText="Delete Entry"
        loading={deleteLoading}
      />
    </div>
  )
}
