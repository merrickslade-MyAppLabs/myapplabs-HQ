import { useState } from 'react'

export default function RevenueForm({ initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    clientName: initialData?.clientName || '',
    projectName: initialData?.projectName || '',
    amount: initialData?.amount?.toString() || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'invoiced',
    notes: initialData?.notes || ''
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.clientName.trim()) e.clientName = 'Client name is required.'
    if (!form.amount) {
      e.amount = 'Amount is required.'
    } else if (isNaN(Number(form.amount)) || Number(form.amount) < 0) {
      e.amount = 'Please enter a valid positive amount.'
    }
    if (!form.date) e.date = 'Date is required.'
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
      clientName: form.clientName.trim(),
      projectName: form.projectName.trim(),
      amount: parseFloat(form.amount),
      date: form.date,
      status: form.status,
      notes: form.notes.trim()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Client + Project */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Client Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input className="input" placeholder="e.g. Acme Corp" value={form.clientName} onChange={(e) => handleChange('clientName', e.target.value)} autoFocus disabled={saving} />
          {errors.clientName && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.clientName}</div>}
        </div>
        <div>
          <label className="label">Project Name</label>
          <input className="input" placeholder="e.g. Website Redesign" value={form.projectName} onChange={(e) => handleChange('projectName', e.target.value)} disabled={saving} />
        </div>
      </div>

      {/* Amount + Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Amount (£) <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            disabled={saving}
          />
          {errors.amount && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.amount}</div>}
        </div>
        <div>
          <label className="label">Date <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input type="date" className="input" value={form.date} onChange={(e) => handleChange('date', e.target.value)} disabled={saving} />
          {errors.date && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.date}</div>}
        </div>
      </div>

      {/* Status */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Status</label>
        <select className="input select" value={form.status} onChange={(e) => handleChange('status', e.target.value)} disabled={saving}>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: '24px' }}>
        <label className="label">Notes</label>
        <textarea className="input textarea" placeholder="Any additional notes..." value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} rows={2} disabled={saving} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Log Income'}
        </button>
      </div>
    </form>
  )
}
