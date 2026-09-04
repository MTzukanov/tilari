import { expect, test } from '@playwright/test'
import { clearTilariStorage, openBook } from './helpers'

test.describe('first-run language', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('asks for a language and stores it', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Valitse kieli')).toBeVisible()
    await expect(dialog.getByText('Välj språk')).toBeVisible()
    await expect(dialog.getByText('Choose language')).toBeVisible()
    await expect(dialog.getByText('Sprache wählen')).toBeVisible()
    await page.getByRole('button', { name: 'English' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No book open' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tilari.locale'))).toBe('en')

    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No book open' })).toBeVisible()
  })
})

test('settings language select switches the UI', async ({ page }) => {
  await openBook(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible()
  await page.getByLabel('Kieli').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Browse', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tilari.locale'))).toBe('en')
})

test('app settings work without a book', async ({ page }) => {
  await clearTilariStorage(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toHaveCount(0)
  await expect(page.getByText('Avaa kirja muokataksesi')).toBeVisible()
  await page.getByLabel('Kieli').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Application' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Book' })).toBeVisible()
  await expect(page.getByText('Open a book to edit company settings')).toBeVisible()
  await page.getByRole('link', { name: 'Browser data…' }).click()
  await expect(page.getByRole('heading', { name: 'Browser data' })).toBeVisible()
})
