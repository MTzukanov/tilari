import { expect, test } from '@playwright/test'
import { editorSaveButton, openBook } from './helpers'

test.describe('rental objects', () => {
  test('setup links a cost centre and the object page shows its figures', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/properties')
    await expect(page.getByRole('heading', { name: 'Vuokrakohteet' })).toBeVisible()
    await expect(page.getByText(/kustannuspaikkaa odottaa määritystä/)).toBeVisible()

    await page.getByRole('button', { name: 'Määritä kohteet' }).first().click()
    await expect(page.getByRole('heading', { name: 'Vuokrakohteiden määritys' })).toBeVisible()
    // The golden book has no share items; mark "Toimisto" as not a rental object.
    await page.getByRole('row', { name: /Toimisto/ }).getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: 'Tallenna määritys' }).click()

    await expect(page.getByRole('heading', { name: 'Vuokrakohteet' })).toBeVisible()
    await expect(page.getByText(/odottaa määritystä/)).toBeHidden()
    await expect(page.getByRole('row', { name: /Toimisto/ })).toBeHidden()

    await page
      .locator('.property-table tbody tr', { has: page.locator('.property-name', { hasText: /^Asunto$/ }) })
      .first()
      .click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(page.getByRole('heading', { name: 'Asunto' })).toBeVisible()
    await expect(page.getByText('Hankintamenoa ei ole linkitetty', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tilikausittain' })).toBeVisible()

    await page.getByRole('button', { name: 'Muokkaa kohdetta' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit$/)
    await page.getByLabel('Laji').selectOption({ label: 'Asunto' })
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(page.locator('.property-detail .lede')).toContainText('Asunto')
  })
})

