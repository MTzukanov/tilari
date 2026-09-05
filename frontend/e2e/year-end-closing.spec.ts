import { expect, test, type Page } from '@playwright/test'
import { openBook, skipWebkitOpfs } from './helpers'
import { deleteOpenVoucher, expectTaxVoucherEditor } from './periodEnd.helpers'
import { expectDirtyStatus, saveBookInBrowser } from './sessionChanges.helpers'

async function openClosingWizard2024(page: Page) {
  await page.goto('/#/fiscal-periods')
  await expect(page.getByRole('heading', { name: 'Tilikaudet' })).toBeVisible()
  await page.getByRole('row', { name: /1\.1\.2024/ }).click()
  await page.getByRole('button', { name: 'Tilinpäätös…' }).click()
  const wizard = page.getByRole('dialog', { name: /Tilinpäätöksen laatiminen/ })
  await expect(wizard).toBeVisible()
  return wizard
}

test.describe('year-end closing', () => {
  test('deleting 9930 then opening the wizard does not dirty the book', async ({
    page,
    browserName,
  }) => {
    skipWebkitOpfs(browserName)
    test.setTimeout(90_000)
    await openBook(page)
    await expectDirtyStatus(page, false)

    const wizard = await openClosingWizard2024(page)
    await wizard.getByRole('button', { name: 'Laske tulovero…' }).click()

    const tax = page.getByRole('dialog', { name: 'Tuloveron laskeminen' })
    await expect(tax).toBeVisible()
    await tax.getByRole('button', { name: 'Kirjaa tosite' }).click()
    await expect(tax.getByRole('button', { name: 'Avaa tosite' })).toBeVisible({ timeout: 15_000 })
    await expectDirtyStatus(page, true)

    await tax.getByRole('button', { name: 'Avaa tosite' }).click()
    await expectTaxVoucherEditor(page)

    await deleteOpenVoucher(page)
    const afterDelete = page.getByRole('dialog', { name: /Tilinpäätöksen laatiminen/ })
    await expect(afterDelete).toBeVisible()
    await expectDirtyStatus(page, true)
    await afterDelete.getByRole('button', { name: 'Sulje' }).click()
    await expect(page.getByRole('heading', { name: 'Tilikaudet' })).toBeVisible()

    await saveBookInBrowser(page)
    await expectDirtyStatus(page, false)

    const again = await openClosingWizard2024(page)
    await expectDirtyStatus(page, false)
    await expect(again.getByRole('button', { name: 'Laske tulovero…' })).toBeVisible()
    await expect(again.getByRole('button', { name: 'Näytä tuloverolaskelma…' })).toHaveCount(0)
  })
})
