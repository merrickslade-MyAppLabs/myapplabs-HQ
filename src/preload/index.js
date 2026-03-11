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

// Expose APIs to renderer process safely
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronStore', storeAPI)
    contextBridge.exposeInMainWorld('electronUpdater', updaterAPI)
    contextBridge.exposeInMainWorld('electronShell', shellAPI)
  } catch (error) {
    console.error('Failed to expose APIs via contextBridge:', error)
  }
} else {
  window.electron = electronAPI
  window.electronStore = storeAPI
  window.electronUpdater = updaterAPI
  window.electronShell = shellAPI
}
