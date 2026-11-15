import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Keep Trace's existing API on :8000. The document engine is a separate
// process on :8765 and now accepts the same /api/* names without a rewrite.
// Specific engine paths must appear before the broad /api fallback.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/ask': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/evidence': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/docs': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/project': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/review': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/calibrate': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/measure': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/answer': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api/geometry': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
