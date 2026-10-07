/**
 * Who may call the Node server from a browser.
 *
 * The server has no user accounts, so the browser's origin is the boundary:
 * - same-origin requests (UI served by this server, or the Vite dev proxy) are allowed;
 * - cross-origin requests only from TILARI_ALLOWED_ORIGINS (default: the public Pages site),
 *   which then get CORS headers;
 * - any other Origin is refused before routing, so a foreign page cannot trigger writes
 *   with "simple" requests that skip the CORS preflight.
 * When bound to loopback, the Host header must be a loopback name (DNS rebinding).
 */
import type { IncomingMessage } from 'node:http'

/** Public GitHub Pages build of the single-file app (docs/PAGES.md). */
export const DEFAULT_ALLOWED_ORIGINS = ['https://mtzukanov.github.io']

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

let originsOverride: string[] | null = null
let hostsOverride: string[] | null = null

/** Tests only: replace the env-derived lists (null = read env again). */
export function setGuardOverrides(opts: { origins?: string[] | null; hosts?: string[] | null }): void {
  if (opts.origins !== undefined) originsOverride = opts.origins
  if (opts.hosts !== undefined) hostsOverride = opts.hosts
}

function envList(name: string): string[] | null {
  const raw = process.env[name]
  if (raw == null) return null
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function allowedOrigins(): Set<string> {
  const list = originsOverride ?? envList('TILARI_ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGINS
  return new Set(list.map((o) => o.replace(/\/+$/, '').toLowerCase()))
}

function allowedHosts(): Set<string> | null {
  const list = hostsOverride ?? envList('TILARI_ALLOWED_HOSTS')
  return list ? new Set(list.map((h) => h.toLowerCase())) : null
}

export function isLoopbackBind(bindHost: string): boolean {
  return LOOPBACK_HOSTS.has(bindHost.toLowerCase())
}

function hostName(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  const colon = h.lastIndexOf(':')
  return colon >= 0 ? h.slice(0, colon) : h
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

export type GuardResult =
  | { ok: true; corsOrigin: string | null }
  | { ok: false; status: number; detail: string }

export function checkRequest(req: IncomingMessage, bindHost: string, path: string): GuardResult {
  const host = header(req, 'host')
  const hosts = allowedHosts()
  if (hosts) {
    if (!hosts.has(hostName(host)) && !hosts.has(host.toLowerCase())) {
      return { ok: false, status: 421, detail: 'host_not_allowed' }
    }
  } else if (isLoopbackBind(bindHost) && host && !LOOPBACK_HOSTS.has(hostName(host))) {
    return { ok: false, status: 421, detail: 'host_not_allowed' }
  }

  const origin = header(req, 'origin').replace(/\/+$/, '').toLowerCase()
  if (!origin) {
    // No Origin: curl, health checks, same-origin GET. Browsers also omit it on cross-site
    // no-cors GETs (img/script); refuse those for the API so nothing is even executed.
    const site = header(req, 'sec-fetch-site')
    if (path.startsWith('/api/') && (site === 'cross-site' || site === 'same-site')) {
      return { ok: false, status: 403, detail: 'origin_not_allowed' }
    }
    return { ok: true, corsOrigin: null }
  }
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = ''
  }
  if (originHost && originHost === host.toLowerCase()) return { ok: true, corsOrigin: null }
  if (origin !== 'null' && allowedOrigins().has(origin)) return { ok: true, corsOrigin: origin }
  return { ok: false, status: 403, detail: 'origin_not_allowed' }
}
