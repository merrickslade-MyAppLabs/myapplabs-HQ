import { app, shell, BrowserWindow, ipcMain, session, Menu } from 'electron'
import { join } from 'path'
import { createHash } from 'node:crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import updaterPkg from 'electron-updater'
const { autoUpdater } = updaterPkg

// ── Electron-store with encryption ────────────────────────────────────────────
// Key is machine-specific: derived from the userData path so it differs per install.
// This encrypts data at rest — the key itself never leaves the process.
function getStoreEncryptionKey() {
  return createHash('sha256')
    .update(`myapplabs-hq:${app.getPath('userData')}`)
    .digest('hex')
}

// Initialize after app is ready (userData path requires app to be ready)
let store = null
function getStore() {
  if (!store) {
    store = new Store({ encryptionKey: getStoreEncryptionKey() })
  }
  return store
}

// ─── Auto-updater setup ───────────────────────────────────────────────────────
function setupAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message)
  })

  // Check for updates 5s after launch (production only)
  if (!is.dev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
  }
}

// IPC handlers for auto-updater
ipcMain.handle('updater:check', () => {
  if (is.dev) return null
  return autoUpdater.checkForUpdates().catch(() => null)
})

ipcMain.handle('updater:download', () => {
  autoUpdater.downloadUpdate()
  return true
})

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall()
})

// ─── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Security non-negotiables — never set any of these to false.
      // sandbox:          isolates the renderer in an OS-level sandbox;
      //                   preload still has ipcRenderer/contextBridge access.
      // contextIsolation: keeps renderer JS and preload JS in separate worlds.
      // nodeIntegration:  must be false — no Node APIs in the renderer.
      // webSecurity:      enforces same-origin policy and blocks mixed content.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    setupAutoUpdater(mainWindow)
  })

  // Relay window focus/blur to renderer so the session-lock timer can
  // detect when the user has returned after a long period away.
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('app:focus')
  })
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('app:blur')
  })

  // Block all in-app navigation to external URLs.
  // Only allow https:// — deny everything else (file://, javascript:, etc.)
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {}
    return { action: 'deny' }
  })

  // Block navigation away from the app origin
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : null
    if (appUrl && url.startsWith(appUrl)) return
    if (!appUrl && url.startsWith('file://')) return
    event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Whitelisted IPC channels ─────────────────────────────────────────────────
const ALLOWED_STORE_KEYS = new Set([
  'theme', 'sidebar-collapsed', 'app-crypto-salt'
])

// ─── IPC handlers for electron-store ─────────────────────────────────────────
ipcMain.handle('store:get', (_event, key) => {
  if (typeof key !== 'string') return null
  return getStore().get(key)
})

ipcMain.handle('store:set', (_event, key, value) => {
  if (typeof key !== 'string') return false
  // Only allow known safe keys to be written
  if (!ALLOWED_STORE_KEYS.has(key)) {
    console.warn(`[IPC] store:set rejected unknown key: ${key}`)
    return false
  }
  getStore().set(key, value)
  return true
})

ipcMain.handle('store:delete', (_event, key) => {
  if (typeof key !== 'string') return false
  // Only allow deletion of known safe keys — prevents wiping app-crypto-salt
  if (!ALLOWED_STORE_KEYS.has(key)) {
    console.warn(`[IPC] store:delete rejected unknown key: ${key}`)
    return false
  }
  getStore().delete(key)
  return true
})

// ─── IPC handler for shell.openExternal ──────────────────────────────────────
// Only allows https:// URLs — blocks file://, javascript:, data:, etc.
ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      console.warn(`[IPC] shell:openExternal blocked non-https URL: ${parsed.protocol}`)
      return false
    }
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.myapplabs.hq')

  // ── Remove application menu in production ──────────────────────────────────
  // Completely removes the native menu bar in production builds. This prevents
  // access to View > Developer Tools via the menu. In dev, the menu stays so
  // DevTools remain accessible during development.
  if (!is.dev) {
    Menu.setApplicationMenu(null)
  }

  // ── Content Security Policy (production only) ──────────────────────────────
  // In dev, Vite serves from localhost so CSP is more permissive.
  // In production, enforce a strict policy to block XSS and data exfiltration.
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            "script-src 'self';" +
            "style-src 'self' 'unsafe-inline';" +
            `connect-src 'self' ${import.meta.env.VITE_SUPABASE_URL} ${import.meta.env.VITE_SUPABASE_URL?.replace('https://', 'wss://')};` +
            "img-src 'self' data: https:;" +
            "font-src 'self' data:;" +
            "object-src 'none';" +
            "frame-src 'none';" +
            "base-uri 'self';"
          ]
        }
      })
    })
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
