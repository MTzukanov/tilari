import { defineConfig, devices } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(frontendDir, '..')
const desktopPort = 18080
const booksDir = mkdtempSync(path.join(tmpdir(), 'tilari-e2e-locker-'))

export default defineConfig({
  testDir: './e2e',
  testMatch: ['desktop.spec.ts', 'session-changes.http.spec.ts', 'open-attachments.locker.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // One Node ledger session + one locker dir — browsers cannot overlap.
  workers: 1,
  maxFailures: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 90_000,
  use: {
    baseURL: `http://127.0.0.1:${desktopPort}`,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    locale: 'fi-FI',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://127.0.0.1:${desktopPort}`,
          localStorage: [{ name: 'tilari.locale', value: 'fi' }],
        },
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command:
      'npm run launcher -- --no-browser --host 127.0.0.1 --port ' + desktopPort,
    cwd: path.join(repoRoot, 'server'),
    env: {
      ...process.env,
      TILARI_STATIC: path.join(repoRoot, 'frontend', 'dist'),
      KITSAS_BOOKS_DIR: booksDir,
      TILARI_BOOKS_DIR: booksDir,
    },
    url: `http://127.0.0.1:${desktopPort}/api/health`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
