import { expect, type Locator, type Page } from '@playwright/test'

export const PERIOD_ENDS = '2024-12-31'

export async function openClosingWizard(page: Page, _ends = PERIOD_ENDS) {
  await page.goto('/#/fiscal-periods')
  await expect(page.getByRole('heading', { name: 'Tilikaudet' })).toBeVisible()
  await page.getByRole('row', { name: /1\.1\.2024/ }).click()
  await page.getByRole('button', { name: 'Tilinpäätös…' }).click()
  const wizard = page.getByRole('dialog', { name: /Tilinpäätöksen laatiminen/ })
  await expect(wizard).toBeVisible()
  await expect(wizard).toContainText('31.12.2024')
  return wizard
}

export function stepRow(wizard: Locator, title: string) {
  return wizard.locator('.year-end-step', { hasText: title })
}

export async function expectStepOpen(wizard: Locator, title: string) {
  const row = stepRow(wizard, title)
  await expect(row.locator('.year-end-mark')).not.toHaveText('✓')
}

export async function expectStepDone(wizard: Locator, title: string) {
  const row = wizard.locator('li.done', { hasText: title })
  await expect(row).toBeVisible()
}

export async function acceptNextDialog(page: Page) {
  page.once('dialog', (dialog) => dialog.accept())
}

export async function dismissDialog(page: Page, name: RegExp | string) {
  const dialog = page.getByRole('dialog', { name })
  await dialog.getByRole('button', { name: 'Peru' }).click()
}
