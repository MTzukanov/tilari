/**
 * Start the local Tilari server and optionally open a browser.
 */
import { networkInterfaces } from 'node:os'
import { createServer as createNetServer } from 'node:net'
import { parseArgs } from 'node:util'
import { startServer } from './app.ts'

function portIsFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function pickFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.listen(0, host, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

async function resolvePort(host: string, requested: number | null): Promise<number> {
  if (requested != null) {
    if (!(await portIsFree(host, requested))) {
      throw new Error(`port ${requested} already in use on ${host}`)
    }
    return requested
  }
  for (let port = 8000; port < 8020; port++) {
    if (await portIsFree(host, port)) return port
  }
  return pickFreePort(host)
}

/** Non-internal IPv4 addresses for LAN URLs (skip link-local). */
function lanIpv4Addresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue
      if (info.address.startsWith('169.254.')) continue
      out.push(info.address)
    }
  }
  return out
}

async function waitHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'timeout'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })
      if (res.status === 200) return
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Tilari did not become ready: ${lastError}`)
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      lan: { type: 'boolean', default: false },
      port: { type: 'string' },
      'no-browser': { type: 'boolean', default: false },
      timeout: { type: 'string', default: '20' },
    },
    allowPositionals: true,
  })

  if (values.lan && values.host) {
    console.error('Use either --lan or --host, not both')
    return 1
  }

  const bindHost = values.lan ? '0.0.0.0' : values.host || '127.0.0.1'
  const requested = values.port != null ? Number(values.port) : null
  let port: number
  try {
    port = await resolvePort(bindHost, Number.isFinite(requested) ? requested : null)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    return 1
  }

  // Health check + browser use loopback; 0.0.0.0 is bind-only.
  const localOrigin = `http://127.0.0.1:${port}`
  if (values.lan) {
    console.log(`TILARI_URL=${localOrigin}/`)
    const addrs = lanIpv4Addresses()
    if (addrs.length) {
      for (const ip of addrs) console.log(`TILARI_LAN_URL=http://${ip}:${port}/`)
    } else {
      console.log('TILARI_LAN_URL=(no non-loopback IPv4 found; check Wi‑Fi/Ethernet)')
    }
    console.log(`Listening on ${bindHost}:${port} (LAN)`)
  } else {
    const origin = bindHost === '0.0.0.0' ? localOrigin : `http://${bindHost}:${port}`
    console.log(`TILARI_URL=${origin}/`)
  }

  const server = startServer({ host: bindHost, port })
  let ready = false
  try {
    await waitHealth(localOrigin, Number(values.timeout || 20) * 1000)
    ready = true
    if (!values['no-browser']) {
      const { execFile } = await import('node:child_process')
      const opener =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
      const args =
        process.platform === 'win32' ? ['/c', 'start', '', `${localOrigin}/`] : [`${localOrigin}/`]
      execFile(opener, args, () => {})
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    server.close()
    return 1
  }

  await new Promise<void>((resolve) => {
    const onSignal = () => {
      server.close(() => resolve())
    }
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
  })
  return ready ? 0 : 1
}

void main().then((code) => process.exit(code))
