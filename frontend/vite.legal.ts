import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(frontendRoot, '..')

function copyLegalInto(dir: string): void {
  copyFileSync(resolve(repoRoot, 'LICENSE'), resolve(dir, 'LICENSE'))
  copyFileSync(resolve(repoRoot, 'THIRD_PARTY.md'), resolve(dir, 'THIRD_PARTY.md'))
}

/** Put GPL + third-party notices next to the built UI (and serve them in `vite dev`). */
export function copyLegalPlugin(): Plugin {
  let outDir = resolve(frontendRoot, 'dist')
  return {
    name: 'tilari-copy-legal',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml(html) {
      return `<!-- Tilari: LICENSE (GPL-3) and THIRD_PARTY.md are next to this file. -->\n${html}`
    },
    configureServer(server) {
      const files: Record<string, { path: string; type: string }> = {
        '/LICENSE': { path: resolve(repoRoot, 'LICENSE'), type: 'text/plain; charset=utf-8' },
        '/THIRD_PARTY.md': {
          path: resolve(repoRoot, 'THIRD_PARTY.md'),
          type: 'text/markdown; charset=utf-8',
        },
      }
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        const hit = files[url]
        if (!hit || !existsSync(hit.path)) {
          next()
          return
        }
        res.setHeader('Content-Type', hit.type)
        res.end(readFileSync(hit.path))
      })
    },
    closeBundle() {
      copyLegalInto(outDir)
    },
  }
}
