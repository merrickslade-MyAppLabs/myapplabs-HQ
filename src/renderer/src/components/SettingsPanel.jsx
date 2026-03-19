import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme, THEME_LABELS, THEME_DESCRIPTIONS, THEME_SWATCHES } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { supabase } from '../supabase/client'
import ProfileModal from './ProfileModal'
import GdprDeletionModal from './GdprDeletionModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function RoleBadge({ role }) {
  const cfg = role === 'super_admin'
    ? { label: 'Super Admin', bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }
    : { label: 'Admin', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.3px', whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
      color: 'var(--text-muted)', marginBottom: 12
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600,
        color: 'var(--text-muted)', marginBottom: 4
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Business Info form ────────────────────────────────────────────────────────

function BusinessInfoSection({ userId }) {
  const toast = useToast()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saved' | 'error'
  const [form, setForm] = useState({
    companyName:           '',
    companiesHouseNumber:  '',
    icoNumber:             'ZC104281',
    addressLine1:          '',
    addressLine2:          '',
    addressCity:           '',
    addressPostcode:       '',
    addressCountry:        'England & Wales',
    contactEmail:          '',
    website:               '',
  })

  useEffect(() => {
    supabase.from('app_settings').select('*').single().then(({ data }) => {
      if (data) {
        setForm({
          companyName:          data.company_name           || '',
          companiesHouseNumber: data.companies_house_number || '',
          icoNumber:            data.ico_number             || 'ZC104281',
          addressLine1:         data.address_line1          || '',
          addressLine2:         data.address_line2          || '',
          addressCity:          data.address_city           || '',
          addressPostcode:      data.address_postcode       || '',
          addressCountry:       data.address_country        || 'England & Wales',
          contactEmail:         data.contact_email          || '',
          website:              data.website                || '',
        })
      }
      setLoading(false)
    })
  }, [])

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setSaveStatus('')
  }

  async function handleSave() {
    setSaving(true)
    setSaveStatus('')
    const { error } = await supabase.from('app_settings').upsert({
      id:                     1,
      company_name:           form.companyName           || null,
      companies_house_number: form.companiesHouseNumber  || null,
      ico_number:             form.icoNumber             || 'ZC104281',
      address_line1:          form.addressLine1          || null,
      address_line2:          form.addressLine2          || null,
      address_city:           form.addressCity           || null,
      address_postcode:       form.addressPostcode       || null,
      address_country:        form.addressCountry        || 'England & Wales',
      contact_email:          form.contactEmail          || null,
      website:                form.website               || null,
      updated_at:             new Date().toISOString(),
      updated_by:             userId,
    }, { onConflict: 'id' })

    setSaving(false)
    if (error) {
      setSaveStatus('error')
      toast('Failed to save business info.', 'error')
    } else {
      setSaveStatus('saved')
      toast('Business info saved.', 'success')
    }
  }

  const inputStyle = {
    width: '100%', padding: '6px 10px', boxSizing: 'border-box',
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 12.5, outline: 'none', fontFamily: 'inherit'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[80, 120, 80, 100, 80].map((w, i) => (
          <div key={i} style={{ height: 32, borderRadius: 6, background: 'var(--bg-tertiary)', width: '100%', opacity: 0.7 }} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <FieldRow label="Company Name">
        <input className="input" style={inputStyle} value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="MyAppLabs Ltd" />
      </FieldRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <FieldRow label="Companies House No.">
          <input className="input" style={inputStyle} value={form.companiesHouseNumber} onChange={e => set('companiesHouseNumber', e.target.value)} placeholder="12345678" />
        </FieldRow>
        <FieldRow label="ICO Number">
          <input className="input" style={inputStyle} value={form.icoNumber} onChange={e => set('icoNumber', e.target.value)} placeholder="ZC104281" />
        </FieldRow>
      </div>
      <FieldRow label="Registered Address — Line 1">
        <input className="input" style={inputStyle} value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} placeholder="123 Example Street" />
      </FieldRow>
      <FieldRow label="Line 2 (optional)">
        <input className="input" style={inputStyle} value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} placeholder="Suite / Floor" />
      </FieldRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FieldRow label="City">
          <input className="input" style={inputStyle} value={form.addressCity} onChange={e => set('addressCity', e.target.value)} placeholder="London" />
        </FieldRow>
        <FieldRow label="Postcode">
          <input className="input" style={inputStyle} value={form.addressPostcode} onChange={e => set('addressPostcode', e.target.value)} placeholder="SW1A 1AA" />
        </FieldRow>
      </div>
      <FieldRow label="Country">
        <input className="input" style={inputStyle} value={form.addressCountry} onChange={e => set('addressCountry', e.target.value)} placeholder="England & Wales" />
      </FieldRow>
      <FieldRow label="Contact Email">
        <input className="input" style={inputStyle} type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="hello@myapplabs.co.uk" />
      </FieldRow>
      <FieldRow label="Website">
        <input className="input" style={inputStyle} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://myapplabs.co.uk" />
      </FieldRow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
          style={{ flex: 1 }}
        >
          {saving ? 'Saving…' : 'Save Business Info'}
        </button>
        {saveStatus === 'saved' && (
          <span style={{ fontSize: 12, color: '#10b981', flexShrink: 0 }}>✓ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 12, color: '#ef4444', flexShrink: 0 }}>✗ Error</span>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        These values appear on invoice PDFs. Changes take effect immediately on the next PDF generated.
      </p>
    </div>
  )
}

