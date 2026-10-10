import { expect, test } from '@playwright/test'
import {
  chooseFileMenu,
  eur,
  lockerBookRow,
  openBook,
  openBookHttpEngine,
  openReports2024,
  selectYear,
} from './helpers'

test('production UI is served from the Node server', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
})

test('open golden book on the packed origin', async ({ page }) => {
  await openBook(page)
  await expect(page.getByText('1234567-8')).toBeVisible()
})

test('2024 bank balance on packed origin', async ({ page }) => {
  await openReports2024(page)
  const bank = page.getByRole('row', { name: /1910/ })
  await expect(bank).toContainText('Pankkitili')
  await expect(bank).toContainText(eur('1 105,00'))
})

test('http engine loads balances after open', async ({ page }) => {
  await openBookHttpEngine(page)
  await selectYear(page, '2024-12-31')
  await expect(page.getByRole('heading', { name: 'Vastaavaa' })).toBeVisible()
  const bank = page.getByRole('row', { name: /1910/ })
  await expect(bank).toContainText('Pankkitili')
  await expect(bank).toContainText(eur('1 105,00'))
})

/**
 * Regression: http-engine locker save used to send an empty body (after a bogus
 * GET /api/books/server:…) → 400 empty_book.
 *
 * The connected same-origin locker stores objects via /api/objects (same shelf layout as
 * /api/books). Blob/XHR uploads may omit Content-Length and Playwright cannot read the binary
 * body, so we assert export size, the ledger upload status, and the shelf listing.
 */
test('http engine saves book to locker with a non-empty body', async ({ page }) => {
  await openBookHttpEngine(page)
  const name = `e2e-desktop-save-${Date.now()}.kitsas`

  const exportWait = page.waitForResponse(
    (res) => res.url().includes('/api/export') && res.request().method() === 'GET',
  )
  const uploadWait = page.waitForResponse((res) => {
    const method = res.request().method()
    if (method !== 'POST' && method !== 'PUT') return false
    return /\/api\/objects\/.+\/book\.kitsas$/.test(new URL(res.url()).pathname)
  })

  page.once('dialog', async (dialog) => {
    await dialog.accept(name)
  })
  await chooseFileMenu(page, 'Tallenna säilytykseen nimellä…')

  const exportRes = await exportWait
  expect(exportRes.status()).toBe(200)
  const exportBytes = await exportRes.body()
  expect(exportBytes.byteLength).toBeGreaterThan(1000)

  const uploadRes = await uploadWait
  expect(uploadRes.status(), `ledger upload failed: ${await uploadRes.text()}`).toBe(200)

  await expect(page.getByText('Tallennettu omaan säilytykseen.')).toBeVisible()

  // The shelf lists the book with a non-empty ledger.
  const listed = (await (await page.request.get('/api/books')).json()) as {
    books: { id: string; name: string; size: number }[]
  }
  const saved = listed.books.find((b) => b.name === name)
  expect(saved, JSON.stringify(listed.books.map((b) => b.name))).toBeTruthy()
  expect(saved!.size).toBeGreaterThan(1000)

  await chooseFileMenu(page, 'Avaa omasta säilytyksestä…')
  await expect(page.getByRole('heading', { name: 'Oma säilytys (BYO)' })).toBeVisible()
  await expect(lockerBookRow(page, name)).toBeVisible()
})
