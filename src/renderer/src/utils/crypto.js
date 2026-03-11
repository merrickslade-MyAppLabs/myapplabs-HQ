// ============================================================
// MyAppLabs HQ — AES-256-GCM Encryption for Provider Passwords
// Uses Web Crypto API (available in Electron renderer process)
// Key is derived via PBKDF2 from stable user identity + machine salt
// ============================================================

const PBKDF2_ITERATIONS = 100_000
const IV_BYTES = 16
const TAG_BITS = 128
const TAG_BYTES = TAG_BITS / 8 // 16

export const PLACEHOLDER_PASSWORD = 'PLACEHOLDER_NOT_ENCRYPTED'

// ── App salt (machine-specific, stored in electron-store) ─────────────────────

let _cachedSalt = null

async function getAppSalt() {
  if (_cachedSalt) return _cachedSalt

  let saltB64 = null
  if (window.electronStore) {
    saltB64 = await window.electronStore.get('app-crypto-salt')
  }

  if (!saltB64) {
    // First run: generate a random 16-byte salt and persist it
    const salt = crypto.getRandomValues(new Uint8Array(16))
    saltB64 = uint8ToB64(salt)
    if (window.electronStore) {
      await window.electronStore.set('app-crypto-salt', saltB64)
    }
  }

  _cachedSalt = b64ToUint8(saltB64)
  return _cachedSalt
}

// ── Key derivation cache (stable per userId+email within a session) ───────────

let _cachedKey = null
let _cachedKeyId = null // userId:email

export async function getDerivedKey(userId, userEmail) {
  const keyId = `${userId}:${userEmail}`
  if (_cachedKey && _cachedKeyId === keyId) return _cachedKey

  const appSalt = await getAppSalt()
  const encoder = new TextEncoder()

  // Import the stable user identity as PBKDF2 key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyId),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  // Derive AES-256-GCM key — not extractable, lives only in memory
  _cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: appSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  )

  _cachedKeyId = keyId
  return _cachedKey
}

// Clear cached key on logout
export function clearDerivedKey() {
  _cachedKey = null
  _cachedKeyId = null
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext password.
 * Returns a string: "base64(iv):base64(ciphertext):base64(authTag)"
 * @param {string} plaintext - The plaintext password to encrypt
 * @param {string} userId - Supabase user UUID (stable across sessions)
 * @param {string} userEmail - Supabase user email (stable)
 */
export async function encryptPassword(plaintext, userId, userEmail) {
  const key = await getDerivedKey(userId, userEmail)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoder = new TextEncoder()

  // AES-GCM returns ciphertext || authTag (last TAG_BYTES bytes)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_BITS },
      key,
      encoder.encode(plaintext)
    )
  )

  const ciphertext = encrypted.slice(0, encrypted.length - TAG_BYTES)
  const authTag = encrypted.slice(encrypted.length - TAG_BYTES)

  return `${uint8ToB64(iv)}:${uint8ToB64(ciphertext)}:${uint8ToB64(authTag)}`
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypt a stored encrypted password string.
 * @param {string} stored - "base64(iv):base64(ciphertext):base64(authTag)"
 * @param {string} userId
 * @param {string} userEmail
 * @returns {Promise<string>} Plaintext password — only use in memory, never persist
 */
export async function decryptPassword(stored, userId, userEmail) {
  if (!stored || stored === PLACEHOLDER_PASSWORD) {
    throw new Error('No password stored')
  }

  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted password format')

  const iv = b64ToUint8(parts[0])
  const ciphertext = b64ToUint8(parts[1])
  const authTag = b64ToUint8(parts[2])

  // Reconstruct: ciphertext || authTag for Web Crypto decrypt
  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const key = await getDerivedKey(userId, userEmail)

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    combined
  )

  return new TextDecoder().decode(decryptedBuffer)
}

// ── Password generator ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random password.
 * Uses all character classes to ensure strength.
 */
export function generatePassword(length = 20) {
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?'
  const all = lower + upper + digits + symbols

  // length bytes for character selection + length bytes for Fisher-Yates shuffle
  const randomValues = crypto.getRandomValues(new Uint8Array(length * 2))
  let result = ''

  // Ensure at least one of each class
  result += lower[randomValues[0] % lower.length]
  result += upper[randomValues[1] % upper.length]
  result += digits[randomValues[2] % digits.length]
  result += symbols[randomValues[3] % symbols.length]

  // Fill the rest
  for (let i = 4; i < length; i++) {
    result += all[randomValues[i] % all.length]
  }

  // Fisher-Yates shuffle — each step uses a unique random byte (no reuse)
  const arr = result.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomValues[length + (arr.length - 1 - i)] % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr.join('')
}

// ── Base64 helpers ────────────────────────────────────────────────────────────

function uint8ToB64(arr) {
  return btoa(String.fromCharCode(...arr))
}

function b64ToUint8(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
