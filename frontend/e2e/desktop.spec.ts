import { expect, test } from '@playwright/test'
import { eur, openBook, openBookHttpEngine, openReports2024, selectYear } from './helpers'

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
 * Regression: http-engine locker save used to POST /api/books with an
 * empty body (after a bogus GET /api/books/server:…) → 400 empty_book.
 *
 * Blob/XHR uploads often omit Content-Length (chunked) and Playwright cannot read
 * the binary body, so we assert export size, POST status, and locker listing.
 * Primary save for a server session is the file menu (no Tallenna button until
 * the book is already in the locker).
 */
test('http engine saves book to locker with a non-empty body', async ({ page }) => {
  await openBookHttpEngine(page)

  const exportWait = page.waitForResponse(
    (res) => res.url().includes('/api/export') && res.request().method() === 'GET',
  )
  const postWait = page.waitForResponse((res) => {
    if (res.request().method() !== 'POST') return false
    const u = res.url()
    return /\/api\/books\/?$/.test(new URL(u).pathname)
  })

  page.once('dialog', async (dialog) => {
    await dialog.accept(`e2e-desktop-save-${Date.now()}.kitsas`)
  })
  await page.getByLabel('Kirjanpitotiedosto').selectOption({ label: 'Tallenna säilytykseen nimellä…' })

  const exportRes = await exportWait
  expect(exportRes.status()).toBe(200)
  const exportBytes = await exportRes.body()
  expect(exportBytes.byteLength).toBeGreaterThan(1000)

  const postRes = await postWait
  const postBody = await postRes.text()
  expect(postRes.status(), `locker POST failed: ${postBody}`).toBe(200)
  const saved = JSON.parse(postBody) as { id: string; name: string; sha256: string; size: number }
  expect(saved.id).toBeTruthy()
  expect(saved.sha256).toBeTruthy()
  expect(saved.size).toBeGreaterThan(1000)
  expect(saved.name).toMatch(/\.kitsas$/i)

  await expect(page.getByText('Tallennettu omaan säilytykseen.')).toBeVisible()

  // Round-trip: lean download from locker matches stored size
  const getRes = await page.request.get(`/api/books/${saved.id}`)
  expect(getRes.status()).toBe(200)
  const stored = await getRes.body()
  expect(stored.byteLength).toBe(saved.size)

  await page.getByLabel('Kirjanpitotiedosto').selectOption({ label: 'Avaa omasta säilytyksestä…' })
  await expect(page.getByRole('heading', { name: 'Oma säilytys (BYO)' })).toBeVisible()
  await expect(page.getByRole('button', { name: saved.name })).toBeVisible()
})
