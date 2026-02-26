import { useState, useRef } from 'react'
import Modal from './ui/Modal'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { supabase } from '../supabase/client'

/**
 * Profile modal — change display name, avatar, and password.
 * Avatar is resized to 128×128 and stored as base64 in user_metadata.
 */
export default function ProfileModal({ isOpen, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const fileInputRef = useRef(null)

  const savedName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]?.replace(/[._-]/g, ' ')
    || ''
  const savedAvatar = user?.user_metadata?.avatar_url || null

  const [name, setName] = useState(savedName)
  const [avatarPreview, setAvatarPreview] = useState(savedAvatar)
  const [avatarData, setAvatarData] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState(null)

  // Derive initials from current name input
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  // Resize image to 128×128 (center-crop) and return base64 JPEG
  function resizeImage(file) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const size = 128
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = url
    })
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const data = await resizeImage(file)
    setAvatarPreview(data)
    setAvatarData(data)
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    const updateData = { full_name: name.trim() }
    if (avatarData) updateData.avatar_url = avatarData

    const { error } = await supabase.auth.updateUser({ data: updateData })
    setSavingProfile(false)
    if (error) {
      toast('Failed to update profile.', 'error')
    } else {
      toast('Profile updated.', 'success')
      setAvatarData(null)
    }
  }

  async function handleChangePassword() {
    setPasswordError(null)
    if (!newPassword) { setPasswordError('Enter a new password.'); return }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (error) {
      setPasswordError(error.message)
    } else {
      toast('Password updated successfully.', 'success')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile" size="sm">

      {/* ── Avatar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
        <div
          style={{ position: 'relative', cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: avatarPreview ? 'transparent' : 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: 700,
              color: '#fff',
              overflow: 'hidden',
              border: '2px solid var(--border-color)',
              flexShrink: 0
            }}
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials
            }
          </div>
          {/* Camera overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              border: '2px solid var(--bg-modal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1.5L6.5 3H9a.5.5 0 01.5.5v5a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5v-5A.5.5 0 012 3h2.5L5.5 1.5z" stroke="white" strokeWidth="1" strokeLinejoin="round"/>
              <circle cx="5.5" cy="6" r="1.5" stroke="white" strokeWidth="1"/>
            </svg>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
          Click to change photo
        </div>
      </div>

      {/* ── Display Name ── */}
      <div style={{ marginBottom: '14px' }}>
        <label className="label">Display Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {/* ── Email (read-only) ── */}
      <div style={{ marginBottom: '20px' }}>
        <label className="label">Email</label>
        <input
          className="input"
          value={user?.email || ''}
          disabled
          style={{ opacity: 0.55, cursor: 'not-allowed' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSaveProfile}
          disabled={savingProfile}
        >
          {savingProfile ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: '24px' }} />

      {/* ── Change Password ── */}
      <div>
        <div
          className="label"
          style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '14px' }}
        >
          Change Password
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label className="label">New Password</label>
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null) }}
            placeholder="Min. 6 characters"
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label className="label">Confirm Password</label>
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null) }}
            placeholder="Repeat new password"
          />
        </div>

        {passwordError && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '10px' }}>
            {passwordError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleChangePassword}
            disabled={savingPassword}
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>

    </Modal>
  )
}