// ── Team & Roles section ──────────────────────────────────────────────────────

function TeamSection() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role, last_seen')
      .in('role', ['admin', 'super_admin'])
      .order('role', { ascending: true })
      .then(({ data }) => {
        setMembers(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ height: 52, borderRadius: 8, background: 'var(--bg-tertiary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map(m => (
        <div key={m.id} style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: m.role === 'super_admin' ? '#8b5cf6' : '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff'
            }}>
              {(m.full_name || m.email)[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.full_name || m.email}
              </div>
            </div>
            <RoleBadge role={m.role} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 36 }}>
            Last login: {fmtDate(m.last_seen)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Settings Panel ───────────────────────────────────────────────────────

export default function SettingsPanel({ isOpen, onClose }) {
  const { theme, setTheme, THEMES } = useTheme()
  const { user, logout } = useAuth()
  const toast = useToast()
  const [profileOpen,   setProfileOpen]   = useState(false)
  const [gdprOpen,      setGdprOpen]      = useState(false)
  const [userRole,      setUserRole]      = useState(null)  // fetched on open

  const avatarUrl   = user?.user_metadata?.avatar_url || null
  const displayName = user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
  const isSuperAdmin = userRole === 'super_admin'
  const isAdmin      = userRole === 'admin' || isSuperAdmin

  // Fetch role when panel opens
  useEffect(() => {
    if (!isOpen || !user) return
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserRole(data?.role || null))
  }, [isOpen, user])

  async function handleLogout() {
    await logout()
    toast('Signed out successfully.', 'info')
    onClose()
  }

  async function handleThemeChange(newTheme) {
    await setTheme(newTheme)
    toast(`Theme changed to ${THEME_LABELS[newTheme]}.`, 'success')
  }

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500 }}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            style={{
              position: 'fixed', top: 0, right: 0,
              height: '100vh', width: '340px',
              background: 'var(--bg-modal)',
              borderLeft: '1px solid var(--border-color)',
              zIndex: 501,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            {/* Panel Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Settings
              </h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close settings">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

              {/* ── Signed In As ── */}
              <section style={{ marginBottom: '28px' }}>
                <SectionLabel>Signed In As</SectionLabel>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px', background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)'
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: avatarUrl ? 'transparent' : 'var(--accent-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '15px', fontWeight: 700, color: '#fff', flexShrink: 0,
                    textTransform: 'uppercase', overflow: 'hidden'
                  }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (displayName?.[0] || '?')
                    }
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {displayName || 'User'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email}
                    </div>
                  </div>
                  {userRole && (
                    <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <RoleBadge role={userRole} />
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setProfileOpen(true)}
                  style={{ width: '100%', marginTop: '10px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1.5 12.5c0-2.21 2.462-4 5.5-4s5.5 1.79 5.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  Edit Profile
                </button>
              </section>

              {/* ── Roles & Team (super_admin only) ── */}
              {isSuperAdmin && (
                <section style={{ marginBottom: '28px' }}>
                  <SectionLabel>Roles & Team</SectionLabel>
                  <TeamSection />
                </section>
              )}

              {/* ── Business Info (admin + super_admin) ── */}
              {isAdmin && (
                <section style={{ marginBottom: '28px' }}>
                  <SectionLabel>Business Info</SectionLabel>
                  <BusinessInfoSection userId={user?.id} />
                </section>
              )}

              {/* ── GDPR Data Deletion (super_admin only) ── */}
              {isSuperAdmin && (
                <section style={{ marginBottom: '28px' }}>
                  <SectionLabel>GDPR & Data Deletion</SectionLabel>
                  <div style={{
                    padding: '12px 14px', borderRadius: 8, marginBottom: 12,
                    background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5
                  }}>
                    Search for a client by email, preview all associated records, and permanently delete their data in compliance with GDPR Article 17. All deletions are logged to the audit trail. Audit records themselves are never deleted.
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => setGdprOpen(true)}
                    style={{
                      width: '100%', background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444',
                      fontWeight: 600
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3h10M5.5 3V2h3v1M5 4.5v5M9 4.5v5M2.5 3l.5 8h8l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Open GDPR Deletion Tool
                  </button>
                </section>
              )}

              {/* ── Appearance ── */}
              <section style={{ marginBottom: '28px' }}>
                <SectionLabel>Appearance</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(THEME_LABELS).map(([key, label]) => {
                    const swatch = THEME_SWATCHES[key]
                    const isActive = theme === key
                    return (
                      <button
                        key={key}
                        onClick={() => handleThemeChange(key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px',
                          background: isActive ? 'var(--accent-primary-muted)' : 'var(--bg-tertiary)',
                          border: isActive ? '1.5px solid var(--accent-primary)' : '1.5px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease', width: '100%'
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-color-hover)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-color)' }}
                      >
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div style={{
                            width: 38, height: 28, borderRadius: 6, background: swatch.bg,
                            border: '1px solid rgba(0,0,0,0.15)', overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '3px', padding: '4px'
                          }}>
                            <div style={{ width: 6, height: 12, borderRadius: 2, background: swatch.accent }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ height: 3, borderRadius: 2, background: swatch.text, opacity: 0.7 }} />
                              <div style={{ height: 3, borderRadius: 2, background: swatch.text, opacity: 0.4 }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{THEME_DESCRIPTIONS[key]}</div>
                        </div>
                        {isActive && (
                          <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* ── About ── */}
              <section>
                <SectionLabel>About</SectionLabel>
                <div style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    MyAppLabs HQ
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Version 1.5.0</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Internal Business Operations Hub</div>
                </div>
              </section>
            </div>

            {/* Sign Out Button */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
              <button className="btn btn-danger" onClick={handleLogout} style={{ width: '100%' }}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M6 13H2.5A1.5 1.5 0 011 11.5v-8A1.5 1.5 0 012.5 2H6M10 10.5l3.5-3-3.5-3M13.5 7.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sign Out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>

    <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

    <AnimatePresence>
      {gdprOpen && (
        <GdprDeletionModal isOpen={gdprOpen} onClose={() => setGdprOpen(false)} />
      )}
    </AnimatePresence>
    </>
  )
}
