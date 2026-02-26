import { useState } from 'react'

const COLUMN_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'inprogress', label: 'In Progress' },
  { value: 'done', label: 'Done' }
]

const PRIORITY_OPTIONS = ['low', 'medium', 'high']

export default function TaskForm({ initialData, defaultColumn = 'todo', onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    column: initialData?.column || defaultColumn,
    priority: initialData?.priority || 'medium',
    assignedTo: initialData?.assignedTo || '',
    dueDate: initialData?.dueDate || ''
  })
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.title.trim()) e.title = 'Task title is required.'
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
      title: form.title.trim(),
      description: form.description.trim(),
      column: form.column,
      priority: form.priority,
      assignedTo: form.assignedTo.trim(),
      dueDate: form.dueDate
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Task Title <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="e.g. Design landing page mockup"
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          autoFocus
          disabled={saving}
        />
        {errors.title && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.title}</div>}
      </div>

      {/* Description */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Description</label>
        <textarea
          className="input textarea"
          placeholder="Add more detail about this task..."
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={3}
          disabled={saving}
        />
      </div>

      {/* Column + Priority */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Column</label>
          <select
            className="input select"
            value={form.column}
            onChange={(e) => handleChange('column', e.target.value)}
            disabled={saving}
          >
            {COLUMN_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select
            className="input select"
            value={form.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            disabled={saving}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p} style={{ textTransform: 'capitalize' }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assigned To + Due Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <div>
          <label className="label">Assigned To</label>
          <input
            className="input"
            placeholder="e.g. Alex"
            value={form.assignedTo}
            onChange={(e) => handleChange('assignedTo', e.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <label className="label">Due Date</label>
          <input
            type="date"
            className="input"
            value={form.dueDate}
            onChange={(e) => handleChange('dueDate', e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Task'}
        </button>
      </div>
    </form>
  )
}
