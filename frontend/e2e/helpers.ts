import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const testBook = path.join(repoRoot, 'testdb', 'tilari-test.kitsas')
const periodEndBook = path.join(repoRoot, 'testdb', 'tilari-period-end.kitsas')

export { testBook, periodEndBook }

/** Playwright WebKit on Linux does not persist OPFS / File System Access. */
export function skipWebkitOpfs(browserName: string) {
  test.skip(
    browserName === 'webkit',
    'OPFS persist is unreliable in Playwright WebKit; Chromium and Firefox cover these tests',
  )
}

/** Vite wasm e2e has no Node API; fail the probe in 2s. SPA fallback HTML is not health. */
export async function nodeApiAvailable(page: Page, baseURL: string | undefined): Promise<boolean> {
  if (!baseURL) return false
  try {
    const health = await page.request.get(`${baseURL}/api/health`, { timeout: 2_000 })
    if (!health.ok()) return false
    const json: unknown = await health.json()
    return typeof json === 'object' && json !== null && (json as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}

/** Record status-sync chip text in-page so brief Firefox titles are not missed by polling. */
export async function installSyncChipRecorder(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { __tilariSyncChips?: string[] }
    if (w.__tilariSyncChips) return
    const seen: string[] = []
    w.__tilariSyncChips = seen
    const capture = () => {
      for (const el of document.querySelectorAll('.status-chip.status-sync')) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        if (text && !seen.includes(text)) seen.push(text)
      }
    }
    const start = () => {
      new MutationObserver(capture).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      })
      capture()
    }
    if (document.documentElement) start()
    else document.addEventListener('DOMContentLoaded', start, { once: true })
  })
}

export function recordedSyncChips(page: Page) {
  return page.evaluate(
    () => (window as Window & { __tilariSyncChips?: string[] }).__tilariSyncChips ?? [],
  )
}

/** Drop titles captured so far (same page, no navigation). */
export async function resetRecordedSyncChips(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __tilariSyncChips?: string[] }
    if (w.__tilariSyncChips) w.__tilariSyncChips.length = 0
  })
}

/** Match fi-FI currency grouping (space / NBSP / NNBSP) and ASCII or Unicode minus. */
export function eur(amount: string): RegExp {
  const signed = /^[-−]/.test(amount)
  const body = (signed ? amount.slice(1) : amount).replaceAll(' ', '[\\s\\u00a0\\u202f]')
  return new RegExp(`${signed ? '[-−]' : ''}${body}`)
}

export async function clearTilariStorage(page: Page) {
  await page.addInitScript(() => {
    const mockWritable = {
      write: async () => undefined,
      close: async () => undefined,
    }
    const mockHandle = {
      createWritable: async () => mockWritable,
      getFile: async () => new File([new Uint8Array([1])], 'tilari-test.kitsas'),
      requestPermission: async () => 'granted' as PermissionState,
    }
    window.showSaveFilePicker = async () => mockHandle as FileSystemFileHandle
    window.showOpenFilePicker = async () => [mockHandle as FileSystemFileHandle]

    // Keep the book session across reload so wasm OPFS restore can be tested.
    if (sessionStorage.getItem('tilari.e2e.cleared')) return
    sessionStorage.setItem('tilari.e2e.cleared', '1')
    localStorage.removeItem('tilari.allocation-prefs')
    localStorage.removeItem('tilari.lastBook')
    localStorage.removeItem('tilari.recentBooks')
    localStorage.removeItem('tilari.bookSession')
    localStorage.removeItem('tilari.engine')
    localStorage.setItem('tilari.locale', 'fi')
  })
}

export async function confirmEngineOpen(page: Page, engine: 'wasm' | 'http') {
  const dialog = page.getByRole('heading', { name: 'Missä kirja avataan?' })
  // Without a same-origin Node API the app opens wasm directly (no dialog).
  const appeared = await dialog
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) {
    if (engine === 'http') {
      throw new Error('Engine dialog did not appear; http engine needs a same-origin Node API')
    }
    return
  }
  const label = engine === 'http' ? 'Palvelimella' : 'Tässä selaimessa'
  const radio = page.getByRole('radio', { name: label })
  await radio.click()
  await expect(radio).toBeChecked()
  await page.getByRole('button', { name: 'Avaa', exact: true }).click()
}

