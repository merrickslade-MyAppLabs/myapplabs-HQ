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
import ExpensesForm from './ExpensesForm'

const CATEGORY_STYLES = {
  Software:  { bg: 'var(--info-muted)',             color: 'var(--info)' },
  Hardware:  { bg: 'var(--warning-muted)',           color: 'var(--warning)' },
  Marketing: { bg: 'var(--accent-primary-muted)',    color: 'var(--accent-primary)' },
  Services:  { bg: 'var(--success-muted)',           color: 'var(--success)' },
  Office:    { bg: 'var(--bg-tertiary)',             color: 'var(--text-secondary)' },
  Other:     { bg: 'var(--bg-tertiary)',             color: 'var(--text-muted)' }
}

const FREQ_LABELS  = { 'one-off': 'One-off', monthly: 'Monthly', annual: 'Annual' }
const FREQ_STYLES  = {
  'one-off': { bg: 'var(--bg-tertiary)',   color: 'var(--text-muted)' },
  monthly:   { bg: 'var(--info-muted)',    color: 'var(--info)' },
  annual:    { bg: 'var(--warning-muted)', color: 'var(--warning)' }
}

const ALL_CATEGORIES = ['Software', 'Hardware', 'Marketing', 'Services', 'Office', 'Other']

function formatCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return '£0.00'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: color || 'var(--text-primary)', letterSpacing: '-0.5px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function ExpensesPage() {
  const toast = useToast()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [freqFilter, setFreqFilter] = useState('all')

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.EXPENSES,
      (docs, err) => {
        if (err) setError('Failed to load expenses.')
        else { setExpenses(docs); setError(null) }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Filtered list
  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (freqFilter !== 'all' && e.frequency !== freqFilter) return false
      return true
    })
  }, [expenses, categoryFilter, freqFilter])

  // Helper: convert an expense amount to GBP
  function toGbp(expense) {
    const amount = Number(expense.amount) || 0
    const rate   = Number(expense.exchangeRate) || 1
    if (!expense.currency || expense.currency === 'GBP') return amount
    return amount * rate
  }

  // Aggregate stats across ALL expenses (using GBP equivalents)
  const stats = useMemo(() => {
    const monthly = expenses
      .filter((e) => e.frequency === 'monthly')
      .reduce((s, e) => s + toGbp(e), 0)
    const annual = expenses
      .filter((e) => e.frequency === 'annual')
      .reduce((s, e) => s + toGbp(e), 0)
    const annualised = monthly * 12 + annual
    return { monthly, annual, annualised }
  }, [expenses])

  function closeModal() {
    setModalOpen(false)
    setEditingExpense(null)
  }

  async function handleSave(formData) {
    setSaving(true)
    if (editingExpense) {
      const { error: err } = await updateRecord(TABLES.EXPENSES, editingExpense.id, formData)
      if (err) toast('Failed to update expense.', 'error')
      else { toast('Expense updated.', 'success'); closeModal() }
    } else {
      const { error: err } = await addRecord(TABLES.EXPENSES, formData)
      if (err) toast('Failed to add expense.', 'error')
      else { toast('Expense added.', 'success'); closeModal() }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error: err } = await deleteRecord(TABLES.EXPENSES, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (err) toast('Failed to delete expense.', 'error')
    else toast('Expense deleted.', 'info')
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

  const hasFilters = categoryFilter !== 'all' || freqFilter !== 'all'

  return (
    <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="page-title">Expenses</div>
          <div className="page-subtitle">Track business costs and recurring subscriptions</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditingExpense(null); setModalOpen(true) }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add Expense
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <StatCard
          label="Monthly Recurring"
          value={formatCurrency(stats.monthly)}
          sub={`${formatCurrency(stats.monthly * 12)} / year`}
          color="var(--info)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 5.5V9l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Annual Recurring"
          value={formatCurrency(stats.annual)}
          sub={`${formatCurrency(stats.annual / 12)} / mo equiv.`}
          color="var(--warning)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 7h14M6 2v2M12 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
        <StatCard
          label="Annualised Total"
          value={formatCurrency(stats.annualised)}
          sub="Recurring costs only"
          color="var(--danger)"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 14l4-4 3 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {/* Frequency filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Frequency:</span>
          {['all', 'monthly', 'annual', 'one-off'].map((f) => (
            <button
              key={f}
              onClick={() => setFreqFilter(f)}
              className="btn btn-sm"
              style={{
                background: freqFilter === f ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: freqFilter === f ? '#fff' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: freqFilter === f ? 'var(--accent-primary)' : 'var(--border-color)',
                textTransform: 'capitalize'
              }}
            >
              {f === 'all' ? 'All' : FREQ_LABELS[f] || f}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Category:</span>
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: '150px', padding: '6px 10px', fontSize: '13px' }}
          >
            <option value="all">All categories</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
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
            gridTemplateColumns: '1.5fr 110px 110px 100px 110px 80px',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            flexShrink: 0
          }}
        >
          {['Name', 'Category', 'Amount', 'Frequency', 'Date', ''].map((h) => (
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
                  <rect x="2" y="2" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M6 8h10M6 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              }
              title={hasFilters ? 'No matching expenses' : 'No expenses yet'}
              description={
                hasFilters
                  ? 'Try adjusting your filters.'
                  : 'Add your first expense to track business costs.'
              }
              action={
                !hasFilters && (
                  <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
                    Add First Expense
                  </button>
                )
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((expense) => {
                const catStyle = CATEGORY_STYLES[expense.category] || CATEGORY_STYLES.Other
                const freqStyle = FREQ_STYLES[expense.frequency] || FREQ_STYLES['one-off']
                return (
                  <motion.div
                    key={expense.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 110px 110px 100px 110px 80px',
                      gap: '8px',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {expense.name}
                      </div>
                      {expense.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {expense.description}
                        </div>
                      )}
                    </div>
                    <span className="badge" style={{ background: catStyle.bg, color: catStyle.color, fontSize: '11px' }}>
                      {expense.category || '—'}
                    </span>
                    <div>
                      {expense.currency && expense.currency !== 'GBP' ? (
                        <>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {expense.currency} {Number(expense.amount).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatCurrency(toGbp(expense))}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {formatCurrency(Number(expense.amount))}
                        </div>
                      )}
                    </div>
                    <span className="badge" style={{ background: freqStyle.bg, color: freqStyle.color, fontSize: '11px' }}>
                      {FREQ_LABELS[expense.frequency] || '—'}
                    </span>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {expense.date
                        ? new Date(expense.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => { setEditingExpense(expense); setModalOpen(true) }}
                        title="Edit"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setDeleteTarget(expense)}
                        title="Delete"
                        style={{ color: 'var(--danger)' }}
                      >
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

        {/* Footer row count */}
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
            Showing {filtered.length} of {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'}
        size="md"
      >
        <ExpensesForm
          initialData={editingExpense}
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
        title="Delete Expense"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete Expense"
        loading={deleteLoading}
      />
    </div>
  )
}
