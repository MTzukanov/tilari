import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  clearTilariStorage,
  confirmEngineOpen,
  installSyncChipRecorder,
  openServerBookList,
  recordedSyncChips,
  resetRecordedSyncChips,
  skipWebkitOpfs,
} from './helpers'
import { writeFatTestBook } from './fatBook'

async function clearOpfs(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const nav = navigator as Navigator & {
      storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
    }
    if (!nav.storage?.getDirectory) return
    try {
      const root = await nav.storage.getDirectory()
      const tilari = await root.getDirectoryHandle('tilari', { create: false })
      const names: string[] = []
      for await (const [name] of tilari.entries()) names.push(name)
      for (const name of names) {
        await tilari.removeEntry(name, { recursive: true })
      }
    } catch {
      /* none */
    }
  })
}

test.describe('wasm locker open attachment progress', () => {
  test.beforeEach(({ browserName }) => {
    skipWebkitOpfs(browserName)
  })

  test('server book in browser: distinct download vs write-to-browser titles', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000)
    const fatBook = await writeFatTestBook('tilari-locker-fat-e2e.kitsas')
    const bytes = readFileSync(fatBook)
    const bookName = `fat-e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.kitsas`

    await clearTilariStorage(page)
    await installSyncChipRecorder(page)

    const put = await page.request.post(`${baseURL}/api/books`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Tilari-Name': encodeURIComponent(bookName),
      },
      data: bytes,
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    await page.goto('/')
    await clearOpfs(page)
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()

    await openServerBookList(page)
    await page.getByRole('button', { name: bookName }).click()
    await confirmEngineOpen(page, 'wasm')

    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 180_000,
    })
    await expect(page.locator('.status-chip.status-sync')).toHaveCount(0, { timeout: 180_000 })

    const chipTexts = await recordedSyncChips(page)
    const detail = `chips=${JSON.stringify(chipTexts)}`
    expect(
      chipTexts.some((c) => /ladataan(?: liitteitä)? palvelimelta/i.test(c)),
      `expected download title; ${detail}`,
    ).toBe(true)
    expect(
      chipTexts.some((c) => /kirjoitetaan selaimeen/i.test(c)),
      `expected browser-write title; ${detail}`,
    ).toBe(true)
    expect(
      chipTexts.some((c) => /^Liitteet\s+[\d.]+\s*\/\s*[\d.]+\s*Mt$/i.test(c)),
      `old ambiguous "Liitteet X / Y Mt" must not appear; ${detail}`,
    ).toBe(false)
  })

  test('reopen same locker book skips attachment download', async ({ page, baseURL }) => {
    test.setTimeout(240_000)
    const fatBook = await writeFatTestBook('tilari-locker-fat-reopen-e2e.kitsas')
    const bytes = readFileSync(fatBook)
    const bookName = `fat-reopen-e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.kitsas`

    await clearTilariStorage(page)
    await installSyncChipRecorder(page)
    const put = await page.request.post(`${baseURL}/api/books`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Tilari-Name': encodeURIComponent(bookName),
      },
      data: bytes,
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    await page.goto('/')
    await clearOpfs(page)
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()

    await openServerBookList(page)
    await page.getByRole('button', { name: bookName }).click()
    await confirmEngineOpen(page, 'wasm')
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 180_000,
    })
    await expect(page.locator('.status-chip.status-sync')).toHaveCount(0, { timeout: 180_000 })
    await resetRecordedSyncChips(page)

    await openServerBookList(page)
    await page.getByRole('button', { name: bookName }).click()
    await confirmEngineOpen(page, 'wasm')
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 180_000,
    })
    await expect(page.locator('.status-chip.status-sync')).toHaveCount(0, { timeout: 180_000 })

    const chipTexts = await recordedSyncChips(page)
    expect(
      chipTexts.some((c) => /ladataan(?: liitteitä)? palvelimelta/i.test(c)),
      `second open must not download attachments; chips=${JSON.stringify(chipTexts)}`,
    ).toBe(false)
  })
})
