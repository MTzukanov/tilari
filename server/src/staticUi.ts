/**
 * Serve a Vite production build next to the API (desktop / AppImage / Docker).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendBytes, sendJson } from './httpUtil.ts'

const REPO_DIST = resolve(fileURLToPath(new URL('../../frontend/dist', import.meta.url)))

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
}

export function resolveStaticDir(): string | null {
  const candidates: string[] = []
  if (process.env.TILARI_STATIC) candidates.push(process.env.TILARI_STATIC)
  if (process.env.KITSAS_STATIC_DIR) candidates.push(process.env.KITSAS_STATIC_DIR)
  candidates.push(REPO_DIST)
  for (const raw of candidates) {
    try {
      const path = resolve(raw)
      if (existsSync(join(path, 'index.html'))) return path
    } catch {
      /* skip */
    }
  }
  return null
}

function safeFile(root: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleaned || cleaned.split('/').includes('..')) return null
  const candidate = resolve(root, cleaned)
  const rootResolved = resolve(root)
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) return null
  try {
    if (statSync(candidate).isFile()) return candidate
  } catch {
    return null
  }
  return null
}

function sendFile(res: ServerResponse, path: string): void {
  const ext = path.slice(path.lastIndexOf('.'))
  const data = readFileSync(path)
  sendBytes(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
}

/** @returns true if a UI asset was served */
export function handleStatic(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const staticDir = resolveStaticDir()
  if (!staticDir) return false

  const roots: [string, string][] = [
    ['/', 'index.html'],
    ['/favicon.svg', 'favicon.svg'],
    ['/favicon.ico', 'favicon.ico'],
    ['/icons.svg', 'icons.svg'],
  ]
  for (const [route, file] of roots) {
    if (path === route) {
      const found = safeFile(staticDir, file)
      if (!found) {
        sendJson(res, 404, { detail: 'not_found' })
        return true
      }
      sendFile(res, found)
      return true
    }
  }

  if (path.startsWith('/assets/')) {
    const found = safeFile(join(staticDir, 'assets'), path.slice('/assets/'.length))
    if (!found) {
      sendJson(res, 404, { detail: 'not_found' })
      return true
    }
    sendFile(res, found)
    return true
  }

  return false
}