test.describe('rental object leases', () => {
  test('a lease added on the edit page shows on the object page and in the list', async ({ page }) => {
    await openBook(page)
    // The notice voucher is dated on the book's day: inside the test book's last fiscal year.
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4')
    await expect(page.getByRole('heading', { name: 'Vuokrasuhteet' })).toBeVisible()
    await expect(page.getByText('Ei vuokrasopimuksia.', { exact: false })).toBeVisible()
    await expect(page.locator('.property-leases').getByRole('button', { name: 'Lisää vuokrasopimus' })).toBeVisible()

    await page.goto('/#/property/4/edit')
    await page.getByRole('button', { name: 'Lisää vuokrasopimus' }).click()
    const lease = page.locator('.property-lease-edit').first()
    const tenant = lease.getByRole('combobox', { name: 'Vuokralainen' }).or(lease.getByLabel('Vuokralainen'))
    await tenant.first().fill('Testi Vuokralainen')
    await tenant.first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    await expect(lease.getByLabel('Eräpäivä')).toHaveValue('5')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByLabel('Vesi €/kk').first().fill('20')
    await lease.getByLabel('Eräpäivä').fill('2')
    // The owner's own contract, uploaded as a Liitetieto voucher named after the object.
    // Through the real button: the system's chooser opens and the page's scroll box is left alone.
    const chooser = page.waitForEvent('filechooser')
    await lease.locator('label', { hasText: 'Lataa sopimus' }).click()
    const files = await chooser
    await expect(page.locator('.is-native-picker-open')).toHaveCount(0)
    await files.setFiles({ name: 'sopimus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sopimus') })
    await expect(lease.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto Testi Vuokralainen 1\.1\.2025-/)
    await lease.getByLabel('Korotussääntö').selectOption({ label: 'Euroa vuodessa' })
    await lease.getByLabel('Korotus € / v').fill('15')

    // An increase prefilled from the clause, and its notice written as a Liitetieto voucher with a PDF.
    await lease.getByRole('button', { name: 'Lisää korotus' }).click()
    const increase = lease.locator('.property-lease-increase').first()
    await expect(increase.getByLabel('Vuokra €/kk')).toHaveValue('665,00')
    await increase.getByLabel('Alkaen').fill('2026-01-01')
    const notice = increase.getByRole('textbox', { name: 'Korotusilmoitus' })
    const download = page.waitForEvent('download')
    await increase.getByRole('button', { name: 'Luo korotusilmoitus' }).click()
    expect((await download).suggestedFilename()).toMatch(/^vuokrankorotusilmoitus-.*-2026-01-01\.pdf$/)
    await expect(notice).toHaveValue(/Vuokrankorotusilmoitus Asunto 1\.1\.2026/)
    await expect(increase.getByRole('link', { name: 'Näytä' })).toBeVisible()

    // Undo deletes the voucher again; then write it once more and keep it.
    page.once('dialog', (dialog) => void dialog.accept())
    await increase.getByRole('button', { name: 'Poista korotusilmoitus' }).click()
    await expect(notice).toHaveValue('–')
    await expect(increase.getByRole('link', { name: 'Näytä' })).toBeHidden()
    const again = page.waitForEvent('download')
    await increase.getByRole('button', { name: 'Luo korotusilmoitus' }).click()
    await again
    await expect(notice).toHaveValue(/Vuokrankorotusilmoitus Asunto 1\.1\.2026/)
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()

    await expect(page).toHaveURL(/#\/property\/4$/)
    const card = page.locator('.property-lease-card')
    await expect(card).toContainText('Testi Vuokralainen')
    await expect(card).toContainText('1.1.2025 alkaen')
    // On the as-of date (31.12.2025) the starting rent is in force; the increase comes in January.
    await expect(card).toContainText('670,00 €/kk (vuokra 650,00 €, vesi 20,00 €) · eräpäivä 2. · korotus 15,00 € vuodessa')
    await card.getByText('Korotukset (1)').click()
    await expect(card.getByRole('button', { name: /Vuokrankorotusilmoitus .* 1\.1\.2026/ })).toHaveCount(1)
    // The undone notice is gone from the book: the pickers offer only the kept one.
    await page.goto('/#/property/4/edit')
    const picker = page.locator('.property-lease-edit').first().getByRole('textbox', { name: 'Sopimus' })
    await picker.click()
    await picker.fill('Vuokrankorotusilmoitus')
    await expect(page.getByRole('option', { name: /Vuokrankorotusilmoitus Asunto/ })).toHaveCount(1)
    await picker.press('Escape')

    // A linked document opens its voucher; the way back restores the unsaved form.
    await page.getByLabel('Eräpäivä').first().fill('9')
    await page.locator('.property-doc-list').getByRole('button', { name: /Vuokrankorotusilmoitus Asunto/ }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit\/voucher\/\d+\/edit$/)
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue(/Vuokrankorotusilmoitus Asunto/)
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit$/)
    await expect(page.getByText('Tallentamattomat muutokset palautettiin.')).toBeVisible()
    await expect(page.getByLabel('Eräpäivä').first()).toHaveValue('9')

    // A notice written on an earlier visit is deleted from the book when the form is saved.
    const saved = page.locator('.property-lease-increase').first()
    page.once('dialog', (dialog) => void dialog.accept())
    await saved.getByRole('button', { name: 'Poista korotusilmoitus' }).click()
    await expect(saved.getByRole('textbox', { name: 'Korotusilmoitus' })).toHaveValue('–')
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await page.goto('/#/property/4/edit')
    const search = page.locator('.property-lease-edit').first().getByRole('textbox', { name: 'Sopimus' })
    await search.click()
    await search.fill('Vuokrankorotusilmoitus')
    await expect(page.getByRole('option', { name: /Vuokrankorotusilmoitus Asunto/ })).toHaveCount(0)
    await search.press('Escape')
    await page.locator('.property-actions').getByRole('button', { name: 'Peru' }).click()

    await page.goto('/#/properties')
    await expect(page.locator('.property-table').first()).toContainText('Testi Vuokralainen · 650,00 €/kk')
  })
})

