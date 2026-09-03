import { expect, test } from '@playwright/test'
import { openBook, skipWebkitOpfs } from './helpers'
import {
  BOOK_SAVED_DISK,
  changeCompanyName,
  closeSessionChangesPanel,
  expectDirtyStatus,
  expectPrimarySaveEnabled,
  expectSessionPanelRows,
  expectUnsavedBadge,
  expectUnsavedIcons,
  openSessionChangesPanel,
  saveBookInBrowser,
  SETTINGS_CHANGE,
} from './sessionChanges.helpers'

test.describe('session changes (wasm)', () => {
  test('open, edit, see changes, save, edit again', async ({ page, browserName }) => {
    skipWebkitOpfs(browserName)
    test.setTimeout(90_000)
    await openBook(page)
    await expectUnsavedBadge(page, 0)
    await expectDirtyStatus(page, false)
    await expectPrimarySaveEnabled(page, false)

    await changeCompanyName(page, 'Testikirja E2E-1')
    await expect(page.getByLabel('Nimi', { exact: true })).toHaveValue('Testikirja E2E-1')
    await expectDirtyStatus(page, true)
    await expectPrimarySaveEnabled(page, true)
    await expectUnsavedBadge(page, 1)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 1)
    await closeSessionChangesPanel(page)

    await saveBookInBrowser(page)
    await expectDirtyStatus(page, false)
    await expectPrimarySaveEnabled(page, false)
    await expectUnsavedBadge(page, 0)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [BOOK_SAVED_DISK, SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 0)
    await closeSessionChangesPanel(page)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Testikirja E2E-1' })).toBeVisible({
      timeout: 60_000,
    })
    await expectDirtyStatus(page, false)
    await expectPrimarySaveEnabled(page, false)
    await expectUnsavedBadge(page, 0)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [BOOK_SAVED_DISK, SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 0)
    await closeSessionChangesPanel(page)

    await changeCompanyName(page, 'Testikirja E2E-2')
    await expect(page.getByLabel('Nimi', { exact: true })).toHaveValue('Testikirja E2E-2')
    await expectDirtyStatus(page, true)
    await expectPrimarySaveEnabled(page, true)
    await expectUnsavedBadge(page, 1)

    await openSessionChangesPanel(page)
    await expectSessionPanelRows(page, [SETTINGS_CHANGE, BOOK_SAVED_DISK, SETTINGS_CHANGE])
    await expectUnsavedIcons(page, 1)
  })
})
