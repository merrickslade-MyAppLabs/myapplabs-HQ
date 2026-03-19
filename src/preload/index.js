import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose electron-store API to renderer via contextBridge
const storeAPI = {
  get: (key) => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  delete: (key) => ipcRenderer.invoke('store:delete', key)
}

// Expose auto-updater API to renderer via contextBridge
const updaterAPI = {
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  onAvailable: (cb) => ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on('updater:progress', (_e, progress) => cb(progress)),
  onDownloaded: (cb) => ipcRenderer.on('updater:downloaded', (_e, info) => cb(info)),
  removeAll: () => {
    ipcRenderer.removeAllListeners('updater:available')
    ipcRenderer.removeAllListeners('updater:progress')
    ipcRenderer.removeAllListeners('updater:downloaded')
  }
}

// Expose shell.openExternal — validates https:// in main process before calling
const shellAPI = {
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
}

// Expose app focus/blur events for the session-lock inactivity timer.
// Returns a cleanup function that removes the listener.
const appAPI = {
  onFocus: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('app:focus', listener)
    return () => ipcRenderer.removeListener('app:focus', listener)
  },
  onBlur: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('app:blur', listener)
    return () => ipcRenderer.removeListener('app:blur', listener)
  }
}

// Expose APIs to renderer via contextBridge — the only permitted bridge.
// contextIsolation is always true in this app (enforced in main/index.js).
// The else branch has been intentionally removed: falling back to direct
// window assignment would bypass the security boundary entirely.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronStore', storeAPI)
    contextBridge.exposeInMainWorld('electronUpdater', updaterAPI)
    contextBridge.exposeInMainWorld('electronShell', shellAPI)
    contextBridge.exposeInMainWorld('electronApp', appAPI)
  } catch (error) {
    console.error('[preload] contextBridge.exposeInMainWorld failed:', error)
  }
} else {
  // contextIsolation must always be true — if this branch is ever reached,
  // it means the security configuration has been misconfigured. Fail loudly.
  console.error(
    '[preload] SECURITY ERROR: contextIsolation is false. ' +
    'This should never happen. Check BrowserWindow webPreferences.'
  )
}
