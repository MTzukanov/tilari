import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const uiPort = 15173

/** Comma list, e.g. `chromium` on PR CI or `chromium,firefox,webkit` on release. */
const browserNames = (process.env.TILARI_E2E_BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
] as const

const projects = allProjects.filter((p) => browserNames.includes(p.name))
if (projects.length === 0) {
  throw new Error(
    `TILARI_E2E_BROWSERS=${JSON.stringify(process.env.TILARI_E2E_BROWSERS)} matched no projects`,
  )
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['desktop.spec.ts', 'session-changes.http.spec.ts', 'open-attachments.locker.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // No CI retries: a 240s test × 3 attempts burned most of a 17m quota run.
  retries: 0,
  // One worker per selected browser project; files stay serial via fullyParallel.
  workers: projects.length,
  maxFailures: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    locale: 'fi-FI',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://127.0.0.1:${uiPort}`,
          localStorage: [{ name: 'tilari.locale', value: 'fi' }],
        },
      ],
    },
  },
  projects,
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${uiPort} --strictPort`,
    cwd: frontendDir,
    url: `http://127.0.0.1:${uiPort}`,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      TILARI_E2E_NO_API: '1',
    },
  },
})
