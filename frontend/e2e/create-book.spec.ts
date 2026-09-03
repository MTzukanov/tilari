import { expect, test } from '@playwright/test'
import { clearTilariStorage, skipWebkitOpfs } from './helpers'

test.describe('create a new book', () => {
  test.beforeEach(({ browserName }) => {
    skipWebkitOpfs(browserName)
  })

  test('empty state creates a wasm working copy', async ({ page }) => {
    test.setTimeout(90_000)
    await clearTilariStorage(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
    await page.getByRole('button', { name: 'Luo uusi kirja…' }).click()
    await expect(page.getByRole('dialog', { name: 'Uusi kirjanpito' })).toBeVisible()
    await page.getByLabel('Nimi', { exact: true }).fill('Uusi Testi Oy')
    await page.getByLabel('Y-tunnus').fill('1234567-1')
    await page.getByRole('button', { name: 'Luo kirja' }).click()
    await expect(page.getByRole('heading', { name: 'Uusi Testi Oy' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText('1234567-1')).toBeVisible()
    await page.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Uusi Testi Oy' })).toBeVisible()
  })
})
