// Standalone Vite config for previewing just the renderer in a browser.
// Used by .claude/launch.json so the preview tool can inspect the UI
// without needing Electron running.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  define: {
    // Stub window.electronStore so the app doesn't crash without Electron
    'window.electronStore': JSON.stringify(null)
  }
})
