import { expect, test } from '@playwright/test'
import { openBook } from './helpers'

test.describe('rental objects', () => {
  test('setup links a cost centre and the object page shows its figures', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/properties')
    await expect(page.getByRole('heading', { name: 'Vuokrakohteet' })).toBeVisible()
    await expect(page.getByText(/kustannuspaikkaa odottaa määritystä/)).toBeVisible()

    await page.getByRole('button', { name: 'Määritä kohteet' }).first().click()
    await expect(page.getByRole('heading', { name: 'Vuokrakohteiden määritys' })).toBeVisible()
    // The golden book has no share items; mark "Toimisto" as not a rental object.
    await page.getByRole('row', { name: /Toimisto/ }).getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: 'Tallenna määritys' }).click()

    await expect(page.getByRole('heading', { name: 'Vuokrakohteet' })).toBeVisible()
    await expect(page.getByText(/odottaa määritystä/)).toBeHidden()
    await expect(page.getByRole('row', { name: /Toimisto/ })).toBeHidden()

    await page.getByRole('row', { name: /Asunto/ }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(page.getByRole('heading', { name: 'Asunto' })).toBeVisible()
    await expect(page.getByText('Hankintamenoa ei ole linkitetty', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tilikausittain' })).toBeVisible()

    await page.getByRole('button', { name: 'Muokkaa kohdetta' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit$/)
    await page.getByLabel('Laji').selectOption({ label: 'Asunto' })
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(page.locator('.property-detail .lede')).toContainText('Asunto')
  })
})
