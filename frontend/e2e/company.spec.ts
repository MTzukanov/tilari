import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteOpenVoucherFromEditor, expectVoucherEditorOpen, openBook } from './helpers'

const AGM = 'Varsinaisen yhtiökokouksen pöytäkirja'
const PDF = { mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 asiakirja') }

/** The test book has periods 2024 and 2025, closed through 2023; this day falls in 2025. */
async function openCompany(page: Page) {
  await openBook(page)
  await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
  await page.locator('.sidenav').getByRole('link', { name: 'Yhtiö' }).click()
  await expect(page.getByRole('heading', { name: 'Yhtiö', exact: true })).toBeVisible()
}

async function openPeriod2024(page: Page) {
  await page.locator('.company-period', { hasText: '31.12.2024' }).click()
  await expect(page.getByRole('heading', { name: /Tilikausi 1\.1\.2024/ })).toBeVisible()
}

function slot(page: Page, label: string): Locator {
  return page.locator('.company-slot', { has: page.locator('.company-slot-head strong', { hasText: new RegExp(`^${label}$`) }) })
}

async function chooseFiles(page: Page, target: Locator, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent('filechooser')
  await target.locator('label', { hasText: 'Lataa' }).click()
  await (await chooser).setFiles(files)
}

async function upload(page: Page, target: Locator, name: string) {
  await chooseFiles(page, target, [{ name, ...PDF }])
  await target.getByRole('button', { name: 'Tallenna asiakirja' }).click()
  await expect(target.locator('.company-panel')).toHaveCount(0)
}

test.describe('company documents', () => {
  test('a document uploaded to a slot is a type-800 voucher that fills the slot and its deadline', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    const agm = slot(page, AGM)
    await expect(agm.locator('.company-status-missing')).toHaveText('Puuttuu')
    const tile = page.locator('.company-deadline', { hasText: 'Varsinainen yhtiökokous' })
    await expect(tile).toContainText('30.6.2025')
    await expect(tile).toContainText('Myöhässä 168 pv')

    await chooseFiles(page, agm, [{ name: 'poytakirja.pdf', ...PDF }])
    await expect(agm.getByRole('textbox', { name: 'Otsikko' })).toHaveValue(`${AGM} 2024`)
    await agm.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(agm.locator('.company-status-complete')).toHaveText('Valmis')
    await expect(agm.getByRole('link', { name: 'poytakirja.pdf' })).toBeVisible()
    await expect(tile).toContainText('Tehty')

    // It is a normal voucher: the link opens it in the editor, and back returns to the period.
    await agm.getByRole('button', { name: new RegExp(`${AGM} 2024`) }).click()
    await expectVoucherEditorOpen(page, `${AGM} 2024`)
    await expect(page).toHaveURL(/#\/company\/period\/2024-12-31\/voucher\/\d+/)
    await page.goBack()
    await expect(page.getByRole('heading', { name: /Tilikausi 1\.1\.2024/ })).toBeVisible()

    // It is in the voucher list too.
    await page.locator('.sidenav').getByRole('link', { name: 'Selaa' }).click()
    await expect(page.getByText(`${AGM} 2024`).first()).toBeVisible()
  })

  test('a date in a closed year falls back to the book day and keeps the real date', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const agm = slot(page, AGM)
    await chooseFiles(page, agm, [{ name: 'vanha.pdf', ...PDF }])
    await agm.getByLabel('Asiakirjan päivä').fill('2023-06-01')
    await expect(agm.getByText(/suljetulla kaudella/)).toContainText('15.12.2025')
    await agm.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(agm.locator('.company-status-complete')).toBeVisible()
    await expect(agm.getByText('asiakirja 1.6.2023')).toBeVisible()
    await expect(agm.getByRole('button', { name: /15\.12\.2025/ })).toBeVisible()
  })

  test('a file dropped on a row opens the upload for that slot', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const decision = slot(page, 'Verotuspäätös')
    const data = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['%PDF-1.4'], 'paatos.pdf', { type: 'application/pdf' }))
      return transfer
    })
    await decision.dispatchEvent('dragover', { dataTransfer: data })
    await expect(decision).toHaveClass(/is-file-over/)
    await decision.dispatchEvent('drop', { dataTransfer: data })
    await expect(decision).not.toHaveClass(/is-file-over/)
    await expect(decision.getByText('Tiedostot: paatos.pdf')).toBeVisible()
    await decision.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(decision.locator('.company-status-complete')).toBeVisible()
  })

  test('one file of a voucher with several links to its own slot, and unlinking leaves the voucher', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    const other = slot(page, 'Muut')
    await chooseFiles(page, other, [
      { name: 'eka.pdf', ...PDF },
      { name: 'toka.pdf', ...PDF },
    ])
    await other.getByRole('textbox', { name: 'Otsikko' }).fill('Kahden tiedoston asiakirja')
    await other.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(other.getByRole('link', { name: 'toka.pdf' })).toBeVisible()

    const board = slot(page, 'Hallituksen pöytäkirjat')
    await board.getByRole('button', { name: 'Linkitä olemassa oleva' }).click()
    const pick = board.getByRole('combobox', { name: 'Hae tositetta' }).or(board.getByPlaceholder('Hae tositetta')).first()
    await pick.fill('toka.pdf')
    await page.getByRole('option', { name: /toka\.pdf/ }).click()
    await expect(board.getByRole('link', { name: 'toka.pdf' })).toBeVisible()
    await expect(board.getByRole('link', { name: 'eka.pdf' })).toHaveCount(0)

    await board.getByRole('button', { name: 'Poista linkki' }).click()
    await expect(board.getByRole('link', { name: 'toka.pdf' })).toHaveCount(0)
    await expect(other.getByRole('link', { name: 'toka.pdf' })).toBeVisible()
  })

  test('a slot can be marked not needed, and a deleted voucher shows as deleted', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    const taxReturn = slot(page, 'Veroilmoitus 6B')
    await taxReturn.getByRole('button', { name: 'Ei tarvita' }).click()
    await expect(taxReturn.locator('.company-status-not_needed')).toHaveText('Ei tarvita')
    await expect(page.locator('.company-deadline', { hasText: 'Veroilmoitus 6B' })).toContainText('Ei tarvita')
    await taxReturn.getByRole('button', { name: 'Tarvitaan sittenkin' }).click()
    await expect(taxReturn.locator('.company-status-missing')).toBeVisible()

    const agm = slot(page, AGM)
    await upload(page, agm, 'poistuva.pdf')
    await agm.getByRole('button', { name: new RegExp(`${AGM} 2024`) }).click()
    await expectVoucherEditorOpen(page, `${AGM} 2024`)
    await deleteOpenVoucherFromEditor(page)
    await page.goto('/#/company/period/2024-12-31')
    await expect(agm.locator('.company-status-problem')).toHaveText('Poistettu')
    await expect(agm.locator('.company-status-missing')).toHaveText('Puuttuu')
  })

  test('the front page lists every document, and the header counts near deadlines', async ({ page }) => {
    await openCompany(page)
    await expect(page.locator('.company-period')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Yhtiön asiakirjat' })).toBeVisible()

    // The 2024 period's deadlines fell within the last year of the book's day.
    await expect(page.locator('.topbar-deadlines')).toBeVisible()
    await expect(page.locator('.company-next li').first()).toBeVisible()

    const articles = slot(page, 'Yhtiöjärjestys')
    await chooseFiles(page, articles, [{ name: 'jarjestys.pdf', ...PDF }])
    await expect(articles.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Yhtiöjärjestys')
    await articles.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(articles.getByRole('link', { name: 'jarjestys.pdf' })).toBeVisible()

    await page.getByRole('button', { name: /Kaikki asiakirjat/ }).click()
    await expect(page.getByRole('heading', { name: 'Kaikki asiakirjat' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Yhtiöjärjestys' }).first()).toBeVisible()
    await page.getByLabel('Hae otsikkoa, lajia, tilikautta tai päivää').fill('ei tällaista')
    await expect(page.getByText('Ei asiakirjoja.')).toBeVisible()
  })
})
