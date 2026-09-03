import { expect, type Locator, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearTilariStorage, confirmEngineOpen, eur } from './helpers'

async function acceptNextDialog(page: Page) {
  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const vatBook = path.join(repoRoot, 'testdb', 'tilari-vat.kitsas')
export const vatForceBook = path.join(repoRoot, 'testdb', 'tilari-vat-force.kitsas')
export const vatAccrualBook = path.join(repoRoot, 'testdb', 'tilari-vat-accrual.kitsas')

export { eur }

async function openKitsas(page: Page, bookPath: string) {
  await clearTilariStorage(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ei kirjaa auki' })).toBeVisible()
  await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(bookPath)
  await confirmEngineOpen(page, 'wasm')
  await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
    timeout: 60_000,
  })
}

export async function openVatBook(page: Page) {
  await openKitsas(page, vatBook)
}

export async function openVatForceBook(page: Page) {
  await openKitsas(page, vatForceBook)
}

export async function openVatAccrualBook(page: Page) {
  await openKitsas(page, vatAccrualBook)
}

export async function gotoVat(page: Page) {
  await page.goto('/#/vat')
  await expect(page.getByRole('heading', { name: 'ALV', exact: true })).toBeVisible()
}

export function formatFiDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}.${Number(m)}.${y}`
}

export async function expectVatPeriod(page: Page, startIso: string, endIso: string) {
  const label = `${formatFiDate(startIso)} – ${formatFiDate(endIso)}`
  await expect(page.getByRole('group', { name: label })).toBeVisible()
}

export async function openDeclareDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Tee ALV-ilmoitus' }).click()
  const dialog = page.getByRole('dialog', { name: 'Arvonlisäveroilmoitus' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function confirmDeclare(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Arvonlisäveroilmoitus' })
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toHaveCount(0, { timeout: 30_000 })
}

export async function deleteCurrentVatVoucher(page: Page) {
  await expect(page.getByRole('button', { name: 'Poista' })).toBeVisible()
  await acceptNextDialog(page)
  await page.getByRole('button', { name: 'Poista' }).click()
  await expect(page.getByRole('heading', { name: 'ALV', exact: true })).toBeVisible({
    timeout: 15_000,
  })
}
