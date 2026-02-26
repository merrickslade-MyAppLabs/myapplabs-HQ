import { useState } from 'react'

const STATUS_OPTIONS = ['lead', 'active', 'completed']

/**
 * Form for adding or editing a client.
 * initialData is null for new clients, or the client object for edits.
 */
export default function ClientForm({ initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    status: initialData?.status || 'lead',
    notes: initialData?.notes || ''
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const newErrors = {}
    if (!form.name.trim()) newErrors.name = 'Client name is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email address.'
    }
    return newErrors
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const newErrors = validate()
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    onSave({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      notes: form.notes.trim()
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Name */}
      <div style={{ marginBottom: '16px' }}>
        <label className="label" htmlFor="client-name">
          Client Name <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          id="client-name"
          type="text"
          className="input"
          placeholder="e.g. Acme Corporation"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
      </div>

      {/* Email + Phone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label className="label" htmlFor="client-email">Contact Email</label>
          <input
            id="client-email"
            type="email"
            className="input"
            placeholder="contact@example.com"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            disabled={saving}
          />
          {errors.email && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.email}</div>}
        </div>
        <div>
          <label className="label" htmlFor="client-phone">Contact Phone</label>
          <input
            id="client-phone"
            type="tel"
            className="input"
            placeholder="+44 7700 000000"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      {/* Status */}
      <div style={{ marginBottom: '16px' }}>
        <label className="label" htmlFor="client-status">Status</label>
        <select
          id="client-status"
          className="input select"
          value={form.status}
          onChange={(e) => handleChange('status', e.target.value)}
          disabled={saving}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: '24px' }}>
        <label className="label" htmlFor="client-notes">Notes</label>
        <textarea
          id="client-notes"
          className="input textarea"
          placeholder="Any important notes about this client..."
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          disabled={saving}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Client'}
        </button>
      </div>
    </form>
  )
}
