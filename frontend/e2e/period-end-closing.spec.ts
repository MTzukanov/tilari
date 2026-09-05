import { expect, test, type Page } from '@playwright/test'
import { openBook, openPeriodEndBook, skipWebkitOpfs } from './helpers'
import { expectDirtyStatus, saveBookInBrowser } from './sessionChanges.helpers'
import {
  acceptNextDialog,
  dismissDialog,
  expectStepDone,
  expectStepOpen,
  openClosingWizard,
  stepRow,
} from './periodEnd.helpers'

async function openClosingWizard2024(page: Page) {
  return openClosingWizard(page)
}

test.describe('period-end closing', () => {
  test.beforeEach(({ browserName }) => {
    skipWebkitOpfs(browserName)
  })

  test('full wizard: depreciation, accrual, tax, lock, notes, confirm', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await openPeriodEndBook(page)
    await expectDirtyStatus(page, false)

    const wizard = await openClosingWizard2024(page)

    // Checklist shows all preparatory steps with action buttons where applicable.
    await expect(stepRow(wizard, 'Tee poistokirjaukset')).toBeVisible()
    await expect(stepRow(wizard, 'Tee tilinpäätösjaksotukset')).toBeVisible()
    await expect(stepRow(wizard, 'Laske ja kirjaa tulovero')).toBeVisible()
    await expect(stepRow(wizard, 'Lukitse kirjanpito')).toBeVisible()
    await expect(stepRow(wizard, 'Laadi liitetiedot')).toBeVisible()
    await expect(stepRow(wizard, 'Tulosta tilinpäätös')).toBeVisible()
    await expect(stepRow(wizard, 'Vahvista tilinpäätös')).toBeVisible()

    // --- Tulovero first (positive tulos before poistot/jaksotukset inflate kulut) ---
    await expectStepOpen(wizard, 'Laske ja kirjaa tulovero')
    await wizard.getByRole('button', { name: 'Laske tulovero…' }).click()
    let tax = page.getByRole('dialog', { name: 'Tuloveron laskeminen' })
    await expect(tax).toBeVisible()
    await expect(tax.getByText('Tilit laskelmassa')).toBeVisible()
    await expect(tax.getByText('Veronalainen tulo (C, CL)')).toBeVisible()

    await tax.getByRole('button', { name: 'Tallenna luonnos' }).click()
    await expect(tax).toHaveCount(0, { timeout: 15_000 })

    await wizard.getByRole('button', { name: 'Laske tulovero…' }).click()
    tax = page.getByRole('dialog', { name: 'Tuloveron laskeminen' })
    await expect(tax.getByRole('heading', { name: 'Tallennettu laskelma' })).toBeVisible()
    await tax.getByRole('button', { name: 'Poista laskelma' }).click()
    await expect(tax).toHaveCount(0, { timeout: 15_000 })

    await wizard.getByRole('button', { name: 'Laske tulovero…' }).click()
    tax = page.getByRole('dialog', { name: 'Tuloveron laskeminen' })
    await expect(tax.getByRole('heading', { name: 'Tallennettu laskelma' })).toHaveCount(0)
    await tax.getByRole('button', { name: 'Kirjaa tosite' }).click()
    await expect(tax.getByRole('button', { name: 'Avaa tosite' })).toBeVisible({ timeout: 15_000 })

    await tax.getByRole('button', { name: 'Avaa tosite' }).click()
    await expect(page.getByRole('heading', { name: /Tuloveron jaksotus/ })).toBeVisible()
    await acceptNextDialog(page)
    await page.getByRole('button', { name: 'Poista' }).click()
    await expect(wizard).toBeVisible()
    await expectStepOpen(wizard, 'Laske ja kirjaa tulovero')
    await expect(wizard.getByRole('button', { name: 'Laske tulovero…' })).toBeVisible()
    await expect(wizard.getByRole('button', { name: 'Näytä tuloverolaskelma…' })).toHaveCount(0)

    await wizard.getByRole('button', { name: 'Sulje' }).click()
    await expect(page.getByRole('heading', { name: 'Tilikaudet' })).toBeVisible()
    await saveBookInBrowser(page)
    await expectDirtyStatus(page, false)
    let again = await openClosingWizard2024(page)
    await expectDirtyStatus(page, false)
    await expect(again.getByRole('button', { name: 'Laske tulovero…' })).toBeVisible()

    await again.getByRole('button', { name: 'Laske tulovero…' }).click()
    tax = page.getByRole('dialog', { name: 'Tuloveron laskeminen' })
    await tax.getByRole('button', { name: 'Kirjaa tosite' }).click()
    await expect(tax.getByRole('button', { name: 'Avaa tosite' })).toBeVisible({ timeout: 15_000 })
    await dismissDialog(page, 'Tuloveron laskeminen')
    await expectStepDone(again, 'Laske ja kirjaa tulovero')
    await expect(again.getByRole('button', { name: 'Näytä tuloverolaskelma…' })).toBeVisible()

    // --- Poistot (9910) ---
    await expectStepOpen(again, 'Tee poistokirjaukset')
    await again.getByRole('button', { name: 'Laske poistot…' }).click()
    const depreciation = page.getByRole('dialog', { name: 'Poistolaskelma' })
    await expect(depreciation).toBeVisible()
    await expect(depreciation.getByRole('row', { name: /1179/ })).toBeVisible()
    await expect(depreciation.getByRole('cell', { name: '25 %' })).toBeVisible()
    await dismissDialog(page, /Poistolaskelma/)
    await expect(depreciation).toHaveCount(0)

    await again.getByRole('button', { name: 'Laske poistot…' }).click()
    await expect(page.getByRole('dialog', { name: 'Poistolaskelma' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Poistolaskelma' }).getByRole('button', { name: 'Kirjaa' }).click()
    await expect(page.getByRole('dialog', { name: 'Poistolaskelma' })).toHaveCount(0, {
      timeout: 15_000,
    })
    await expectStepDone(again, 'Tee poistokirjaukset')
    await expect(again.getByRole('button', { name: 'Laske poistot…' })).toHaveCount(0)

    // --- Jaksotukset (9920) ---
    await expectStepOpen(again, 'Tee tilinpäätösjaksotukset')
    await again.getByRole('button', { name: 'Laske jaksotukset…' }).click()
    const accrual = page.getByRole('dialog', { name: 'Tilinpäätösjaksotukset' })
    await expect(accrual).toBeVisible()
    await expect(accrual.getByRole('row', { name: /Vakuutus/ })).toBeVisible()
    await accrual.getByRole('button', { name: 'Kirjaa' }).click()
    await expect(accrual).toHaveCount(0, { timeout: 15_000 })
    await expectStepDone(again, 'Tee tilinpäätösjaksotukset')
    await expect(again.getByRole('button', { name: 'Laske jaksotukset…' })).toHaveCount(0)

    // --- Lukitus ---
    await expectStepOpen(again, 'Lukitse kirjanpito')
    await again.getByRole('button', { name: 'Lukitse', exact: true }).click()
    await expect(again.getByText(/Kirjanpito on lukittu tähän tilikauteen/)).toBeVisible({
      timeout: 15_000,
    })
    await expectStepDone(again, 'Lukitse kirjanpito')
    await expect(again.getByRole('button', { name: 'Laske poistot…' })).toHaveCount(0)
    await expect(again.getByRole('button', { name: 'Purka lukitus' })).toBeVisible()

    // --- Notes (liitetiedot) ---
    await again.getByRole('button', { name: 'Laadi liitetiedot…' }).click()
    const notesStart = page.getByRole('dialog', { name: 'Liitetietojen laatiminen' })
    await expect(notesStart).toBeVisible()
    await notesStart.getByRole('radio', { name: 'Pienyritys' }).check()
    await notesStart.getByRole('button', { name: 'Luo liitetiedot' }).click()
    const notesEdit = page.getByRole('dialog', { name: 'Liitetiedot' })
    await expect(notesEdit).toBeVisible({ timeout: 30_000 })
    await expect(notesEdit.locator('.tp-editor')).not.toBeEmpty()
    await notesEdit.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(notesEdit).toHaveCount(0, { timeout: 15_000 })
    await expectStepDone(again, 'Laadi liitetiedot')
    await expect(again.getByRole('button', { name: 'Muokkaa liitetietoja…' })).toBeVisible()

    // --- Tulostus + HTML-lataus ---
    const popupPromise = page.waitForEvent('popup')
    await again.getByRole('button', { name: 'Avaa tulostettava…' }).click()
    const printPage = await popupPromise
    await expect(printPage.locator('body')).toContainText(/TILINPÄÄTÖS/i, { timeout: 15_000 })
    await printPage.close()

    const downloadPromise = page.waitForEvent('download')
    await again.getByRole('button', { name: 'Lataa HTML' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('statement-2024-12-31.html')

    // --- Vahvistus ja peruutus ---
    await expect(again.getByRole('button', { name: 'Vahvista' })).toBeEnabled()
    await again.getByRole('button', { name: 'Vahvista' }).click()
    await expect(again.getByText(/Tilinpäätös on vahvistettu/)).toBeVisible({ timeout: 15_000 })
    await expectStepDone(again, 'Vahvista tilinpäätös')
    await expect(again.getByRole('button', { name: 'Laadi liitetiedot…' })).toHaveCount(0)

    await again.getByRole('button', { name: 'Peru vahvistus' }).click()
    await expect(again.getByText(/Tilinpäätös on vahvistettu/)).toHaveCount(0, { timeout: 15_000 })
    await expect(again.getByRole('button', { name: 'Vahvista' })).toBeVisible()

    await again.getByRole('button', { name: 'Purka lukitus' }).click()
    await expect(again.getByText(/Kirjanpito on lukittu tähän tilikauteen/)).toHaveCount(0, {
      timeout: 15_000,
    })
    await expect(again.getByRole('button', { name: 'Lukitse', exact: true })).toBeVisible()

    await again.getByRole('button', { name: 'Sulje' }).click()
    await expect(page.getByRole('heading', { name: 'Tilikaudet' })).toBeVisible()
  })

  test('deleting 9930 then opening the wizard does not dirty the book', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: /Tuloveron jaksotus/ })).toBeVisible()

    await acceptNextDialog(page)
    await page.getByRole('button', { name: 'Poista' }).click()
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
