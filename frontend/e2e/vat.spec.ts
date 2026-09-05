import { expect, test } from '@playwright/test'
import { expectDirtyStatus } from './sessionChanges.helpers'
import {
  confirmDeclare,
  deleteCurrentVatVoucher,
  eur,
  expectVatPeriod,
  expectVatVoucherOpen,
  formatFiDate,
  gotoVat,
  openDeclareDialog,
  openVatAccrualBook,
  openVatBook,
  openVatForceBook,
} from './vat.helpers'

test.describe('VAT returns', () => {
  test('accrual + cash parked: preview, declare, delete, redeclare', async ({ page }) => {
    test.setTimeout(180_000)
    await openVatBook(page)
    await expectDirtyStatus(page, false)
    await gotoVat(page)

    await expectVatPeriod(page, '2024-01-01', '2024-01-31')
    await expect(page.locator('.vat-new-meta')).toContainText('Maksuperusteinen ALV')
    await expect(page.getByRole('button', { name: 'Tee ALV-ilmoitus' })).toBeEnabled()

    // Accrual tax in box 301; parked cash sale listed but not in Maksettava from 418.
    await expect(page.getByRole('row', { name: /301/ })).toContainText(eur('25,50'))
    await expect(page.getByText(/kohdentamaton/)).toBeVisible()
    await expect(page.locator('tfoot')).toContainText(eur('25,50'))

    const dialog = await openDeclareDialog(page)
    await expect(dialog.locator('iframe.vat-dialog-frame')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Tulosta' })).toBeEnabled()
    // Avoid frame.contentWindow.print() in headless — it can tear down the wasm session.
    await dialog.getByRole('button', { name: 'Peru' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible()

    await openDeclareDialog(page)
    await confirmDeclare(page)

    // Opens the type-9100 voucher with HTML attachment.
    await expectVatVoucherOpen(page)
    await expect(page.getByRole('row', { name: /ALV myynnit/ }).first()).toBeVisible()
    await expectDirtyStatus(page, true)

    await deleteCurrentVatVoucher(page)
    await expectVatPeriod(page, '2024-01-01', '2024-01-31')
    await expect(page.getByRole('button', { name: 'Tee ALV-ilmoitus' })).toBeEnabled()
    await expect(page.getByText('Ei aiempia ilmoituksia.')).toBeVisible()

    await openDeclareDialog(page)
    await confirmDeclare(page)
    await expect(page.getByRole('link', { name: 'alv.html' })).toBeVisible()

    await page.getByRole('button', { name: 'Sulje' }).click()
    await expectVatPeriod(page, '2024-02-01', '2024-02-29')
    await expect(page.getByRole('heading', { name: 'Annetut ALV-ilmoitukset' })).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(formatFiDate('2024-01-01')) })).toBeVisible()
  })

  test('cash payment realizes VAT; refund clears parked before declare', async ({ page }) => {
    test.setTimeout(240_000)
    await openVatBook(page)
    await gotoVat(page)

    // File January so next open is February.
    await expectVatPeriod(page, '2024-01-01', '2024-01-31')
    await openDeclareDialog(page)
    await confirmDeclare(page)
    await gotoVat(page)

    // February: accrual purchase (input) + cash invoice that was credited → no open parked payable.
    await expectVatPeriod(page, '2024-02-01', '2024-02-29')
    await expect(page.getByRole('row', { name: /307/ })).toContainText(eur('25,50'))
    // Net payable: input 25,50 → refund (maksettava negative / palautus).
    await expect(page.locator('tfoot')).toContainText(eur('-25,50'))

    await openDeclareDialog(page)
    await confirmDeclare(page)
    await gotoVat(page)

    // March: payment of January cash invoice → box 301 = 51,00; stale parked still open.
    await expectVatPeriod(page, '2024-03-01', '2024-03-31')
    await expect(page.getByRole('row', { name: /301/ })).toContainText(eur('51,00'))
    await expect(page.getByText(/kohdentamaton/)).toBeVisible()
    await expect(page.locator('tfoot')).toContainText(eur('51,00'))

    await openDeclareDialog(page)
    await confirmDeclare(page)
    await expectVatVoucherOpen(page)
    await expect(page.getByRole('row', { name: /ALV myynnit/ }).first()).toBeVisible()
    await expect(page.getByRole('row', { name: eur('51,00') }).first()).toBeVisible()
  })

  test('12-month force-realize on declare', async ({ page }) => {
    test.setTimeout(120_000)
    await openVatForceBook(page)
    await gotoVat(page)

    await expectVatPeriod(page, '2025-03-01', '2025-03-31')
    await expect(page.locator('.vat-new-meta')).toContainText('Maksuperusteinen ALV')
    // Preview before declare may show empty boxes; force lines appear only on OK.
    await openDeclareDialog(page)
    await confirmDeclare(page)

    await expectVatVoucherOpen(page)
    await expect(page.getByRole('row', { name: /Vanhentunut maksuperusteinen/ }).first()).toBeVisible()
    await expect(page.getByRole('row', { name: eur('12,75') }).first()).toBeVisible()

    await gotoVat(page)
    await expect(page.getByRole('row', { name: new RegExp(formatFiDate('2025-03-01')) })).toBeVisible()
  })

  test('non-cash-basis book: declare without cash-basis label', async ({ page }) => {
    test.setTimeout(120_000)
    await openVatAccrualBook(page)
    await gotoVat(page)

    await expectVatPeriod(page, '2024-01-01', '2024-01-31')
    await expect(page.locator('.vat-new-meta')).not.toContainText('Maksuperusteinen ALV')
    await expect(page.getByRole('row', { name: /301/ })).toContainText(eur('25,50'))
    await expect(page.getByText(/kohdentamaton/)).toHaveCount(0)

    await openDeclareDialog(page)
    await confirmDeclare(page)
    await expectVatVoucherOpen(page)
    await expect(page.getByRole('row', { name: /Vanhentunut/ })).toHaveCount(0)

    await deleteCurrentVatVoucher(page)
    await expect(page.getByRole('button', { name: 'Tee ALV-ilmoitus' })).toBeEnabled()
  })
})
