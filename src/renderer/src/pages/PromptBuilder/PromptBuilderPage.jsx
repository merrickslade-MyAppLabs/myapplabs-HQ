import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SkeletonList } from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import {
  subscribeToTable,
  addRecord,
  updateRecord,
  deleteRecord,
  TABLES
} from '../../supabase/database'

const FIELD_CONFIG = [
  { key: 'role', label: 'Role', placeholder: 'e.g. You are an expert iOS developer with 10+ years of experience', rows: 2, required: true },
  { key: 'goal', label: 'Goal', placeholder: 'e.g. Help me design a scalable REST API for a social media app', rows: 2, required: true },
  { key: 'context', label: 'Context', placeholder: 'e.g. The app uses React Native on the frontend, Node.js backend, and PostgreSQL database', rows: 3, required: false },
  { key: 'constraints', label: 'Constraints', placeholder: 'e.g. Keep responses concise. Use TypeScript. Follow REST best practices.', rows: 2, required: false },
  { key: 'outputFormat', label: 'Output Format', placeholder: 'e.g. Provide step-by-step instructions with code examples. Use markdown formatting.', rows: 2, required: false }
]

function buildPrompt(fields) {
  const parts = []

  if (fields.role?.trim()) {
    parts.push(`## Role\n${fields.role.trim()}`)
  }
  if (fields.goal?.trim()) {
    parts.push(`## Goal\n${fields.goal.trim()}`)
  }
  if (fields.context?.trim()) {
    parts.push(`## Context\n${fields.context.trim()}`)
  }
  if (fields.constraints?.trim()) {
    parts.push(`## Constraints\n${fields.constraints.trim()}`)
  }
  if (fields.outputFormat?.trim()) {
    parts.push(`## Output Format\n${fields.outputFormat.trim()}`)
  }

  return parts.join('\n\n')
}

const EMPTY_FORM = { role: '', goal: '', context: '', constraints: '', outputFormat: '', name: '' }

export default function PromptBuilderPage() {
  const toast = useToast()
  const [savedPrompts, setSavedPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null) // ID if editing a saved prompt
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)

  // Real-time subscription to saved prompts
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      TABLES.PROMPTS,
      (docs, err) => {
        if (!err) setSavedPrompts(docs)
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Build the assembled prompt from form fields
  const assembledPrompt = useMemo(() => buildPrompt(form), [form])

  function handleFieldChange(key, value) {
    setForm((p) => ({ ...p, [key]: value }))
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.role?.trim()) e.role = 'Role is required — it anchors the AI perspective.'
    if (!form.goal?.trim()) e.goal = 'Goal is required — it tells the AI what to do.'
    if (showSaveForm && !form.name?.trim()) e.name = 'Please give this prompt a name.'
    return e
  }

  async function handleCopy() {
    if (!assembledPrompt) return
    try {
      await navigator.clipboard.writeText(assembledPrompt)
      setCopied(true)
      toast('Prompt copied to clipboard!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Failed to copy. Please select and copy manually.', 'error')
    }
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); setShowSaveForm(true); return }

    setSaving(true)
    const data = {
      name: form.name.trim(),
      role: form.role.trim(),
      goal: form.goal.trim(),
      context: form.context.trim(),
      constraints: form.constraints.trim(),
      outputFormat: form.outputFormat.trim(),
      assembledPrompt: assembledPrompt
    }

    if (editingId) {
      const { error } = await updateRecord(TABLES.PROMPTS, editingId, data)
      if (error) toast('Failed to update prompt.', 'error')
      else {
        toast('Prompt updated.', 'success')
        resetForm()
      }
    } else {
      const { error } = await addRecord(TABLES.PROMPTS, data)
      if (error) toast('Failed to save prompt.', 'error')
      else {
        toast('Prompt saved.', 'success')
        resetForm()
      }
    }
    setSaving(false)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setErrors({})
    setEditingId(null)
    setShowSaveForm(false)
  }

  function loadPrompt(prompt) {
    setForm({
      role: prompt.role || '',
      goal: prompt.goal || '',
      context: prompt.context || '',
      constraints: prompt.constraints || '',
      outputFormat: prompt.outputFormat || '',
      name: prompt.name || ''
    })
    setEditingId(prompt.id)
    setShowSaveForm(true)
    setErrors({})
    toast(`Loaded: ${prompt.name}`, 'info')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { error } = await deleteRecord(TABLES.PROMPTS, deleteTarget.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    if (error) toast('Failed to delete prompt.', 'error')
    else {
      toast('Prompt deleted.', 'info')
      if (editingId === deleteTarget.id) resetForm()
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left — Builder */}
      <div
        style={{
          flex: '0 0 55%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="page-title">Prompt Builder</div>
              <div className="page-subtitle">Fill in the fields to build a structured AI prompt</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={resetForm} disabled={saving}>
              Clear All
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {FIELD_CONFIG.map((field) => (
            <div key={field.key} style={{ marginBottom: '16px' }}>
              <label className="label">
                {field.label}
                {field.required && <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>}
              </label>
              <textarea
                className="input textarea"
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                rows={field.rows}
                disabled={saving}
                style={{ resize: 'vertical', minHeight: `${field.rows * 24 + 20}px` }}
              />
              {errors[field.key] && (
                <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors[field.key]}</div>
              )}
            </div>
          ))}

          {/* Save section */}
          <div
            style={{
              marginTop: '8px',
              padding: '16px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)'
            }}
          >
            {!showSaveForm ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSaveForm(true)}
                disabled={saving}
                style={{ width: '100%' }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M11 9v2a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1h2M8 1h3v3M5.5 7.5l5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Save this prompt for reuse
              </button>
            ) : (
              <div>
                <label className="label">Prompt Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="input"
                    placeholder="e.g. iOS API Designer"
                    value={form.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    disabled={saving}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !assembledPrompt}>
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveForm(false)} disabled={saving}>
                    Cancel
                  </button>
                </div>
                {errors.name && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.name}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right — Preview + Saved */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Preview panel */}
        <div
          style={{
            flex: '0 0 auto',
            maxHeight: '50%',
            display: 'flex',
            flexDirection: 'column',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Assembled Prompt Preview
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCopy}
              disabled={!assembledPrompt}
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M8 4V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {assembledPrompt ? (
              <pre
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: '12px',
                  lineHeight: 1.7,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0
                }}
              >
                {assembledPrompt}
              </pre>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', paddingTop: '30px' }}>
                Fill in the fields on the left to see your assembled prompt here.
              </div>
            )}
          </div>
        </div>

        {/* Saved prompts */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Saved Prompts
              {savedPrompts.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({savedPrompts.length})
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {loading ? (
              <SkeletonList count={3} />
            ) : savedPrompts.length === 0 ? (
              <EmptyState
                title="No saved prompts"
                description="Save a prompt to quickly load and reuse it."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {savedPrompts.map((prompt) => (
                  <motion.div
                    key={prompt.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="card"
                    style={{
                      padding: '12px 14px',
                      borderLeft: editingId === prompt.id ? '3px solid var(--accent-primary)' : '3px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {prompt.name}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {prompt.role}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => loadPrompt(prompt)}
                          title="Load prompt"
                          style={{ fontSize: '11px' }}
                        >
                          Load
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setDeleteTarget(prompt)}
                          title="Delete"
                          style={{ color: 'var(--danger)' }}
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 2.5h7M4 2.5V1.5h3v1M3.5 4v4.5M7.5 4v4.5M2 2.5l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Saved Prompt"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete"
        loading={deleteLoading}
      />
    </div>
  )
}
