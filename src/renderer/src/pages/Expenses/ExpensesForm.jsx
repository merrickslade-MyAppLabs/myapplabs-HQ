import { useState, useEffect } from 'react'

const CATEGORIES = ['Software', 'Hardware', 'Marketing', 'Services', 'Office', 'Other']

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual',  label: 'Annual' },
  { value: 'one-off', label: 'One-off' }
]

const CURRENCIES = [
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound' },
  { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar' },
  { code: 'CAD', symbol: 'C$', label: 'CAD — Canadian Dollar' },
  { code: 'CHF', symbol: 'Fr', label: 'CHF — Swiss Franc' },
  { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD — New Zealand Dollar' },
  { code: 'SEK', symbol: 'kr', label: 'SEK — Swedish Krona' },
  { code: 'NOK', symbol: 'kr', label: 'NOK — Norwegian Krone' },
]

function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol || code
}

async function fetchExchangeRate(fromCurrency, date) {
  // Use the first of the month to get a consistent monthly rate
  const d = date ? new Date(date + 'T12:00:00') : new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = '01'
  const dateStr = `${yyyy}-${mm}-${dd}`
  try {
    const res = await fetch(`https://api.frankfurter.app/${dateStr}?from=${fromCurrency}&to=GBP`)
    if (!res.ok) return null
    const json = await res.json()
    return json.rates?.GBP ?? null
  } catch {
    return null
  }
}

export default function ExpensesForm({ initialData, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:         initialData?.name         || '',
    description:  initialData?.description  || '',
    category:     initialData?.category     || 'Software',
    amount:       initialData?.amount != null ? String(initialData.amount) : '',
    frequency:    initialData?.frequency    || 'monthly',
    date:         initialData?.date         || '',
    notes:        initialData?.notes        || '',
    currency:     initialData?.currency     || 'GBP',
    exchangeRate: initialData?.exchangeRate != null ? String(initialData.exchangeRate) : '1'
  })
  const [errors, setErrors]         = useState({})
  const [fetchingRate, setFetchingRate] = useState(false)
  const [rateLabel, setRateLabel]   = useState(null)

  // Auto-fetch rate when currency or date changes (non-GBP only)
  useEffect(() => {
    if (form.currency === 'GBP') {
      setForm(p => ({ ...p, exchangeRate: '1' }))
      setRateLabel(null)
      return
    }
    let cancelled = false
    async function doFetch() {
      setFetchingRate(true)
      const rate = await fetchExchangeRate(form.currency, form.date)
      if (cancelled) return
      if (rate != null) {
        setForm(p => ({ ...p, exchangeRate: String(rate) }))
        const d = form.date ? new Date(form.date + 'T12:00:00') : new Date()
        const monthYear = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        setRateLabel(`Rate for ${monthYear} (1 ${form.currency} = ${rate.toFixed(4)} GBP)`)
      } else {
        setRateLabel('Could not fetch rate — enter manually')
      }
      setFetchingRate(false)
    }
    doFetch()
    return () => { cancelled = true }
  }, [form.currency, form.date])

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) < 0) {
      e.amount = 'Enter a valid amount.'
    }
    if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0) {
      e.exchangeRate = 'Enter a valid exchange rate.'
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
      name:         form.name.trim(),
      description:  form.description.trim(),
      category:     form.category,
      amount:       Number(form.amount),
      frequency:    form.frequency,
      date:         form.date || null,
      notes:        form.notes.trim(),
      currency:     form.currency,
      exchangeRate: Number(form.exchangeRate)
    })
  }

  const symbol    = getCurrencySymbol(form.currency)
  const rate      = Number(form.exchangeRate) || 1
  const amtNum    = Number(form.amount) || 0
  const gbpAmount = form.currency === 'GBP' ? amtNum : amtNum * rate

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input"
          placeholder="e.g. Claude Subscription"
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
          <label className="label">Currency</label>
          <select className="input select" value={form.currency} onChange={(e) => handleChange('currency', e.target.value)} disabled={saving}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
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

      <div style={{ display: 'grid', gridTemplateColumns: form.currency !== 'GBP' ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label className="label">Amount ({symbol}) <span style={{ color: 'var(--danger)' }}>*</span></label>
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

        {form.currency !== 'GBP' && (
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Exchange Rate to £
              {fetchingRate && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ animation: 'expSpin 0.7s linear infinite', color: 'var(--text-muted)' }}>
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 6" strokeLinecap="round"/>
                </svg>
              )}
            </label>
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              className="input"
              placeholder="e.g. 0.7890"
              value={form.exchangeRate}
              onChange={(e) => handleChange('exchangeRate', e.target.value)}
              disabled={saving || fetchingRate}
            />
            {errors.exchangeRate && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{errors.exchangeRate}</div>}
            {rateLabel && !errors.exchangeRate && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{rateLabel}</div>
            )}
          </div>
        )}
      </div>

      {/* GBP equivalent preview */}
      {form.currency !== 'GBP' && amtNum > 0 && rate > 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-tertiary)', marginBottom: '14px',
          fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6 4v4M5 5.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          GBP equivalent: <strong style={{ color: 'var(--text-primary)' }}>
            £{gbpAmount.toFixed(2)}
          </strong>
          &nbsp;per {form.frequency === 'annual' ? 'year' : form.frequency === 'monthly' ? 'month' : 'payment'}
        </div>
      )}

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
        <button type="submit" className="btn btn-primary" disabled={saving || fetchingRate}>
          {saving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Expense'}
        </button>
      </div>

      <style>{`
        @keyframes expSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  )
}