test.describe('rental object rent exceptions', () => {
  test('an agreed exception lowers the expected rent on its days and shows on the card and in the months', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4/edit')
    await page.getByRole('button', { name: 'Lisää vuokrasopimus' }).click()
    const lease = page.locator('.property-lease-edit').first()
    const tenant = lease.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByLabel('Vesi €/kk').first().fill('20')

    await lease.getByRole('button', { name: 'Lisää poikkeava vuokra' }).click()
    const exception = lease.locator('.property-lease-exception').first()
    // Prefilled with the amounts in force; a discount is typed as the lower rent.
    await expect(exception.getByLabel('Vesi €/kk')).toHaveValue('20,00')
    await exception.getByLabel('Alkaen').fill('2025-05-01')
    await exception.getByLabel('Päättyen').fill('2025-05-31')
    await exception.getByLabel('Vuokra €/kk').fill('450')
    await exception.getByLabel('Syy').fill('Remonttihyvitys')
    await expect(exception).toContainText(/470,00\s€ \(−200,00\s€\)/)
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()

    await expect(page).toHaveURL(/#\/property\/4$/)
    const card = page.locator('.property-lease-card').first()
    // No rent is booked on the object: nine months of 670,00 €, May 200,00 € less.
    await expect(card).toContainText(/Vuokrasaldo 30\.11\.2025: vuokrarästi 5\s830,00\s€/)
    await card.getByText('Poikkeava vuokra (1)').click()
    await expect(card).toContainText(/1\.5\.2025–31\.5\.2025 · 470,00\s€\/kk \(vuokra 450,00\s€, vesi 20,00\s€\), normaali 670,00\s€ · Remonttihyvitys/)
    await card.getByText(/^Kuukausittain \(\d+\)$/).click()
    const may = card.locator('.property-rent-table tr', { hasText: 'toukokuu 2025' })
    await expect(may.locator('.property-rent-exception')).toHaveText(/470,00\s€\*/)
    await expect(may.locator('.property-rent-exception')).toHaveAttribute('title', /ilman poikkeusta 670,00\s€ · Remonttihyvitys/)
    // A month that moved the balance offers an exception prefilled with what was paid (nothing here).
    const october = card.locator('.property-rent-table tr', { hasText: 'lokakuu 2025' })
    await october.getByRole('button', { name: 'Lisää poikkeus' }).click()
    const form = card.locator('.property-rent-exception-form')
    await expect(form.getByLabel('Alkaen')).toHaveValue('2025-10-01')
    await expect(form.getByLabel('Päättyen')).toHaveValue('2025-10-31')
    await expect(form.getByLabel('Vuokra €/kk')).toHaveValue('0,00')
    await form.getByLabel('Syy').fill('Vuokravapaa kuukausi')
    await form.getByRole('button', { name: 'Tallenna poikkeus' }).click()
    await expect(form).toHaveCount(0)
    await expect(card).toContainText(/Vuokrasaldo 30\.11\.2025: vuokrarästi 5\s160,00\s€/)
    await expect(october.locator('.property-rent-exception')).toHaveText(/0,00\s€\*/)
    await expect(october.getByRole('button', { name: 'Lisää poikkeus' })).toHaveCount(0)
    await expect(card.getByText('Poikkeava vuokra (2)')).toBeVisible()

    // The card leads to where exceptions are entered.
    await card.getByRole('button', { name: /^Lisää korotus tai poikkeava vuokra/ }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit$/)
    await expect(page.locator('.property-lease-exception')).toHaveCount(2)
  })
})

