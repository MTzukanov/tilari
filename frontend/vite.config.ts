import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { copyLegalPlugin } from './vite.legal.ts'

const e2eNoApi = Boolean(process.env.TILARI_E2E_NO_API)

export default defineConfig({
  // Relative asset URLs so dist works from a subpath or file tree (not only /).
  base: './',
  plugins: [react(), copyLegalPlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    headers: {
      'Access-Control-Allow-Private-Network': 'true',
    },
    // Wasm Playwright has no Node locker; proxying /api to :8000 only logs ECONNREFUSED.
    ...(e2eNoApi
      ? {}
      : {
          proxy: {
            '/api': {
              target: process.env.TILARI_API || process.env.KITSAS_API || 'http://127.0.0.1:8000',
              changeOrigin: false,
              timeout: 0,
              proxyTimeout: 0,
            },
          },
        }),
  },
  test: {
    environment: 'happy-dom',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
