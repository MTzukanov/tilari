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
    await expect(dialog.getByRole('heading', { name: 'Korjattavaa ennen ilmoittamista' })).toBeVisible()
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

    // A problem's text takes the owner to where it is fixed.
    await dialog.getByRole('button', { name: 'Täytä osakkeenomistajat.' }).click()
    await expect(dialog.getByRole('tab', { name: 'Täytettävät tiedot' })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('#tax-return-at-shareholders')).toBeFocused()
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
    await expect(dialog.getByText('Kirjoita henkilö- tai Y-tunnus alla olevaan kenttään: Essi Esimerkki.')).toBeVisible()
    await dialog.getByLabel('Essi Esimerkki: henkilö- tai Y-tunnus').fill('010101-0101')

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
    await expect(page.getByRole('dialog').getByLabel('Essi Esimerkki: henkilö- tai Y-tunnus')).toHaveValue('')
    await page.getByRole('dialog').getByRole('tab', { name: 'Täytettävät tiedot' }).click()
    await expect(page.getByRole('dialog').locator('.tax-return-yesno').first().getByRole('radio', { name: 'Ei' })).toBeChecked()
  })

  test('an attached form takes typed rows, and leaving the tab keeps them for the file', async ({ page }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')

    await dialog.getByRole('tab', { name: 'Täytettävät tiedot' }).click()
    await dialog.getByLabel('Yhteyshenkilö').fill('Essi Esimerkki')
    await dialog.getByLabel('Puhelinnumero').fill('0401234567')
    await dialog.getByRole('button', { name: 'Lisää osakkeenomistaja' }).click()
    await dialog.getByLabel('Nimi', { exact: true }).fill('Essi Esimerkki')
    await dialog.getByLabel('Osakkeiden lukumäärä').fill('100')
    await dialog.getByLabel('Onko tilintarkastus tehty?').selectOption('3')
    for (const question of await dialog.locator('.tax-return-yesno').all()) await question.getByRole('radio', { name: 'Ei' }).check()

    // The bank account stands in for securities: only its place on the form matters here.
    await dialog.getByRole('tab', { name: 'OmaVero-luvut' }).click()
    await dialog.getByRole('button', { name: 'Pankkisaamiset', exact: true }).click()
    await dialog.locator('.tax-return-accounts li').first().getByRole('combobox').first().selectOption({ label: 'Rahoitusomaisuusarvopaperit' })
    await expect(dialog.getByText(/Lomakkeen 8A hankintamenot ja Rahoitusomaisuusarvopaperit eroavat/)).toBeVisible()

    await dialog.getByRole('button', { name: /Lomakkeen 8A hankintamenot ja Rahoitusomaisuusarvopaperit eroavat/ }).click()
    await expect(dialog.getByRole('tab', { name: 'Liitelomakkeet' })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('[id^="tax-return-at-form-8A-"]')).toBeFocused()
    await dialog.getByRole('button', { name: 'Lisää rivi' }).click()
    await dialog.getByLabel('Yhtiön tai osuuskunnan nimi').fill('Esimerkki Oyj')
    await dialog.getByLabel('Y-tunnus').fill('4567890-7')
    await dialog.getByLabel('Osakkeiden lukumäärä').fill('150,5')
    await dialog.getByLabel('Tuloverotuksessa poistamaton hankintameno').fill('1000,00')
    await dialog.getByLabel('Vertailuarvo kappaleelta').fill('21,50')

    // Not saved by hand: moving on must not lose it.
    await dialog.getByRole('tab', { name: 'Ilmoitin-tiedosto' }).click()
    await dialog.getByLabel('Essi Esimerkki: henkilö- tai Y-tunnus').fill('010101-0101')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Lataa Ilmoitin-tiedosto' }).click()
    const text = (await readFile(await (await download).path())).toString('latin1')
    expect(text).toContain('000:VSY08A24')
    expect(text).toContain('240:Esimerkki Oyj')
    expect(text).toContain('248:150,5')
    expect(text).toContain('249:1000,00')
    expect(text).toContain('251:3235,75')
    expect(text.endsWith('999:2')).toBe(true)
  })

  test('form 73 stays findable, and the calculation is kept with the 6B without marking it filed', async ({ page }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')

    // The book has no dividends, so the form is closed and says why.
    await dialog.getByRole('tab', { name: 'Liitelomakkeet' }).click()
    const form73 = dialog.locator('details', { hasText: '73 Erittely osinkotuloista' })
    await expect(form73).not.toHaveAttribute('open')
    await form73.locator('summary').click()
    await expect(form73.getByText(/Kentässä Saadut osingot ja ylijäämät ei ole euroja/)).toBeVisible()
    await form73.getByRole('button', { name: 'Avaa OmaVero-luvut' }).click()
    await expect(dialog.getByRole('tab', { name: 'OmaVero-luvut' })).toHaveAttribute('aria-selected', 'true')

    await dialog.getByRole('button', { name: 'Tallenna laskelma asiakirjoihin' }).click()
    await expect(dialog.getByRole('status')).toContainText('Laskelma on tallennettu')
    // A second save writes over the first: still one voucher with one file.
    await dialog.getByRole('button', { name: 'Tallenna laskelma asiakirjoihin' }).click()
    await expect(dialog.getByRole('status')).toContainText('Laskelma on päivitetty')
    await dialog.getByRole('button', { name: 'Sulje' }).click()

    const taxReturn = page.locator('.doc-row', { has: page.locator('.doc-row-name', { hasText: /^Veroilmoitus 6B$/ }) })
    await expect(taxReturn).toContainText('Veroilmoituksen laskelma 2024, laadittu 15.12.2025')
    await expect(taxReturn.getByText('Laskelma', { exact: true })).toBeVisible()
    await expect(taxReturn.getByRole('link', { name: '6B-laskelma-2024-2025-12-15.pdf' })).toHaveCount(1)
    await expect(taxReturn.getByText('Laskelma', { exact: true })).toHaveCount(1)
    // A calculation is not the filed return.
    await expect(taxReturn.locator('.doc-row-head .pill')).toHaveText('Puuttuu')
  })

  test('a debt can count as short term, whatever its number says', async ({ page }) => {
    await openReturn(page)
    const dialog = page.getByRole('dialog')
    // The bank account stands in for a debt: only its place on the form matters here.
    await dialog.getByRole('button', { name: 'Pankkisaamiset', exact: true }).click()
    await dialog.locator('.tax-return-accounts li').first().getByRole('combobox').first().selectOption({ label: 'Ostovelat' })
    await dialog.getByRole('button', { name: 'Ostovelat', exact: true }).click()
    const term = dialog.getByRole('combobox', { name: /velan pituus/ })
    await expect(term).toHaveValue('short')
    await term.selectOption({ label: 'Pitkäaikainen' })
    await expect(dialog.getByRole('combobox', { name: /velan pituus/ })).toHaveValue('long')
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
