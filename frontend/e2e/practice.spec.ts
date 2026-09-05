import { expect, test } from '@playwright/test'
import { openBook } from './helpers'

test.describe('practice mode', () => {
  test('banner clock moves the year-end future warning', async ({ page }) => {
    test.setTimeout(90_000)
    await openBook(page)
    await expect(page.getByText(/harjoitus/)).toBeVisible()
    const banner = page.locator('.practice-banner')
    await expect(banner).toBeVisible()
    await expect(banner.getByText('Harjoittelutila käytössä')).toBeVisible()
    const date = banner.getByLabel('Päivämäärä')
    await expect(date).toBeVisible()

    await page.goto('/#/fiscal-periods/2025-12-31/closing')
    const wizard = page.getByRole('dialog', { name: /Tilinpäätöksen laatiminen/ })
    await expect(wizard).toBeVisible()

    await date.fill('2025-06-01')
    await expect(wizard.getByText(/Tilikausi on vielä kesken/)).toBeVisible()

    await date.fill('2026-01-01')
    await expect(page.getByRole('dialog', { name: /Tilinpäätöksen laatiminen/ })).toBeVisible()
    await expect(page.getByText(/Tilikausi on vielä kesken/)).toHaveCount(0)
  })

  test('settings can toggle harjoituskirjanpito', async ({ page }) => {
    test.setTimeout(90_000)
    await openBook(page)
    await page.goto('/#/settings')
    const box = page.getByRole('checkbox', { name: /Harjoituskirjanpito/ })
    await expect(box).toBeChecked()
    page.once('dialog', (dialog) => dialog.accept())
    await box.uncheck()
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page.locator('.practice-banner')).toHaveCount(0)
    await expect(page.locator('.topbar-company .lede')).not.toContainText('harjoitus')
    await expect(page.getByRole('checkbox', { name: 'Harjoituskirjanpito' })).not.toBeChecked()
  })
})