test.describe('rental object water settlements', () => {
  test('a settlement is shared by days with the tenant, writes the letter and shows on the object page', async ({ page }) => {
    await openBook(page)
    // The letter's voucher is dated on the book's day: inside the test book's last fiscal year.
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4')
    const panel = page.locator('.property-water')
    await expect(panel.getByRole('heading', { name: 'Vesimaksut ja vesitasaukset' })).toBeVisible()
    await expect(panel).toContainText('Ei vesitasauksia.')

    await page.goto('/#/property/4/edit')
    await page.getByRole('button', { name: 'Lisää vuokrasopimus' }).click()
    const lease = page.locator('.property-lease-edit').first()
    const tenant = lease.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByLabel('Vesi €/kk').first().fill('20')
    await expect(lease.getByLabel('Vesimaksu tasataan kulutuksen mukaan')).toBeChecked()

    await page.getByRole('button', { name: 'Lisää vesitasaus' }).click()
    const water = page.locator('.property-water-edit').first()
    await water.getByLabel('Jakso alkaa').fill('2025-01-01')
    await water.getByLabel('Jakso päättyy').fill('2025-06-30')
    await expect(water.getByRole('combobox', { name: /^Taloyhtiön tasaus/ })).toHaveValue('refund')
    await water.getByLabel('Summa €').first().fill('36,20')
    // No use given: the company's refund by days, 122 of the period's 181 days.
    const share = water.locator('.property-water-share').first()
    await expect(share).toContainText('Testi Vuokralainen')
    await expect(share).toContainText('1.3.2025–30.6.2025, 122 pv')
    await expect(share).toContainText('80,00 €')
    await expect(share).toContainText('palautetaan 24,40 €')
    // The form shows what the book has for the period, as the page will: nothing yet.
    await expect(water).toContainText('Taloyhtiön tasausta ei löydy kirjanpidosta.')
    await expect(share.locator('.property-water-status')).toHaveText('avoin')
    // With the actual use: 60,00 € by days is 40,44 €, less 80,00 € of advances.
    await water.getByLabel('Toteutunut kulutus €').fill('60')
    await expect(share).toContainText('palautetaan 39,56 €')
    await expect(water).toContainText('96,20 €')

    const download = page.waitForEvent('download')
    await share.getByRole('button', { name: 'Luo vesitasauslaskelma' }).click()
    expect((await download).suggestedFilename()).toMatch(/^vesitasaus-.*-2025-06-30\.pdf$/)
    await expect(share.getByRole('textbox', { name: 'Vesitasauslaskelma' })).toHaveValue(/Vesitasaus Asunto 1\.1\.2025–30\.6\.2025/)
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()

    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(panel).toContainText('Tasausjakso 1.1.2025–30.6.2025')
    await expect(panel).toContainText('taloyhtiö: hyvitys 36,20 €, kulutus 60,00 €, ennakot 96,20 €')
    await expect(panel).toContainText('Taloyhtiön tasausta ei löydy kirjanpidosta.')
    const row = panel.locator('.property-water-shares li').first()
    await expect(row).toContainText('Testi Vuokralainen')
    await expect(row).toContainText('palautetaan 39,56 €')
    await expect(row.locator('.property-water-status')).toHaveText('avoin')
    await expect(row.getByRole('button', { name: /Vesitasaus Asunto/ })).toBeVisible()
    const card = page.locator('.property-lease-card').first()
    await expect(card).toContainText('vesimaksu tasataan kulutuksen mukaan')
    await expect(card).toContainText('Vesitasaus 1.1.2025–30.6.2025: palautetaan 39,56 € · avoin')
    // The lease's own rent account on the as-of date: the test book has no rent on the object,
    // so all nine months are owed; the letter's refund is due after the as-of date.
    await expect(card).toContainText(/Vuokrasaldo 30\.11\.2025: vuokrarästi 6\s030,00\s€/)
    await card.getByText(/^Kuukausittain \(\d+\)$/).click()
    await expect(card.locator('.property-rent-table')).toContainText('Vesitasaus')
  })
})

test.describe('rental objects setup keeps unsaved choices', () => {
  test('a row opens its voucher; back returns with choices and scroll intact', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/800')
    await expect(page.getByLabel('Otsikko')).toBeVisible()
    await page.getByLabel('Otsikko').fill('Vuokrasopimus Asunto 1.6.2025-')
    await page.getByLabel('Tositteen pvm').fill('2025-06-15')
    await editorSaveButton(page).click()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)

    await page.setViewportSize({ width: 1200, height: 520 })
    await page.goto('/#/properties/setup')
    await expect(page.getByRole('heading', { name: 'Vuokrakohteiden määritys' })).toBeVisible()
    const toimisto = page.getByRole('row', { name: /Toimisto/ }).getByRole('checkbox')
    await toimisto.uncheck()
    const leaseRow = page.getByRole('row', { name: /Vuokrasopimus Asunto/ })
    const leaseSelect = leaseRow.getByRole('combobox')
    await expect(leaseSelect).toHaveValue('4')
    await leaseSelect.selectOption('')

    const workspace = page.locator('main.workspace')
    await workspace.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const scrolled = await workspace.evaluate((el) => el.scrollTop)
    expect(scrolled).toBeGreaterThan(100)

    // Browser back.
    await leaseRow.getByRole('cell', { name: /Vuokrasopimus Asunto/ }).click()
    await expect(page).toHaveURL(/#\/properties\/setup\/voucher\/\d+\/edit$/)
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Vuokrasopimus Asunto 1.6.2025-')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Vuokrakohteiden määritys' })).toBeVisible()
    await expect(page.getByText('Tallentamattomat valinnat palautettiin.')).toBeVisible()
    await expect(toimisto).not.toBeChecked()
    await expect(leaseSelect).toHaveValue('')
    await expect.poll(() => workspace.evaluate((el) => el.scrollTop)).toBeGreaterThan(scrolled - 40)

    // The editor's own close control returns the same way.
    await leaseRow.getByRole('cell', { name: /Vuokrasopimus Asunto/ }).click()
    await expect(page).toHaveURL(/#\/properties\/setup\/voucher\/\d+\/edit$/)
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/properties\/setup$/)
    await expect(toimisto).not.toBeChecked()
    await expect(leaseSelect).toHaveValue('')

    // Discarding restores the defaults; Cancel forgets the draft.
    await page.getByRole('button', { name: 'Hylkää muutokset' }).click()
    await expect(toimisto).toBeChecked()
    await expect(leaseSelect).toHaveValue('4')
    await toimisto.uncheck()
    await page.locator('.property-actions').getByRole('button', { name: 'Peru' }).click()
    await expect(page).toHaveURL(/#\/properties$/)
    await page.goto('/#/properties/setup')
    await expect(toimisto).toBeChecked()
  })
})

