import { expect, type Page } from '@playwright/test'

export const SETTINGS_CHANGE = 'Muokattiin yrityksen asetuksia'
export const ALLOCATION_CHANGE = 'Muokattiin kohdennus'
export const VOUCHER_CREATE = 'Luotiin tosite'
export const BOOK_SAVED_LOCKER = 'Tallennettu omaan säilytykseen'
export const BOOK_SAVED_DISK = 'Tallennettu tiedostoon'

export async function openSessionChangesPanel(page: Page) {
  await page.getByRole('button', { name: 'Muutokset' }).click()
  await expect(page.getByRole('dialog', { name: 'Muutokset tässä istunnossa' })).toBeVisible()
}

export async function closeSessionChangesPanel(page: Page) {
  await page.locator('.topbar-home').click()
}

export async function expectUnsavedBadge(page: Page, count: number) {
  const toggle = page.getByRole('button', { name: 'Muutokset' })
  const badge = toggle.locator('.session-changes-count')
  const timeout = count === 0 ? 15_000 : 5_000
  if (count === 0) {
    await expect(badge).toHaveCount(0, { timeout })
    return
  }
  await expect(badge).toHaveText(String(count), { timeout })
}

export async function expectDirtyStatus(page: Page, dirty: boolean) {
  if (dirty) {
    await expect(page.locator('.status-dirty')).toBeVisible()
    await expect(page.locator('.status-clean')).toHaveCount(0)
  } else {
    await expect(page.locator('.status-clean')).toBeVisible()
    await expect(page.locator('.status-dirty')).toHaveCount(0)
  }
}

export async function expectPrimarySaveEnabled(page: Page, enabled: boolean) {
  const save = page.locator('.save-btn')
  if (enabled) {
    await expect(save).toBeEnabled()
  } else {
    await expect(save).toBeDisabled()
  }
}

export async function changeCompanyName(page: Page, name: string) {
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible()
  const nameInput = page.getByLabel('Nimi', { exact: true })
  await nameInput.clear()
  await nameInput.fill(name)
  await expect(nameInput).toHaveValue(name)
  await page.locator('form.editor-card').getByRole('button', { name: 'Tallenna' }).click()
  await expect(page.getByText('Asetukset tallennettu')).toBeVisible()
}

export async function addCostCentre(page: Page, name: string) {
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible()
  await page.getByLabel('Uusi kustannuspaikka', { exact: true }).fill(name)
  await page.locator('form.filters').getByRole('button', { name: 'Lisää' }).click()
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible()
}

export async function createExpenseVoucher(
  page: Page,
  opts: { title: string; amount: string; expenseAccount?: string },
) {
  const expenseAccount = opts.expenseAccount ?? '4000'
  await page.goto('/#/voucher/new/100')
  await expect(page.getByLabel('Otsikko')).toBeVisible()
  await page.getByLabel('Otsikko').fill(opts.title)
  const expense = page.getByLabel('Menotili')
  await expect(expense).toBeVisible({ timeout: 30_000 })
  await expense.click()
  await page.getByRole('option', { name: new RegExp(`^${expenseAccount} `) }).click()
  await page.getByLabel('Määrä', { exact: true }).fill(opts.amount)
  await page.getByRole('button', { name: 'Valmis' }).click()
  await expect(page.getByRole('heading', { name: opts.title })).toBeVisible()
}

export async function expectSessionPanelRows(page: Page, labels: string[]) {
  const items = page.locator('.session-changes-list .session-changes-label')
  await expect(items).toHaveCount(labels.length)
  for (let i = 0; i < labels.length; i += 1) {
    await expect(items.nth(i)).toContainText(labels[i]!)
  }
}

export async function expectUnsavedIcons(page: Page, unsavedCount: number) {
  await expect(page.locator('.session-changes-icon-unsaved')).toHaveCount(unsavedCount)
}

export async function stubBrowserSavePicker(page: Page) {
  await page.evaluate(() => {
    const mockWritable = {
      write: async () => undefined,
      close: async () => undefined,
    }
    const mockHandle = {
      createWritable: async () => mockWritable,
      getFile: async () => new File([new Uint8Array([1])], 'tilari-test.kitsas'),
      requestPermission: async () => 'granted' as PermissionState,
    }
    window.showSaveFilePicker = async () => mockHandle as FileSystemFileHandle
    window.showOpenFilePicker = async () => [mockHandle as FileSystemFileHandle]
  })
}

/** Wasm/browser engine: primary save uses linked file or showSaveFilePicker. */
export async function saveBookInBrowser(page: Page) {
  await stubBrowserSavePicker(page)
  await page.locator('.save-btn').click()
  await expect(page.locator('.status-clean')).toBeVisible({ timeout: 15_000 })
}

/** Http session engine: first save goes through the file menu. */
export async function saveBookToLocker(page: Page, name = `e2e-session-${Date.now()}.kitsas`) {
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt')
    await dialog.accept(name)
  })
  await page.getByLabel('Kirjanpitotiedosto').selectOption({ label: 'Tallenna säilytykseen nimellä…' })
  await expect(page.getByText('Tallennettu omaan säilytykseen.')).toBeVisible({ timeout: 60_000 })
}
