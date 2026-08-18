import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development Vite serves the SPA and forwards /api to the local server.
// In production nginx does the same split: static files from web/dist, /api/
// proxied to the Node process.
//
// VITE_BASE_PATH lets the same code deploy either at a domain root ('/') or
// under a path on an existing domain ('/cleaner/'). It is baked in at build
// time and read back at runtime via import.meta.env.BASE_URL in api.ts.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || 4003}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
  },
})
