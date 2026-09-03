import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { confirmEngineOpen, clearTilariStorage, nodeApiAvailable, skipWebkitOpfs, testBook } from './helpers'

async function seedStaleHttpSession(page: import('@playwright/test').Page) {
  await clearTilariStorage(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tilari.e2e.stale-seeded')) return
    sessionStorage.setItem('tilari.e2e.stale-seeded', '1')
    localStorage.setItem('tilari.engine', 'http')
    localStorage.setItem(
      'tilari.bookSession',
      JSON.stringify({
        sessionId: 'stale-http-session',
        path: 'server:stale.kitsas',
        engine: 'http',
      }),
    )
  })
}

test.describe('engine open (wasm)', () => {
  test('local file with wasm shows Selaimessa and survives reload', async ({
    page,
    browserName,
  }) => {
    skipWebkitOpfs(browserName)
    test.setTimeout(90_000)
    await clearTilariStorage(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
    await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
    await confirmEngineOpen(page, 'wasm')
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')
  })

  test('wasm choice wins when default engine preference is http', async ({ page }) => {
    test.setTimeout(90_000)
    await clearTilariStorage(page)
    await page.addInitScript(() => {
      localStorage.setItem('tilari.engine', 'http')
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
    await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
    await confirmEngineOpen(page, 'wasm')
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')
  })

  test('wasm choice wins over stale http session in localStorage', async ({ page }) => {
    test.setTimeout(90_000)
    await seedStaleHttpSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('tilari.bookSession')))
      .toBeNull()
    await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
    await confirmEngineOpen(page, 'wasm')
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')
  })

  test('locker book with wasm shows Selaimessa and survives reload', async ({
    page,
    baseURL,
    browserName,
  }) => {
    skipWebkitOpfs(browserName)
    test.setTimeout(120_000)
    test.skip(!(await nodeApiAvailable(page, baseURL)), 'Node API required (npm run dev from repo root)')

    const bytes = readFileSync(testBook)
    const uniqueName = `engine-open-${Date.now()}.kitsas`
    const put = await page.request.post(`${baseURL}/api/books`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Tilari-Name': encodeURIComponent(uniqueName),
      },
      data: bytes,
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    await clearTilariStorage(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()

    await page.getByRole('button', { name: 'Avaa omasta säilytyksestä…' }).click()
    await expect(page.getByRole('heading', { name: 'Oma säilytys (BYO)' })).toBeVisible()
    await page.getByRole('button', { name: uniqueName }).first().click()
    await confirmEngineOpen(page, 'wasm')

    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')
    await expect(page.locator('.status-storage-kind')).not.toHaveText('Palvelimella')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.status-storage-kind')).toHaveText('Selaimessa')
  })
})
