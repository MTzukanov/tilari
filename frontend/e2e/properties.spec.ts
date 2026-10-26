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
    await increase.getByRole('button', { name: 'Kumoa korotusilmoitus' }).click()
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
    await page.locator('.property-actions').getByRole('button', { name: 'Peru' }).click()

    await page.goto('/#/properties')
    await expect(page.locator('.property-table').first()).toContainText('Testi Vuokralainen · 670,00 €/kk')
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