test.describe('rental object month lines', () => {
  test('a month opens its lines; a line opens its voucher and back keeps the month', async ({ page }) => {
    await openBook(page)
    // A narrow text column, so one line is cut off below.
    await page.evaluate(() => localStorage.setItem('tilari.properties.monthLines.cols', JSON.stringify({ text: 70 })))
    await page.goto('/#/property/4')
    await expect(page.getByRole('heading', { name: 'Asunto' })).toBeVisible()

    await page.getByRole('button', { name: 'helmikuu 2025' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/month\/2025-02$/)
    const panel = page.locator('.property-month-lines')
    await expect(panel.getByRole('heading', { name: 'Viennit: helmikuu 2025' })).toBeVisible()
    await expect(panel.locator('tbody tr')).toHaveCount(2)

    // A text cut off by a narrow column shows in full on hover (no generic row tooltip).
    const cut = panel.getByRole('cell', { name: 'Asiakas Oy - Vuokratulo Asunto' })
    await cut.hover()
    await expect(cut).toHaveAttribute('title', 'Asiakas Oy - Vuokratulo Asunto')
    await expect(panel.locator('tbody tr').first()).not.toHaveAttribute('title')
    await page.getByRole('row', { name: /Hoitovastike/ }).getByRole('cell').first().hover()
    await expect(panel.getByRole('cell', { name: '1.2.2025' })).not.toHaveAttribute('title')

    await panel.getByRole('row', { name: /Hoitovastike/ }).click()
    await expect(page).toHaveURL(/#\/property\/4\/month\/2025-02\/voucher\/\d+\/v\/\d+\/edit$/)
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/month\/2025-02$/)
    await expect(panel.getByRole('heading', { name: 'Viennit: helmikuu 2025' })).toBeVisible()

    // The same month on the cost-centre page, kept through a voucher there too.
    await panel.getByRole('button', { name: 'Kustannuspaikan viennit tältä kuukaudelta' }).click()
    await expect(page).toHaveURL(/#\/allocation\/4\/month\/2025-02$/)
    await expect(page.locator('.ledger-head-nav').first()).toHaveAttribute('data-start', '2025-02-01')
    await page.locator('.allocation-detail .zebra-voucher tbody tr').first().click()
    await expect(page).toHaveURL(/#\/allocation\/4\/month\/2025-02\/voucher\/\d+/)
    await page.goBack()
    await expect(page.locator('.ledger-head-nav').first()).toHaveAttribute('data-start', '2025-02-01')

    // Closing the panel drops the month from the address.
    await page.goto('/#/property/4/month/2025-02')
    await panel.getByRole('button', { name: 'Sulje' }).click()
    await expect(panel).toBeHidden()
    await expect(page).toHaveURL(/#\/property\/4$/)
  })

  test('a month changed in the address while the page is open opens that month', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/property/4/month/2025-02')
    const panel = page.locator('.property-month-lines')
    await expect(panel.getByRole('heading', { name: 'Viennit: helmikuu 2025' })).toBeVisible()

    await page.goto('/#/property/4/month/2025-03')
    await expect(panel.getByRole('heading', { name: 'Viennit: maaliskuu 2025' })).toBeVisible()

    // A bar click changes the address without a new route; the month typed again still opens.
    await page.getByRole('button', { name: 'helmikuu 2025' }).click()
    await expect(panel.getByRole('heading', { name: 'Viennit: helmikuu 2025' })).toBeVisible()
    await page.goto('/#/property/4/month/2025-03')
    await expect(panel.getByRole('heading', { name: 'Viennit: maaliskuu 2025' })).toBeVisible()

    await page.goto('/#/property/4')
    await expect(panel).toBeHidden()

    // The cost-centre page follows a month in the address the same way.
    await page.goto('/#/allocation/4/month/2025-02')
    const nav = page.locator('.ledger-head-nav').first()
    await expect(nav).toHaveAttribute('data-start', '2025-02-01')
    await page.goto('/#/allocation/4/month/2025-03')
    await expect(nav).toHaveAttribute('data-start', '2025-03-01')
  })
})
