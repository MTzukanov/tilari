import { expect, test } from '@playwright/test'
import { openBookHttpEngine } from './helpers'
import {
  ALLOCATION_CHANGE,
  addCostCentre,
  BOOK_SAVED_LOCKER,
  changeCompanyName,
  closeSessionChangesPanel,
  createExpenseVoucher,
  expectDirtyStatus,
  expectSessionPanelRows,
  expectUnsavedBadge,
  expectUnsavedIcons,
  openSessionChangesPanel,
  saveBookToLocker,
  SETTINGS_CHANGE,
  VOUCHER_CREATE,
} from './sessionChanges.helpers'

test.describe('session changes (http)', () => {
  test('logs three consecutive changes before save', async ({ page }) => {
    await openBookHttpEngine(page)
    await expect(page.getByText('Palvelinistunto')).toBeVisible()
    await expectUnsavedBadge(page, 0)
    await expectDirtyStatus(page, false)

    await changeCompanyName(page, 'Testikirja HTTP-1')
    await expectUnsavedBadge(page, 1)
    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [SETTINGS_CHANGE])
    await closeSessionChangesPanel(page)

    await addCostCentre(page, 'E2E-KP-1')
    await expectUnsavedBadge(page, 2)
    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [`${ALLOCATION_CHANGE} E2E-KP-1`, SETTINGS_CHANGE])
    await closeSessionChangesPanel(page)

    await createExpenseVoucher(page, { title: 'E2E-kulu', amount: '10' })
    await expectUnsavedBadge(page, 3)
    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [
      `${VOUCHER_CREATE}`,
      `${ALLOCATION_CHANGE} E2E-KP-1`,
      SETTINGS_CHANGE,
    ])
    await expect(page.locator('.session-changes-list .session-changes-label').nth(0)).toContainText(
      'E2E-kulu',
    )
    await expectUnsavedIcons(page, 3)
    await closeSessionChangesPanel(page)

    await expectDirtyStatus(page, true)
  })

  test('open, edit, see changes, save, edit again', async ({ page }) => {
    await openBookHttpEngine(page)
    await expect(page.getByText('Palvelinistunto')).toBeVisible()
    await expectUnsavedBadge(page, 0)
    await expectDirtyStatus(page, false)

    await changeCompanyName(page, 'Testikirja HTTP-1')
    await expect(page.getByLabel('Nimi', { exact: true })).toHaveValue('Testikirja HTTP-1')
    await expectDirtyStatus(page, true)
    await expectUnsavedBadge(page, 1)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 1)
    await closeSessionChangesPanel(page)

    await saveBookToLocker(page)
    await expectDirtyStatus(page, false)
    await expectUnsavedBadge(page, 0)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [BOOK_SAVED_LOCKER, SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 0)
    await closeSessionChangesPanel(page)

    await changeCompanyName(page, 'Testikirja HTTP-2')
    await expect(page.getByLabel('Nimi', { exact: true })).toHaveValue('Testikirja HTTP-2')
    await expectDirtyStatus(page, true)
    await expectUnsavedBadge(page, 1)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [SETTINGS_CHANGE, BOOK_SAVED_LOCKER, SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 1)
  })
})
