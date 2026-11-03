import { expect, test } from '@playwright/test'
import { openBook } from './helpers'

/** As tilari-bank-import's Nordnet year end attaches them: UTF-16 with a byte order mark, tabs, CRLF. Invented rows. */
function nordnetCsv(name: string, lines: string[]) {
  const text = lines.map((line) => `${line}\r\n`).join('')
  return { name, mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) }
}

const FORM_8A = nordnetCsv('8a-2024.csv', [
  'Nimi\tY-tunnus\tLukumäärä\tHankintameno\tVertailuarvo kappaleelta',
  'TESTIRAHASTO\t0000000-0\t10\t1000,00\t77,00',
  'ESIMERKKI OYJ\t\t150\t1400,50\t5,686',
])
const FORM_73 = nordnetCsv('73-2024.csv', [
  'Maa\tLuokka\tOsingot ja ylijäämät\tPidätetty vero',
  'Suomi\tSuomesta saadut veronalaiset osingot ja ylijäämät\t12,00\t0,00',
  'Saksa\tToisesta EU- tai ETA-valtiosta saadut veronalaiset osingot ja ylijäämät\t10,00\t2,64',
  'Ruotsi\tToisesta EU- tai ETA-valtiosta saadut veronalaiset osingot ja ylijäämät\t5,50\t1,65',
])

test('the 8A and 73 rows attached to a voucher of the period fill the forms by themselves', async ({ page }) => {
  await openBook(page)
  const today = page.locator('.practice-banner').getByLabel('Päivämäärä')

  // The year-end voucher of 2024, a draft with the two files, as the bank import leaves it.
  await today.fill('2024-12-31')
  await page.goto('/#/voucher/new/100')
  await page.locator('.dropzone input[type=file]').setInputFiles([FORM_8A, FORM_73])
  await expect(page.locator('.dropzone .att-card')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Otsikko' }).fill('Nordnet 31.12.2024')
  await page.getByRole('button', { name: 'Tallenna luonnos' }).click()
  await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)

  await today.fill('2025-12-15')
  await page.locator('.sidenav').getByRole('link', { name: 'Yhtiö' }).click()
  await page.getByRole('button', { name: 'Veroilmoituksen tiedot (6B)' }).click()
  const dialog = page.getByRole('dialog')

  // The bank account stands in for securities: only its place on the form matters here.
  await dialog.getByRole('tab', { name: 'OmaVero-luvut' }).click()
  await dialog.getByRole('button', { name: 'Pankkisaamiset', exact: true }).click()
  await dialog.locator('.tax-return-accounts li').first().getByRole('combobox').first().selectOption({ label: 'Rahoitusomaisuusarvopaperit' })

  await dialog.getByRole('tab', { name: 'Liitelomakkeet' }).click()
  const form8a = dialog.locator('[id^="tax-return-at-form-8A-"]')
  await expect(form8a.getByText('Lomakkeen rivit ovat liitteenä tositteella Nordnet 31.12.2024, 31.12.2024:')).toBeVisible()
  await expect(form8a.getByText('luonnos', { exact: true })).toBeVisible()
  await expect(form8a.getByRole('status')).toHaveText('Luettiin 2 riviä.')
  await expect(form8a.getByLabel('Yhtiön tai osuuskunnan nimi')).toHaveCount(2)
  await expect(form8a.getByLabel('Yhtiön tai osuuskunnan nimi').nth(1)).toHaveValue('ESIMERKKI OYJ')
  await expect(form8a.getByLabel('Vertailuarvo kappaleelta').nth(1)).toHaveValue('5,686')

  // The 73 file adds up by class: Germany and Sweden are both EU.
  const form73 = dialog.locator('#tax-return-at-form-73')
  const amounts = form73.getByLabel('Osingot ja ylijäämät yhteensä', { exact: true })
  await expect(amounts.nth(3)).toHaveValue(/^12,00$/)
  await expect(amounts.nth(4)).toHaveValue(/^15,50$/)
  await expect(amounts.nth(5)).toHaveValue('')

  // Read once: back on the tab the rows are still there, and nothing was read twice.
  await dialog.getByRole('tab', { name: 'OmaVero-luvut' }).click()
  await dialog.getByRole('tab', { name: 'Liitelomakkeet' }).click()
  await expect(form8a.getByLabel('Yhtiön tai osuuskunnan nimi')).toHaveCount(2)
  await expect(form8a.getByRole('status')).toHaveCount(0)
  await expect(amounts.nth(4)).toHaveValue(/^15,50$/)
})
