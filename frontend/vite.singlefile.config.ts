import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { copyLegalPlugin } from './vite.legal.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

/** Embed favicon so dist-single/index.html needs no sidecar files. */
function inlineFavicon(): Plugin {
  return {
    name: 'tilari-inline-favicon',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8')
        const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
        return html.replace(
          /href="\.?\/favicon\.svg"/,
          `href="${href}"`,
        )
      },
    },
  }
}

/** One self-contained HTML (JS/CSS/WASM inlined). For double-click / USB trials. */
export default defineConfig({
  base: './',
  plugins: [react(), inlineFavicon(), viteSingleFile(), copyLegalPlugin()],
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    // sql-wasm.wasm is ~643KB; inline as data URL so nothing is left beside the HTML.
    assetsInlineLimit: 1_500_000,
    cssCodeSplit: false,
    copyPublicDir: false,
    modulePreload: false,
  },
})
