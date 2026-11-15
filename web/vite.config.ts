import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// One backend on :8000: agent.app already runs Xinran's engine (/ask) and mounts her API under /rv/*.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keep the browser client and dev server on the same port.  Without this,
    // Vite can move the HTTP server to 5174 while its HMR client still targets
    // an older process on 5173, leaving a blank page during local testing.
    port: 5174,
    strictPort: true,
    hmr: { clientPort: 5174 },
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