/** File menu option — works with or without a book open (empty-state is a button). */
export async function openServerBookList(page: Page) {
  await page.getByLabel('Kirjanpitotiedosto').selectOption({ label: 'Avaa omasta säilytyksestä…' })
  await expect(page.getByRole('heading', { name: 'Oma säilytys (BYO)' })).toBeVisible()
}

async function openKitsasFile(page: Page, bookPath: string) {
  await clearTilariStorage(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(bookPath)
  await confirmEngineOpen(page, 'wasm')
  await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
    timeout: 60_000,
  })
}

export async function openPeriodEndBook(page: Page) {
  await openKitsasFile(page, periodEndBook)
}

export async function openBook(page: Page) {
  await clearTilariStorage(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
  await confirmEngineOpen(page, 'wasm')
  await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
    timeout: 60_000,
  })
}

/** Open golden book with Node HTTP ledger engine (reproduces locker save path). */
export async function openBookHttpEngine(page: Page) {
  await clearTilariStorage(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
  await confirmEngineOpen(page, 'http')
  await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByText('Palvelinistunto')).toBeVisible()
}

export async function selectYear(page: Page, ends: string) {
  await selectNavMode(page, 'Tilikausi')
  const picker = page.getByLabel('Jakson valinta').first()
  if ((await picker.count()) > 0) {
    const value = await picker.evaluate((el, needle) => {
      const select = el as HTMLSelectElement
      const opt = [...select.options].find(
        (o) => o.value.endsWith(`/${needle}`) || o.textContent?.includes(needle),
      )
      return opt?.value ?? ''
    }, ends)
    if (value) {
      await picker.selectOption(value)
      return
    }
  }
  const nav = page.locator('.ledger-head-nav').first()
  for (let i = 0; i < 24; i += 1) {
    if ((await nav.getAttribute('data-end')) === ends) return
    const prev = page.getByTitle('Edellinen tilikausi').first()
    if (await prev.isDisabled()) break
    await prev.click()
  }
  for (let i = 0; i < 24; i += 1) {
    if ((await nav.getAttribute('data-end')) === ends) return
    const next = page.getByTitle('Seuraava tilikausi').first()
    if (await next.isDisabled()) break
    await next.click()
  }
  await expect(nav).toHaveAttribute('data-end', ends)
}

export async function openReports2024(page: Page) {
  await openBook(page)
  await selectYear(page, '2024-12-31')
  await expect(page.getByRole('heading', { name: 'Vastaavaa' })).toBeVisible()
}

export async function selectNavMode(page: Page, name: string) {
  await page.locator('label.nav-radio', { hasText: name }).first().click()
}

export async function gotoMonth(page: Page, isoStart: string) {
  await selectNavMode(page, 'Kuukausi')
  const picker = page.getByLabel('Jakson valinta').first()
  if ((await picker.count()) > 0) {
    const value = await picker.evaluate((el, start) => {
      const select = el as HTMLSelectElement
      const opt = [...select.options].find((o) => o.value.startsWith(`${start}/`))
      return opt?.value ?? ''
    }, isoStart)
    if (value) {
      await picker.selectOption(value)
      await expect(page.locator('.ledger-head-nav').first()).toHaveAttribute('data-start', isoStart)
      return
    }
  }
  const nav = page.locator('.ledger-head-nav').first()
  for (let i = 0; i < 24; i += 1) {
    if ((await nav.getAttribute('data-start')) === isoStart) return
    const prev = page.getByTitle('Edellinen kuukausi')
    if (await prev.isDisabled()) break
    await prev.click()
  }
  await expect(nav).toHaveAttribute('data-start', isoStart)
}
