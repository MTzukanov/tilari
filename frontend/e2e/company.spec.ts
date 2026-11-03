import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteOpenVoucherFromEditor, expectVoucherEditorOpen, openBook } from './helpers'

const AGM = 'Varsinaisen yhtiökokouksen pöytäkirja'
const PDF = { mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 asiakirja') }

/** The test book has periods 2024 and 2025, closed through 2023; this day falls in 2025. */
async function arrive(page: Page) {
  await openBook(page)
  await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
  await page.locator('.sidenav').getByRole('link', { name: 'Yhtiö' }).click()
  await expect(page.getByRole('heading', { name: 'Yhtiö', exact: true })).toBeVisible()
}

function fold(page: Page, label: string): Locator {
  return page.locator('details.company-fold', { has: page.locator('> summary', { hasText: label }) })
}

/** Opens a folded section of the open card; it then stays open for the session, in every card. */
async function unfold(page: Page, label: string) {
  await fold(page, label).locator('> summary').click()
  await expect(fold(page, label)).toHaveAttribute('open', '')
}

/** With the documents unfolded, as most tests work on them. */
async function openCompany(page: Page) {
  await arrive(page)
  await unfold(page, 'Asiakirjat')
}

/** The newest ended period is open on arrival. */
async function openPeriod2024(page: Page) {
  await expect(periodCard(page, '2024')).toHaveAttribute('aria-expanded', 'true')
}

function periodCard(page: Page, year: string): Locator {
  return page.locator('.binder-head', { hasText: `31.12.${year}` })
}

function slot(page: Page, label: string): Locator {
  return page.locator('.doc-row', { has: page.locator('.doc-row-name', { hasText: new RegExp(`^${label}$`) }) })
}

function slotStatus(row: Locator): Locator {
  return row.locator('.doc-row-head .pill')
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
  test('only the deadlines are open at first, and a section opened stays open after a voucher', async ({ page }) => {
    await arrive(page)
    await expect(fold(page, 'Määräajat')).toHaveAttribute('open', '')
    await expect(fold(page, 'Asiakirjat')).not.toHaveAttribute('open', '')
    await expect(fold(page, 'Osingot tämän tilikauden voitosta')).not.toHaveAttribute('open', '')
    await expect(page.getByRole('button', { name: 'Kirjaa osingonjakopäätös' })).toBeHidden()

    await unfold(page, 'Asiakirjat')
    await fold(page, 'Määräajat').locator('> summary').click()
    await expect(fold(page, 'Määräajat')).not.toHaveAttribute('open', '')
    await page.locator('.sidenav').getByRole('link', { name: 'Selaa' }).click()
    await page.locator('.sidenav').getByRole('link', { name: 'Yhtiö' }).click()
    await expect(fold(page, 'Asiakirjat')).toHaveAttribute('open', '')
    await expect(fold(page, 'Määräajat')).not.toHaveAttribute('open', '')
  })

  test('a document uploaded to a slot is a type-800 voucher that fills the slot and its deadline', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    const agm = slot(page, AGM)
    await expect(slotStatus(agm)).toHaveText('Puuttuu')
    await expect(agm).toHaveClass(/doc-row-missing/)
    const tile = page.locator('.binder-body .due-tile', { hasText: 'Varsinainen yhtiökokous' })
    await expect(tile).toContainText('30.6.2025')
    await expect(tile).toContainText('Myöhässä 168 pv')

    await chooseFiles(page, agm, [{ name: 'poytakirja.pdf', ...PDF }])
    await expect(agm.getByRole('textbox', { name: 'Otsikko' })).toHaveValue(`${AGM} 2024`)
    await agm.getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(slotStatus(agm)).toHaveText('Valmis')
    await expect(agm.getByRole('link', { name: 'poytakirja.pdf' })).toBeVisible()
    await expect(tile).toContainText('Tehty')

    // It is a normal voucher: its pill opens it in the editor, and back returns to the open period.
    await expect(agm.locator('.doc-line-title')).toHaveText(`${AGM} 2024`)
    await agm.getByRole('button', { name: /^Tosite/ }).click()
    await expectVoucherEditorOpen(page, `${AGM} 2024`)
    await expect(page).toHaveURL(/#\/company\/period\/2024-12-31\/voucher\/\d+/)
    await page.goBack()
    await expect(periodCard(page, '2024')).toHaveAttribute('aria-expanded', 'true')
    await expect(slotStatus(agm)).toHaveText('Valmis')

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
    await expect(slotStatus(agm)).toHaveText('Valmis')
    await expect(agm.getByText('asiakirja 1.6.2023')).toBeVisible()
    await expect(agm.getByRole('button', { name: /^Tosite/ })).toContainText('15.12.2025')
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
    await expect(slotStatus(decision)).toHaveText('Valmis')
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
    await board.getByRole('button', { name: 'Linkitä tosite' }).click()
    const pick = board.getByRole('combobox', { name: 'Hae tositetta' }).or(board.getByPlaceholder('Hae tositetta')).first()
    await pick.fill('toka.pdf')
    await page.getByRole('option', { name: /toka\.pdf/ }).click()
    await expect(board.getByRole('link', { name: 'toka.pdf' })).toBeVisible()
    await expect(board.getByRole('link', { name: 'eka.pdf' })).toHaveCount(0)

    await board.getByRole('button', { name: 'Poista linkki' }).click()
    await expect(board.getByRole('link', { name: 'toka.pdf' })).toHaveCount(0)
    await expect(other.getByRole('link', { name: 'toka.pdf' })).toBeVisible()
  })

  test('a document line keeps its columns with or without a suggestion, and fits a phone', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    // Unlinked, the file is suggested again.
    const decision = slot(page, 'Verotuspäätös')
    await upload(page, decision, 'Verotuspaatos 2024.pdf')
    await decision.getByRole('button', { name: 'Poista linkki' }).click()
    const suggested = decision.locator('.doc-line')
    await expect(suggested.getByText('Ehdotus')).toBeVisible()

    const other = slot(page, 'Muut')
    await upload(page, other, `${'pitka-tiedostonimi-'.repeat(8)}.pdf`)
    const linked = other.locator('.doc-line')
    const title = linked.locator('.doc-line-title')
    const file = linked.getByRole('link')

    const left = (line: Locator, part: string) => line.locator(part).first().evaluate((el) => Math.round(el.getBoundingClientRect().left))
    for (const [width, rows] of [
      [1500, 1],
      [900, 2],
    ]) {
      await page.setViewportSize({ width, height: 900 })
      for (const part of ['.pill-voucher', '.doc-line-title', '.doc-line-files']) {
        expect(await left(suggested, part), `${part} at ${width}`).toBe(await left(linked, part))
      }
      const titleBox = (await title.boundingBox())!
      const fileBox = (await file.boundingBox())!
      expect(fileBox.y >= titleBox.y + titleBox.height - 1 ? 2 : 1, `rows at ${width}`).toBe(rows)
    }

    await page.setViewportSize({ width: 360, height: 740 })
    await expect(linked.locator('.pill-date')).toBeVisible()
    await expect(linked.locator('.pill-number')).toBeHidden()
    await expect(suggested.getByText('Ehdotus')).toBeHidden()
    await expect(suggested.getByRole('button', { name: 'Lisää' })).toBeVisible()
    const fileBox = (await file.boundingBox())!
    const unlink = (await linked.getByRole('button', { name: 'Poista linkki' }).boundingBox())!
    expect(fileBox.x + fileBox.width).toBeLessThanOrEqual(unlink.x)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  })

  test('a row has one real button at most, and a line only between documents', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const buttons = (row: Locator) => row.locator('.doc-row-actions .btn-small')
    await expect(buttons(slot(page, 'Veroilmoitus 6B'))).toHaveText(['Lataa'])

    const other = slot(page, 'Muut')
    await expect(buttons(other)).toHaveCount(0)

    const separator = (line: Locator) => line.evaluate((el) => getComputedStyle(el).borderTopStyle)
    await upload(page, other, 'eka.pdf')
    await expect(other.locator('.doc-line')).toHaveCount(1)
    expect(await separator(other.locator('.doc-line').first())).toBe('none')
    await upload(page, other, 'toka.pdf')
    await expect(other.locator('.doc-line')).toHaveCount(2)
    expect(await separator(other.locator('.doc-line').first())).toBe('none')
    expect(await separator(other.locator('.doc-line').last())).toBe('solid')
  })

  test('a slot can be marked not needed, and a deleted voucher shows as deleted', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)

    const taxReturn = slot(page, 'Veroilmoitus 6B')
    await taxReturn.getByRole('button', { name: 'Ei tarvita' }).click()
    await expect(slotStatus(taxReturn)).toHaveText('Ei tarvita')
    await expect(taxReturn).toHaveClass(/doc-row-muted/)
    await expect(page.locator('.binder-body .due-tile', { hasText: 'Veroilmoitus 6B' }).locator('.pill-ok')).toHaveText('Hoidettu')
    await taxReturn.getByRole('button', { name: 'Tarvitaan sittenkin' }).click()
    await expect(slotStatus(taxReturn)).toHaveText('Puuttuu')

    const agm = slot(page, AGM)
    await upload(page, agm, 'poistuva.pdf')
    await agm.getByRole('button', { name: /^Tosite/ }).click()
    await expectVoucherEditorOpen(page, `${AGM} 2024`)
    await deleteOpenVoucherFromEditor(page)
    await page.goto('/#/company/period/2024-12-31')
    await expect(agm.locator('.doc-line .pill-crit')).toHaveText('Poistettu')
    await expect(slotStatus(agm)).toHaveText('Puuttuu')
  })

  test('a ticked document is listed and required, an unticked one is not listed', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const specs = slot(page, 'Tase-erittelyt')
    const prh = slot(page, 'PRH:n ote rekisteröidystä tilinpäätöksestä')
    await expect(specs).toHaveCount(0)
    await expect(prh).toHaveCount(0)
    await expect(slot(page, 'Toimintakertomus')).toHaveCount(0)
    await expect(slot(page, 'Tilintarkastuskertomus')).toHaveCount(0)
    await expect(periodCard(page, '2024').locator('.pill-warn')).toHaveText('0/4 asiakirjaa')

    const settings = page.locator('.company-settings')
    await settings.locator('summary').click()
    await expect(settings.locator('legend')).toHaveText('Tilikauden asiakirjalista')
    await expect(settings.getByText(/Valittu asiakirja näkyy/)).toBeVisible()
    const boxes = settings.getByRole('checkbox')
    await expect(boxes).toHaveCount(4)
    // One choice per line.
    const tops = await boxes.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(4)

    const specsBox = settings.getByRole('checkbox', { name: /^Tase-erittelyt/ })
    await specsBox.check()
    await expect(slotStatus(specs)).toHaveText('Puuttuu')
    await expect(specs).toHaveClass(/doc-row-missing/)
    await expect(periodCard(page, '2024').locator('.pill-warn')).toHaveText('0/5 asiakirjaa')
    await specsBox.uncheck()
    await expect(specs).toHaveCount(0)

    // A row with a document stays when unticked, so nothing attached disappears.
    await specsBox.check()
    await upload(page, specs, 'erittelyt.pdf')
    await specsBox.uncheck()
    await expect(slotStatus(specs)).toHaveText('Lisätty')
    await expect(periodCard(page, '2024').locator('.pill-warn')).toHaveText('0/4 asiakirjaa')
  })

  test('the PRH deadline stands without a listed document, and can be marked handled', async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const tile = page.locator('.binder-body .due-tile', { hasText: 'Tilinpäätös PRH:lle' })
    await expect(tile.locator('.pill')).toHaveText('Tarkista PRH:lta')
    await tile.getByRole('button', { name: 'Merkitse hoidetuksi' }).click()
    await expect(tile.locator('.pill-ok')).toHaveText('Hoidettu')
    await tile.getByRole('button', { name: 'Peru' }).click()
    await expect(tile.locator('.pill')).toHaveText('Tarkista PRH:lta')

    // Ticked, the row answers it and a passed date is late again.
    const settings = page.locator('.company-settings')
    await settings.locator('summary').click()
    await settings.getByRole('checkbox', { name: /^PRH:n ote/ }).check()
    await expect(slotStatus(slot(page, 'PRH:n ote rekisteröidystä tilinpäätöksestä'))).toHaveText('Puuttuu')
    await expect(tile.locator('.pill-crit')).toContainText('Myöhässä')
    await expect(tile.getByRole('button', { name: 'Merkitse hoidetuksi' })).toHaveCount(0)
  })

  test("a deadline's state is a pill in the colour of a row's status", async ({ page }) => {
    await openCompany(page)
    await openPeriod2024(page)
    const tile = page.locator('.binder-body .due-tile', { hasText: 'Varsinainen yhtiökokous' })
    await expect(tile.locator('.pill-crit')).toContainText('Myöhässä')
    await chooseFiles(page, slot(page, AGM), [{ name: 'poytakirja.pdf', ...PDF }])
    await slot(page, AGM).getByRole('button', { name: 'Tallenna asiakirja' }).click()
    await expect(tile.locator('.pill-ok')).toHaveText('Tehty')
  })

  test('cards open in place, one at a time, and the address follows', async ({ page }) => {
    await openCompany(page)
    const period = periodCard(page, '2024')
    const own = page.locator('.binder-head', { hasText: 'Yhtiön asiakirjat' })

    // Open on arrival without being in the address, and closing it stays closed.
    await expect(period).toHaveAttribute('aria-expanded', 'true')
    await expect(page).toHaveURL(/#\/company$/)
    await period.click()
    await expect(period).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.binder-body')).toHaveCount(0)

    await own.click()
    await expect(page).toHaveURL(/#\/company\/own$/)
    await expect(own).toHaveAttribute('aria-expanded', 'true')

    await period.click()
    await expect(page).toHaveURL(/#\/company\/period\/2024-12-31$/)
    await expect(own).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.binder-body')).toHaveCount(1)

    // A deadline tile opens its period and brings it into view, also when it is open already.
    await page.locator('.company-next .due-tile').first().click()
    await expect(period).toHaveAttribute('aria-expanded', 'true')
    await expect(period).toBeInViewport()

    // Only the page's own scroll box moves: the app's frame stays in place.
    const frameScroll = await page.evaluate(() =>
      ['.app-shell', '.app-main'].map((s) => document.querySelector(s)?.scrollTop ?? 0).concat(document.documentElement.scrollTop),
    )
    expect(frameScroll).toEqual([0, 0, 0])
  })

  test('the front page lists every document, and the header counts near deadlines', async ({ page }) => {
    await openCompany(page)
    await expect(page.locator('.binder')).toHaveCount(3)

    // The 2024 period's deadlines fell within the last year of the book's day.
    await expect(page.locator('.topbar-deadlines')).toBeVisible()
    await expect(page.locator('.company-next .due-tile').first()).toBeVisible()

    await page.locator('.binder-head', { hasText: 'Yhtiön asiakirjat' }).click()
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

test.describe('dividend drafts', () => {
  test('a decision with its minutes, the shareholders it asks for, and the payment drafted for them', async ({ page }) => {
    await openCompany(page)

    // A decision made now distributes the newest ended period's profit, whose card is open on arrival; the
    // minutes go onto the decision's voucher.
    const section = page.locator('.binder-body')
    await unfold(page, 'Osingot tämän tilikauden voitosta')
    await section.getByRole('button', { name: 'Kirjaa osingonjakopäätös' }).click()
    await expect(section.getByLabel('Päättänyt kokous')).toHaveValue('agm')
    await section.getByLabel('Osinko yhteensä, €').fill('1000')
    await section.getByLabel('Kokouksen pöytäkirja').setInputFiles({ ...PDF, name: 'kokous-testi.pdf' })
    await expect(section.locator('.company-panel')).toContainText('2251')
    await section.getByRole('button', { name: 'Tee luonnos' }).click()
    const draft = section.locator('.doc-line', { hasText: 'Osingonjako tilikaudelta 2024' }).last()
    await expect(draft.getByText('Luonnos', { exact: true })).toBeVisible()

    // The same file is the meeting's row, waiting for the decision to be posted.
    const minutes = slot(page, 'Varsinaisen yhtiökokouksen pöytäkirja')
    await expect(minutes).toContainText('kokous-testi.pdf')
    await expect(minutes.getByText('Luonnos', { exact: true })).toBeVisible()

    // Posted in the editor as it is, it becomes the dividend, and the row is filled.
    await draft.getByRole('button', { name: /^Tosite/ }).click()
    await expectVoucherEditorOpen(page, 'Osingonjako tilikaudelta 2024')
    await page.locator('.editor-footer').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toHaveCount(0)
    await page.goBack()
    const card = page.locator('.dividend-card')
    await expect(card).toContainText('1 000,00')
    await expect(card).toContainText('Varsinainen yhtiökokous')
    await expect(minutes.getByText('Luonnos', { exact: true })).toHaveCount(0)

    // Without shareholders, the card sends the owner to them, with a row to fill.
    await card.getByText('Saajat (0)').click()
    await card.getByRole('button', { name: 'Siirry osakkaisiin' }).click()
    const holders = page.locator('.company-shareholders')
    await holders.getByLabel('Nimi').fill('Testi Osakas')
    await holders.getByLabel('Alkaen').fill('2020-01-01')
    await holders.getByLabel('Osakkeita').fill('10')
    await holders.getByRole('button', { name: 'Tallenna osakkaat' }).click()
    await expect(holders.getByRole('cell', { name: 'Testi Osakas' })).toBeVisible()
    await expect(holders.getByRole('cell', { name: 'Veron sääntö' })).toBeVisible()

    await periodCard(page, '2024').click()
    await card.getByText('Saajat (1)').click()
    const row = card.getByRole('row', { name: /Testi Osakas/ })
    await expect(row).toContainText('75,00')
    await expect(row).toContainText('925,00')

    // The payment draft leaves the net as a debt to the shareholder and withholds 7.5 %.
    await card.getByRole('button', { name: 'Tee maksutosite' }).click()
    const preview = card.locator('.company-panel table')
    await expect(preview.getByRole('row', { name: /2921/ })).toContainText('75,00')
    await expect(preview.getByRole('row', { name: /2943/ })).toContainText('Testi Osakas')
    await card.getByRole('button', { name: 'Tee luonnos' }).click()
    await expect(card.locator('.doc-line', { hasText: 'Osingon maksu' }).getByText('Luonnos', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Tee maksutosite' })).toBeVisible()
  })
})
