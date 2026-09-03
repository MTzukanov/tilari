import { expect, test } from '@playwright/test'
import { clearTilariStorage, openBook, skipWebkitOpfs } from './helpers'

test.describe('browser storage settings', () => {
  test.beforeEach(({ browserName }) => {
    skipWebkitOpfs(browserName)
  })

  test('lists Tilari data and can wipe it', async ({ page }) => {
    test.setTimeout(90_000)
    await openBook(page)
    await page.goto('/#/settings')
    await page.getByRole('link', { name: 'Näytä selaimen tiedot' }).click()
    await expect(page.getByRole('heading', { name: 'Selaimen tiedot' })).toBeVisible()
    const filesToggle = page
      .locator('.storage-book-files')
      .filter({ has: page.locator('code', { hasText: 'working.kitsas' }) })
      .locator('summary')
    await expect(filesToggle).toBeVisible({ timeout: 30_000 })
    const working = page.locator('code').filter({ hasText: 'working.kitsas' })
    await expect(working).toBeHidden()
    await filesToggle.click()
    await expect(working).toBeVisible()
    await expect(page.getByText('tilari.engine')).toBeVisible()

    const engineRow = page.getByRole('row', { name: /tilari\.engine/ })
    await engineRow.getByRole('button', { name: 'Poista' }).click()
    await expect(page.getByText('tilari.engine')).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Tyhjennä kaikki' }).click()
    await page.getByRole('button', { name: 'Suomi' }).click()
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  })

  test('storage page is available without a book', async ({ page }) => {
    await clearTilariStorage(page)
    await page.goto('/#/settings/storage')
    await expect(page.getByRole('heading', { name: 'Selaimen tiedot' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toHaveCount(0)
    await expect(page.getByText('Ei paikallista työkopiota.')).toBeVisible()
  })
})
