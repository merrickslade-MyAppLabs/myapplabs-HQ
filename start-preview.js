// Starts the Vite renderer dev server programmatically.
// Used by .claude/launch.json to bypass the .cmd spawn issue on Windows.
import { createServer } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

const server = await createServer({
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
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/auth':     { target: 'https://guigotagildvzanocdzs.supabase.co', changeOrigin: true, secure: true },
      '/rest':     { target: 'https://guigotagildvzanocdzs.supabase.co', changeOrigin: true, secure: true },
      '/realtime': { target: 'https://guigotagildvzanocdzs.supabase.co', changeOrigin: true, secure: true },
      '/storage':  { target: 'https://guigotagildvzanocdzs.supabase.co', changeOrigin: true, secure: true }
    }
  },
  define: {
    // Stub window.electronStore so the app renders without Electron
    'window.electronStore': 'null',
    '__APP_VERSION__': JSON.stringify('dev')
  }
})

await server.listen()
server.printUrls()
