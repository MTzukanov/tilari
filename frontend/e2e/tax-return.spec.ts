import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { openBook } from './helpers'

/** The test book has periods 2024 and 2025; this day falls in 2025, so 2024 is open on arrival. */
async function openReturn(page: Page) {
  await openBook(page)
  await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
  await page.locator('.sidenav').getByRole('link', { name: 'Yhtiö' }).click()
  await page.getByRole('button', { name: 'Veroilmoituksen tiedot (6B)' }).click()
  await expect(page.getByRole('dialog', { name: /Veroilmoituksen tiedot/ })).toBeVisible()
}

test.describe('annual tax return data', () => {
  test('a period shows the numbers for OmaVero, with the accounts behind them', async ({ page, context, browserName }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.tax-return-table caption', { hasText: 'Liiketoiminta ja oma käyttö' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Liikevaihto', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Liikevaihto', exact: true }).click()
    await expect(dialog.locator('.tax-return-accounts li').first()).toBeVisible()

    // No file codes on the screen: the owner fills OmaVero by its wording.
    await expect(dialog.locator('.tax-return-table').first()).not.toContainText(/\b330\b/)

    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await dialog.getByRole('button', { name: 'Kopioi kaikki' }).click()
      await expect(dialog.getByRole('button', { name: 'Kopioitu' })).toBeVisible()
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(copied).toContain('Elinkeinotoiminnan veroilmoitus - yhteisö (6B)')
      expect(copied).toContain('Liikevaihto:')
    }
  })

  test('the file asks for what is missing, then downloads without saving the ID', async ({ page }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')

    await dialog.getByRole('tab', { name: 'Ilmoitin-tiedosto' }).click()
    await expect(dialog.getByText('Täytä osakkeenomistajat.')).toBeVisible()
    await expect(dialog.getByText('18 OmaVeron kysymystä on vastaamatta.', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Lataa Ilmoitin-tiedosto' })).toBeDisabled()

    await dialog.getByRole('tab', { name: 'Täytettävät tiedot' }).click()
    await dialog.getByLabel('Yhteyshenkilö').fill('Essi Esimerkki')
    await dialog.getByLabel('Puhelinnumero').fill('0401234567')
    await dialog.getByRole('button', { name: 'Lisää osakkeenomistaja' }).click()
    await dialog.getByLabel('Nimi', { exact: true }).fill('Essi Esimerkki')
    await dialog.getByLabel('Osakkeiden lukumäärä').fill('100')
    await dialog.getByLabel('Onko tilintarkastus tehty?').selectOption('3')
    await expect(dialog.getByLabel('Tilinpäätös on laadittu')).toBeChecked()

    // Neither answer is preselected, and every question needs one.
    await expect(dialog.getByText('Vastaamatta: 18')).toBeVisible()
    const questions = dialog.locator('.tax-return-yesno')
    await expect(questions.first().getByRole('radio', { name: 'Kyllä' })).not.toBeChecked()
    await expect(questions.first().getByRole('radio', { name: 'Ei' })).not.toBeChecked()
    for (const question of await questions.all()) await question.getByRole('radio', { name: 'Ei' }).check()
    await expect(dialog.getByText(/^Vastaamatta:/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Tallenna' }).click()
    await expect(dialog.getByText('Tallennettu')).toBeVisible()

    await dialog.getByRole('tab', { name: 'Ilmoitin-tiedosto' }).click()
    await expect(dialog.getByText('Kirjoita henkilö- tai Y-tunnus: Essi Esimerkki.')).toBeVisible()
    await dialog.getByLabel('Essi Esimerkki').fill('010101-0101')

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Lataa Ilmoitin-tiedosto' }).click()
    const saved = await download
    const path = await saved.path()
    const text = (await readFile(path)).toString('latin1')
    expect(saved.suggestedFilename()).toMatch(/^6B_.*_2024\.txt$/)
    expect(text.startsWith('000:VSY06B24\r\n')).toBe(true)
    expect(text.endsWith('999:1')).toBe(true)
    expect(text).toContain('701:Essi Esimerkki')
    expect(text).toContain('703:010101-0101')
    expect(text).toContain('177:3')

    // Saved answers come back; the ID does not.
    await dialog.getByRole('button', { name: 'Sulje' }).click()
    await page.getByRole('button', { name: 'Veroilmoituksen tiedot (6B)' }).click()
    await page.getByRole('dialog').getByRole('tab', { name: 'Ilmoitin-tiedosto' }).click()
    await expect(page.getByRole('dialog').getByLabel('Essi Esimerkki')).toHaveValue('')
    await page.getByRole('dialog').getByRole('tab', { name: 'Täytettävät tiedot' }).click()
    await expect(page.getByRole('dialog').locator('.tax-return-yesno').first().getByRole('radio', { name: 'Ei' })).toBeChecked()
  })

  test('an account can move to another field, and back', async ({ page }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Liikevaihto', exact: true }).click()
    const line = dialog.locator('.tax-return-accounts li').first()
    const select = line.getByRole('combobox')
    await select.selectOption({ label: 'Muut tuotot' })
    await expect(dialog.getByRole('button', { name: 'Muut tuotot', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Muut tuotot', exact: true }).click()
    await dialog.locator('.tax-return-accounts li').first().getByRole('combobox').selectOption({ label: 'Palauta oletuskenttä' })
    await expect(dialog.getByRole('button', { name: 'Liikevaihto', exact: true })).toBeVisible()
  })
})
