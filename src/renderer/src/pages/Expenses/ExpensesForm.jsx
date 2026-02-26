import { useState } from 'react'

const CATEGORIES = ['Software', 'Hardware', 'Marketing', 'Services', 'Office', 'Other']

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual',  label: 'Annual' },
  { value: 'one-off', label: 'One-off' }
]

export default function ExpensesForm({ initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:        initialData?.name        || '',
    description: initialData?.description || '',
    category:    initialData?.category    || 'Software',
    amount:      initialData?.amount != null ? String(initialData.amount) : '',
    frequency:   initialData?.frequency   || 'monthly',
    date:        initialData?.date        || '',
    notes:       initialData?.notes       || ''
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) < 0) {
      e.amount = 'Enter a valid amount.'
    }
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
      name:        form.name.trim(),
      description: form.description.trim(),
      category:    form.category,
      amount:      Number(form.amount),
      frequency:   form.frequency,
      date:        form.date || null,
      notes:       form.notes.trim()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="e.g. Apple Developer Account"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <input
          className="input"
          placeholder="Optional description"
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          disabled={saving}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Category</label>
          <select className="input select" value={form.category} onChange={(e) => handleChange('category', e.target.value)} disabled={saving}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Frequency</label>
          <select className="input select" value={form.frequency} onChange={(e) => handleChange('frequency', e.target.value)} disabled={saving}>
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Amount (£) <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            disabled={saving}
          />
          {errors.amount && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.amount}</div>}
        </div>
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => handleChange('date', e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label className="label">Notes</label>
        <textarea
          className="input textarea"
          placeholder="Optional notes..."
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={2}
          disabled={saving}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Expense'}
        </button>
      </div>
    </form>
  )
}
