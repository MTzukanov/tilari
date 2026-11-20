import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { editorSaveButton, openBook, propertiesBook } from './helpers'

/** Opens a new lease card in place on object 4's Vuokrasuhteet tab; returns the lease's form on it. */
async function newLeaseCard(page: Page): Promise<Locator> {
  if (!/#\/property\/4\/leases$/.test(page.url())) await page.goto('/#/property/4/leases')
  await page.locator('.property-leases').getByRole('button', { name: '+ Vuokrasopimus' }).click()
  return page.locator('.property-lease-card-edit .property-lease-edit')
}

/** Saves the open lease card: it turns back into the lease, on the tab. */
async function saveLeaseCard(page: Page) {
  const card = page.locator('.property-lease-card-edit')
  await card.getByRole('button', { name: 'Tallenna', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page).toHaveURL(/#\/property\/4\/leases$/)
}

/** Where each row of a legend sits: its left edge, top and width, rounded. */
async function legendRows(rows: Locator) {
  return rows.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
    }),
  )
}

/**
 * A legend's rows run top to bottom in equal columns: the rows of a column share a left edge, the next
 * row is under the last or starts the next column to the right, and every row is as wide as the others.
 */
function expectColumns(rows: { x: number; y: number; w: number }[], columns: number | 'several') {
  const xs = [...new Set(rows.map((r) => r.x))]
  if (columns === 'several') expect(xs.length).toBeGreaterThan(1)
  else expect(xs.length).toBe(columns)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].x === rows[i - 1].x) expect(rows[i].y, `row ${i}`).toBeGreaterThan(rows[i - 1].y)
    else expect(rows[i].x, `row ${i}`).toBeGreaterThan(rows[i - 1].x)
  }
  const ws = rows.map((r) => r.w)
  expect(Math.max(...ws) - Math.min(...ws)).toBeLessThanOrEqual(1)
}

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
    // The figures are on their own tab, and the address says so.
    await page.getByRole('tab', { name: /^Talous/ }).click()
    await expect(page).toHaveURL(/#\/property\/4\/finance$/)
    await expect(page.getByRole('heading', { name: 'Tilikausittain' })).toBeVisible()
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)

    await page.getByRole('button', { name: 'Kohteen asetukset' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/edit$/)
    await page.getByLabel('Laji').selectOption({ label: 'Asunto' })
    await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)
    await expect(page.locator('.property-detail .lede')).toContainText('Asunto')
  })
})

test.describe('rental objects chart', () => {
  test('every object has a line and a checkbox, all or none at once, the total stays; the choice is remembered; the defaults line up; it fits a phone', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/properties')
    const panel = page.locator('section.portfolio-charts')
    await expect(panel.getByRole('heading', { name: 'Kohteet kuukausittain' })).toBeVisible()
    const cash = panel.getByRole('group', { name: 'Kertynyt kassavirta' })
    // The golden book links no investment: a cash flow per object, no unrecovered chart.
    await expect(cash.locator('.portfolio-line')).toHaveCount(3)
    await expect(cash.locator('.portfolio-total')).toHaveCount(1)
    await expect(panel.getByRole('group', { name: 'Palauttamatta kuukauden lopussa' })).toHaveCount(0)

    await panel.getByRole('checkbox', { name: 'Asunto' }).uncheck()
    await expect(cash.locator('.portfolio-line')).toHaveCount(2)
    await expect(cash.locator('.portfolio-total')).toHaveCount(1)
    await page.reload()
    await expect(panel.getByRole('checkbox', { name: 'Asunto' })).not.toBeChecked()
    await expect(cash.locator('.portfolio-line')).toHaveCount(2)
    // "Valitse kaikki" and "Poista valinnat" act on the objects' lines; the total is a choice of its own.
    const objects = panel.getByRole('group', { name: 'Kohteet' })
    const checkAll = panel.getByRole('button', { name: 'Valitse kaikki' })
    const uncheckAll = panel.getByRole('button', { name: 'Poista valinnat' })
    await uncheckAll.click()
    await expect(objects.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await expect(cash.locator('.portfolio-line')).toHaveCount(0)
    await expect(cash.locator('.portfolio-total')).toHaveCount(1)
    await expect(uncheckAll).toBeDisabled()
    await page.reload()
    await expect(cash.locator('.portfolio-line')).toHaveCount(0)
    await checkAll.click()
    await expect(objects.getByRole('checkbox', { checked: false })).toHaveCount(0)
    await expect(cash.locator('.portfolio-line')).toHaveCount(3)
    await expect(checkAll).toBeDisabled()
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tilari.properties.portfolioChart')))!)).toEqual({
      hidden: [],
      total: true,
      allMonths: false,
      combined: true,
      percent: false,
    })
    await panel.getByRole('checkbox', { name: 'Kaikki yhteensä' }).uncheck()
    await expect(cash.locator('.portfolio-total')).toHaveCount(0)

    // The defaults at the bottom: the three fields line up and look alike (the euro field too).
    const defaults = page.locator('details.property-defaults')
    await defaults.locator('summary').click()
    const fields = defaults.locator('.property-form-grid input')
    await expect(fields).toHaveCount(3)
    const looks = await fields.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        const css = getComputedStyle(el)
        return [Math.round(r.y), Math.round(r.height), css.backgroundColor, css.borderTopWidth, css.borderTopColor].join(' ')
      }),
    )
    expect(new Set(looks).size, looks.join(' | ')).toBe(1)

    await page.setViewportSize({ width: 360, height: 800 })
    await expect
      .poll(() => page.evaluate(() => { const w = document.querySelector('main.workspace')!; return w.scrollWidth - w.clientWidth }))
      .toBe(0)
  })
  test('a book with investments linked draws the unrecovered chart first; the objects in columns', async ({ page }) => {
    await openBook(page, propertiesBook, 'Esimerkki Vuokraus Oy')
    await page.goto('/#/properties')
    const panel = page.locator('section.portfolio-charts')
    const unrecovered = panel.getByRole('group', { name: 'Palauttamatta kuukauden lopussa' })
    await expect(unrecovered).toBeVisible()
    // The totals on one chart first: the capital put in, what came back and what is still to recover on one
    // scale (no loan shares in this book). Then still to recover, the cash flow under it: they meet or part.
    await expect(panel.locator('h4')).toHaveText(['Kaikki kohteet yhdessä kuukauden lopussa', 'Palauttamatta kuukauden lopussa', 'Kertynyt kassavirta'])
    const combined = panel.getByRole('group', { name: 'Kaikki kohteet yhdessä kuukauden lopussa' })
    await expect(combined.locator('.portfolio-line')).toHaveCount(3)
    await combined.locator('.chart-point-hit').last().hover()
    await expect(combined.locator('xpath=..').locator('.chart-tip')).toContainText(/Palauttamatta[\d\s,−-]+€Takaisin saatu[\d\s,−-]+€Sijoitettu[\d\s,−-]+€$/)
    // A checkbox takes it away, and the choice is remembered.
    await panel.getByRole('checkbox', { name: 'Yhteiskaavio' }).uncheck()
    await expect(combined).toHaveCount(0)
    await page.reload()
    await expect(panel.locator('h4')).toHaveText(['Palauttamatta kuukauden lopussa', 'Kertynyt kassavirta'])
    await panel.getByRole('checkbox', { name: 'Yhteiskaavio' }).check()
    await expect(combined).toBeVisible()
    // Still to recover as a percentage of each object's capital put in: objects of any size on one scale.
    const percent = panel.getByRole('checkbox', { name: 'Prosentteina sijoitetusta' })
    await expect(unrecovered.locator('.overview-y-tick').first()).toHaveText(/€$/)
    await percent.check()
    await expect(unrecovered.locator('.overview-y-tick').first()).toHaveText(/%$/)
    await unrecovered.locator('.chart-point-hit').last().hover()
    await expect(unrecovered.locator('xpath=..').locator('.chart-tip-row').first()).toContainText(/^Kaikki yhteensä[\d\s,−-]+%$/)
    await page.reload()
    await expect(percent).toBeChecked()
    await percent.uncheck()
    await expect(unrecovered.locator('.overview-y-tick').first()).toHaveText(/€$/)
    // The objects' checkboxes top to bottom in equal columns, on the same columns as the total's.
    const objects = panel.getByRole('group', { name: 'Kohteet' }).locator('label')
    expect(await objects.count()).toBeGreaterThan(6)
    const rows = await legendRows(objects)
    expectColumns(rows, 'several')
    const total = (await panel.locator('label', { hasText: 'Kaikki yhteensä' }).boundingBox())!
    expect(Math.round(total.x)).toBe(rows[0].x)
    // A row is a click target along its width, not only at the box.
    const first = objects.first()
    const box = (await first.boundingBox())!
    await first.click({ position: { x: box.width - 4, y: box.height / 2 } })
    await expect(first.getByRole('checkbox')).not.toBeChecked()
    await first.click({ position: { x: box.width - 4, y: box.height / 2 } })
    await expect(first.getByRole('checkbox')).toBeChecked()
    expect(await unrecovered.locator('.portfolio-line').count()).toBeGreaterThan(3)
    await expect(unrecovered.locator('.portfolio-total')).toHaveCount(1)
    // Pointing at a month lists every shown line, the total first; a click keeps it.
    const tip = unrecovered.locator('xpath=..').locator('.chart-tip')
    await unrecovered.locator('.chart-point-hit').last().click()
    await expect(tip.locator('.chart-tip-row').first()).toContainText('Kaikki yhteensä')
    expect(await tip.locator('.chart-tip-row').count()).toBeGreaterThan(3)

    // A phone: one column, nothing to scroll sideways.
    await page.setViewportSize({ width: 360, height: 800 })
    await expect.poll(async () => new Set((await legendRows(objects)).map((r) => r.x)).size).toBe(1)
    expectColumns(await legendRows(objects), 1)
    await expect
      .poll(() => page.locator('main.workspace').evaluate((w) => w.scrollWidth - w.clientWidth))
      .toBe(0)
  })
})

test.describe('rental object tabs', () => {
  test('the page opens on the overview; a tab is in the address and moves with the arrow keys; it fits a phone', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/property/4')
    const tabs = page.getByRole('tablist')
    await expect(tabs.getByRole('tab')).toHaveText([/^Yleiskatsaus/, /^Vuokrasuhteet/, /^Vesimaksut/, /^Taloyhtiö/, /^Asiakirjat/, /^Talous/])
    await expect(page.getByRole('tab', { name: 'Yleiskatsaus' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.property-now', { hasText: 'Vuokrasuhde nyt' })).toContainText('Ei vuokrasopimuksia.')

    // A quick action opens a new card on its tab, in place.
    await page.getByRole('button', { name: '+ Vesitasaus' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/water\/new$/)
    const waterCard = page.locator('.property-water .property-lease-card-edit')
    await expect(waterCard).toHaveCount(1)
    await waterCard.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(waterCard).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/4\/water$/)
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)

    await page.getByRole('tab', { name: 'Yleiskatsaus' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/#\/property\/4\/leases$/)
    await expect(page.getByRole('tab', { name: /^Vuokrasuhteet/ })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Vuokrasuhteet' })).toBeVisible()
    // Each tab adds its own kind of row.
    // A new lease card opens in place, at the top of the tab (the address names it), and Peru closes it.
    await page.locator('.property-leases').getByRole('button', { name: '+ Vuokrasopimus' }).click()
    const newCard = page.locator('.property-leases .property-lease-card-edit')
    await expect(newCard).toHaveCount(1)
    await expect(page).toHaveURL(/#\/property\/4\/leases\/new$/)
    await newCard.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(newCard).toHaveCount(0)
    // The address alone opens the tab.
    await page.goto('/#/properties')
    await page.goto('/#/property/4/docs')
    await expect(page.getByRole('tab', { name: /^Asiakirjat/ })).toHaveAttribute('aria-selected', 'true')

    // On a phone the bar scrolls sideways, the page does not.
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(tabs).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  })
})

test.describe('rental object on a phone', () => {
  test('at the largest text size no tab runs past the screen: tabs wrap, long file names are cut', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tilari.display', JSON.stringify({ textScale: 1.375, contentWidth: 'normal' })))
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    // A lease whose contract has a long file name, and a later contract linked only as a document:
    // the book suggests a lease from it.
    const upload = async (lease: Locator, name: string) => {
      const chooser = page.waitForEvent('filechooser')
      await lease.locator('label', { hasText: 'Lataa sopimus' }).click()
      await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
      await expect(lease.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto/)
    }
    const lease = await newLeaseCard(page)
    await lease.getByLabel('Vuokralainen').first().fill('Testi Vuokralainen')
    await lease.getByLabel('Vuokralainen').first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    await lease.getByLabel('Päättyy').fill('2025-03-31')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await upload(lease, 'Vuokrasopimus Esimerkkitie 99 A 1 Testi Vuokralainen allekirjoitettu.pdf')
    await saveLeaseCard(page)
    const later = await newLeaseCard(page)
    await later.getByLabel('Vuokralainen').first().fill('Toinen Vuokralainen Oy')
    await later.getByLabel('Vuokralainen').first().press('Escape')
    await later.getByLabel('Alkaa', { exact: true }).fill('2025-04-01')
    await upload(later, 'Esimerkkitie 99 A 1 vuokrasopimus ja vuokrankorotus 1.4.2025 alkaen skannattu.pdf')
    // No lease is saved (no tenant, no start); its contract stays, linked as a document.
    await later.getByLabel('Vuokralainen').first().fill('')
    await later.getByLabel('Vuokralainen').first().press('Escape')
    await later.getByLabel('Alkaa', { exact: true }).fill('')
    await saveLeaseCard(page)

    await page.setViewportSize({ width: 360, height: 740 })
    const workspace = page.locator('main.workspace')
    for (const name of ['Yleiskatsaus', 'Vuokrasuhteet', 'Vesimaksut', 'Taloyhtiö', 'Asiakirjat', 'Talous']) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) })
      // Every tab is in sight: the bar wraps instead of scrolling.
      expect((await tab.boundingBox())!.x + (await tab.boundingBox())!.width, name).toBeLessThanOrEqual(360)
      await tab.click()
      if (name === 'Vuokrasuhteet') await expect(page.getByText('Ehdotukset kirjanpidosta (1)')).toBeVisible()
      expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), name).toBeLessThanOrEqual(0)
    }
    // A card in edit fits too: the suggested lease on its own card, its long contract name picked.
    await page.getByRole('tab', { name: /^Vuokrasuhteet/ }).click()
    await page.locator('.property-leases').getByRole('button', { name: 'Lisää', exact: true }).click()
    const card = page.locator('.property-lease-card-edit')
    await expect(card.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto/)
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'card').toBeLessThanOrEqual(0)
    await card.getByRole('button', { name: 'Peru', exact: true }).click()
    await page.locator('.property-leases li').filter({ hasText: 'Testi Vuokralainen' }).getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await expect(card).toHaveCount(1)
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'lease card').toBeLessThanOrEqual(0)
    // So do a water card and a Talous section in edit.
    await page.getByRole('tab', { name: /^Vesimaksut/ }).click()
    await page.locator('.property-water').getByRole('button', { name: '+ Vesitasaus' }).click()
    await expect(page.locator('.property-water .property-lease-card-edit')).toHaveCount(1)
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'water card').toBeLessThanOrEqual(0)
    await page.getByRole('tab', { name: /^Talous/ }).click()
    const valuations = page.locator('.property-finance-valuations')
    await valuations.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await valuations.getByRole('button', { name: 'Lisää arvio' }).click()
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'valuations').toBeLessThanOrEqual(0)
  })
})

test.describe('rental object leases', () => {
  test('a lease added on its card shows on the object page and in the list', async ({ page }) => {
    await openBook(page)
    // The notice voucher is dated on the book's day: inside the test book's last fiscal year.
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4/leases')
    await expect(page.getByRole('heading', { name: 'Vuokrasuhteet' })).toBeVisible()
    await expect(page.locator('.property-leases').getByText('Ei vuokrasopimuksia.', { exact: false })).toBeVisible()
    await expect(page.locator('.property-leases').getByRole('button', { name: '+ Vuokrasopimus' })).toBeVisible()

    const lease = await newLeaseCard(page)
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
    // The picked notice's file opens from its pill.
    await expect(increase.locator('.pill-doc')).toHaveText(/^vuokrankorotusilmoitus-.*-2026-01-01\.pdf$/)

    // Undo deletes the voucher again; then write it once more and keep it.
    page.once('dialog', (dialog) => void dialog.accept())
    await increase.getByRole('button', { name: 'Poista korotusilmoitus' }).click()
    await expect(notice).toHaveValue('–')
    await expect(increase.locator('.pill-doc')).toHaveCount(0)
    const again = page.waitForEvent('download')
    await increase.getByRole('button', { name: 'Luo korotusilmoitus' }).click()
    await again
    await expect(notice).toHaveValue(/Vuokrankorotusilmoitus Asunto 1\.1\.2026/)
    await saveLeaseCard(page)

    const card = page.locator('.property-lease-card')
    await expect(card).toContainText('Testi Vuokralainen')
    await expect(card).toContainText('1.1.2025 alkaen')
    // On the as-of date (31.12.2025) the starting rent is in force; the increase comes in January.
    await expect(card).toContainText('670,00 €/kk (vuokra 650,00 €, vesi 20,00 €) · eräpäivä 2. · korotus 15,00 € vuodessa')
    await card.getByText('Korotukset (1)').click()
    await expect(card.getByRole('button', { name: /Vuokrankorotusilmoitus .* 1\.1\.2026/ })).toHaveCount(1)
    // The undone notice is gone from the book: the card's pickers offer only the kept one.
    await card.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    const form = page.locator('.property-lease-card-edit')
    const picker = form.getByRole('textbox', { name: 'Sopimus' })
    await picker.click()
    await picker.fill('Vuokrankorotusilmoitus')
    await expect(page.getByRole('option', { name: /Vuokrankorotusilmoitus Asunto/ })).toHaveCount(1)
    await picker.press('Escape')

    // A notice written on an earlier visit is deleted from the book when the card is saved.
    const saved = form.locator('.property-lease-increase').first()
    page.once('dialog', (dialog) => void dialog.accept())
    await saved.getByRole('button', { name: 'Poista korotusilmoitus' }).click()
    await expect(saved.getByRole('textbox', { name: 'Korotusilmoitus' })).toHaveValue('–')
    await saveLeaseCard(page)
    await card.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    const search = form.getByRole('textbox', { name: 'Sopimus' })
    await search.click()
    await search.fill('Vuokrankorotusilmoitus')
    await expect(page.getByRole('option', { name: /Vuokrankorotusilmoitus Asunto/ })).toHaveCount(0)
    await search.press('Escape')
    await form.getByRole('button', { name: 'Peru', exact: true }).click()

    await page.goto('/#/properties')
    await expect(page.locator('.property-table').first()).toContainText('Testi Vuokralainen · 650,00 €/kk')
  })

  test('a VAT lease shows its VAT on the card and in the months, and warns of rent booked without it', async ({ page }) => {
    await openBook(page)
    const lease = await newLeaseCard(page)
    const tenant = lease.getByRole('combobox', { name: 'Vuokralainen' }).or(lease.getByLabel('Vuokralainen'))
    await tenant.first().fill('Testi Yritys Oy')
    await tenant.first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('500')
    // VAT is an extra beside the parking space; the amounts stay without it.
    await lease.getByLabel('ALV', { exact: true }).check()
    await expect(lease.getByText('Summat ilman ALV:tä · ALV 25,5 % 127,50 € · yhteensä 627,50 €/kk')).toBeVisible()
    await saveLeaseCard(page)

    // The test book's rent is booked without VAT: the object warns, and each such payment is marked.
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await expect(page.getByText(/Vuokrasta puuttuu ALV \(Testi Yritys Oy\)/)).toBeVisible()
    await page.getByRole('tab', { name: /^Vuokrasuhteet/ }).click()
    const card = page.locator('.property-lease-card')
    await expect(card).toContainText('500,00 €/kk + ALV 25,5 % 127,50 € = 627,50 €/kk')
    await card.getByText(/^Kuukausittain/).click()
    await expect(card.locator('.property-rent-table th', { hasText: /^ALV$/ })).toBeVisible()
    await expect(card.locator('.property-rent-table .btn-link.neg').first()).toContainText('⚠')
  })
})

test.describe('rental object kinds', () => {
  test('a parking space or garage offers no water and no parking extra', async ({ page }) => {
    await openBook(page)
    let lease = await newLeaseCard(page)
    const cancel = () => page.locator('.property-lease-card-edit').getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(lease.getByLabel('Vesi €/kk')).toHaveCount(1)
    await expect(lease.getByText('Vesimaksu tasataan kulutuksen mukaan')).toBeVisible()
    await expect(lease.getByRole('checkbox', { name: 'Autopaikka', exact: true })).toBeVisible()
    await cancel()
    const water = page.getByRole('tab', { name: /^Vesimaksut/ })
    await expect(water).toHaveCount(1)
    await page.goto('/#/property/4/edit')

    // The kind is set on the edit page; the object has no water tab then, and the lease card follows it.
    for (const kind of ['Autopaikka', 'Autotalli']) {
      await page.getByLabel('Laji').selectOption({ label: kind })
      await page.getByRole('main').getByRole('button', { name: 'Tallenna', exact: true }).click()
      await expect(page).toHaveURL(/#\/property\/4$/)
      await expect(water).toHaveCount(0)
      lease = await newLeaseCard(page)
      await expect(lease.getByLabel('Vuokra €/kk')).toBeVisible()
      await expect(lease.getByLabel('Vesi €/kk')).toHaveCount(0)
      await expect(lease.getByText('Vesimaksu tasataan kulutuksen mukaan')).toHaveCount(0)
      await expect(lease.getByRole('checkbox', { name: 'Autopaikka', exact: true })).toHaveCount(0)
      // A parking space can still be let with VAT.
      await expect(lease.getByRole('checkbox', { name: 'ALV', exact: true })).toBeVisible()
      await cancel()
      await page.goto('/#/property/4/edit')
    }
    lease = await newLeaseCard(page)
    // Alkaen, rent and the total share the row.
    await lease.getByLabel('Vuokra €/kk').fill('40')
    await expect(lease.locator('.property-lease-amounts').first()).toContainText('40,00')
  })
})

test.describe('rental object documents', () => {
  test('a linked document is a line: its voucher and its file open from pills, and it fits a phone', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    // An uploaded contract is a Liitetieto voucher; linked to the object as well, it lists under Asiakirjat.
    const lease = await newLeaseCard(page)
    const tenant = lease.getByRole('combobox', { name: 'Vuokralainen' }).or(lease.getByLabel('Vuokralainen'))
    await tenant.first().fill('Testi Vuokralainen')
    await tenant.first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    const chooser = page.waitForEvent('filechooser')
    await lease.locator('label', { hasText: 'Lataa sopimus' }).click()
    await (await chooser).setFiles({ name: 'sopimus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sopimus') })
    await expect(lease.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto/)
    await saveLeaseCard(page)
    await page.getByRole('tab', { name: /^Asiakirjat/ }).click()

    const docs = page.locator('.property-docs')
    await expect(docs.locator('.section-label')).toHaveText(['Linkitetyt (sopimukset ja ilmoitukset)'])
    const line = docs.locator('.doc-line', { hasText: 'Vuokrasopimus Asunto' })
    const file = line.getByRole('link', { name: 'sopimus.pdf' })
    await expect(file).toBeVisible()
    // The purple pill opens the voucher, and the way back returns to the object's tab.
    await line.getByRole('button', { name: /^Vuokrasopimus Asunto .*, 15\.12\.2025$/ }).click()
    await expect(page).toHaveURL(/#\/property\/4\/docs\/voucher\/\d+/)
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/docs$/)

    const title = line.locator('.doc-line-title')
    for (const [width, rows] of [
      [1500, 1],
      [900, 2],
    ]) {
      await page.setViewportSize({ width, height: 900 })
      const titleBox = (await title.boundingBox())!
      const fileBox = (await file.boundingBox())!
      expect(fileBox.y >= titleBox.y + titleBox.height - 1 ? 2 : 1, `rows at ${width}`).toBe(rows)
    }
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(line.locator('.pill-date')).toBeVisible()
    await expect(line.locator('.pill-number')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  })
})

test.describe('rental object documents linked on their tab', () => {
  test('a document no lease holds is unlinked and linked again on the Asiakirjat tab', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    // A contract uploaded on a lease card that is then left without a lease: linked as a document only.
    const lease = await newLeaseCard(page)
    await lease.getByLabel('Vuokralainen').first().fill('Testi Vuokralainen')
    await lease.getByLabel('Vuokralainen').first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    const chooser = page.waitForEvent('filechooser')
    await lease.locator('label', { hasText: 'Lataa sopimus' }).click()
    await (await chooser).setFiles({ name: 'sopimus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sopimus') })
    await expect(lease.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto/)
    await lease.getByLabel('Vuokralainen').first().fill('')
    await lease.getByLabel('Vuokralainen').first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('')
    await saveLeaseCard(page)

    await page.getByRole('tab', { name: /^Asiakirjat/ }).click()
    const docs = page.locator('.property-docs')
    const line = docs.locator('.doc-line', { hasText: 'Vuokrasopimus Asunto' })
    await expect(docs.locator('.section-label').first()).toHaveText('Linkitetyt (sopimukset ja ilmoitukset)')
    await line.getByRole('button', { name: 'Poista linkki' }).click()
    await expect(line).toHaveCount(0)
    await expect(docs.getByText('Linkitetyt (sopimukset ja ilmoitukset)')).toHaveCount(0)

    // "+ Asiakirja" opens the picker at the top of the tab; a pick links it at once.
    await docs.getByRole('button', { name: '+ Asiakirja' }).click()
    const pick = docs.getByRole('textbox', { name: 'Lisää Liitetieto-tosite…' })
    await pick.click()
    await pick.fill('Vuokrasopimus')
    await page.getByRole('option', { name: /Vuokrasopimus Asunto/ }).click()
    await expect(line).toBeVisible()
    await expect(docs.locator('.section-label').first()).toHaveText('Linkitetyt (sopimukset ja ilmoitukset)')
    await expect(pick).toHaveCount(0)
  })
})

test.describe('rental object housing-company loans', () => {
  test('a loan is added on its card with a certificate, copied to another object, and the tab fits a phone', async ({ page }) => {
    await openBook(page, propertiesBook, 'Esimerkki Vuokraus Oy')
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2026-06-15')
    await page.goto('/#/property/10/housing')
    await expect(page.getByRole('tab', { name: /^Taloyhtiö/ })).toHaveAttribute('aria-selected', 'true')
    const loans = page.locator('.property-housing-loans')
    await expect(loans.getByText('Ei yhtiölainoja.')).toBeVisible()
    // No other object has a loan yet: nothing to copy.
    await expect(loans.getByRole('button', { name: 'Kopioi toisesta kohteesta' })).toHaveCount(0)

    await loans.getByRole('button', { name: '+ Lisää laina' }).click()
    await expect(page).toHaveURL(/#\/property\/10\/housing\/new$/)
    const card = page.locator('.property-loan-card-edit')
    // An empty form is not saved: each field a loan needs is marked with its reason and listed (rows by
    // section and number), and the first has the focus. A mark goes as its field is filled.
    await card.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(card).toHaveCount(1)
    const issues = card.locator('.form-issues li')
    await expect(issues).toHaveCount(10)
    await expect(issues.first()).toHaveText('Laina: puuttuu')
    await expect(issues.last()).toHaveText('Viitekorot, rivi 1: Viitekorko %: puuttuu')
    const name = card.getByLabel('Laina · puuttuu')
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()
    await name.fill('Putkiremontti')
    await expect(issues).toHaveCount(9)
    await expect(card.getByLabel('Laina', { exact: true })).not.toHaveAttribute('aria-invalid')
    await card.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(card).toHaveCount(0)

    // A new loan has a row for its share, its rahoitusvastike and its rate.
    await loans.getByRole('button', { name: '+ Lisää laina' }).click()
    await card.getByLabel('Laina', { exact: true }).fill('Putkiremontti')
    await card.getByLabel('Nostettu', { exact: true }).fill('2020-01-01')
    await card.getByLabel('Viimeinen eräpäivä').fill('2044-12-31')
    await card.getByLabel('Marginaali %').fill('0,8')
    const rows = card.locator('.property-lease-increase')
    await expect(rows).toHaveCount(3)

    const certificate = rows.nth(0)
    await certificate.getByLabel('Päivä', { exact: true }).fill('2026-03-01')
    await certificate.getByLabel('Velkaosuus').fill('12000')
    const chooser = page.waitForEvent('filechooser')
    await certificate.locator('label', { hasText: 'Lataa tiedosto' }).click()
    await (await chooser).setFiles({ name: 'todistus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 todistus') })
    await expect(certificate.getByRole('textbox', { name: 'Isännöitsijäntodistus' })).toHaveValue(/Isännöitsijäntodistus/)

    const charge = rows.nth(1)
    await charge.getByLabel('Alkaen').fill('2026-01-01')
    await charge.getByLabel('Rahoitusvastike €/kk').fill('80')
    await charge.getByRole('checkbox', { name: 'Rahastoitu' }).check()
    await charge.getByRole('checkbox', { name: 'Ei asiakirjaa' }).check()

    const rate = rows.nth(2)
    await rate.getByLabel('Alkaen').fill('2026-03-01')
    await rate.getByLabel('Viitekorko %').fill('2,1')
    await expect(rate).toContainText(/2,900\s%/)

    await card.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(card).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/10\/housing$/)
    const saved = loans.locator('.property-loan-card')
    // The card's figures, a tile each: label, figure, what it rests on.
    const figure = (label: string) => saved.locator('.property-loan-figure', { has: page.locator('.property-loan-figure-label', { hasText: label }) })
    // The share month by month from the payments to the housing company, to the as-of month (May):
    // April 12 000,00 - (80,00 - 29,00), May 11 949,00 - (80,00 - 28,88).
    await expect(figure('Laskettu velkaosuus 31.5.2026')).toContainText(/11\s897,88\s€Todistus 1\.3\.2026: 12\s000,00\s€/)
    // Repaid since the share is followed (here the books' first month), and the interest with it.
    await expect(figure('Lyhennetty yhteensä')).toContainText(/254,38\s€1\/2026–5\/2026korkoa 145,62\s€/)
    await expect(figure('Rahoitusvastike')).toContainText(/80,00\s€\/kk1\.1\.2026 alkaenRahastoitu/)
    await expect(saved.locator('.property-loan-figure .pill', { hasText: 'Rahastoitu' })).toHaveCount(1)
    await expect(figure('Korko')).toContainText(/2,900\s%12 kk Euribor 2,100\s% \+ 0,800\s%1\.3\.2026 alkaen/)
    await expect(figure('Laina-aika')).toContainText(/1\.1\.2020.31\.12\.2044korko muuttuu/)
    // Its lists as small tabs, one open at a time.
    await expect(saved.locator('.property-loan-fold')).toHaveText(['Kuukausittain 5', 'Velkaosuudet 1', 'Rahoitusvastikkeet 1', 'Viitekorot 1'])
    await saved.getByRole('button', { name: 'Kuukausittain 5', exact: true }).click()
    const table = saved.locator('.property-loan-table')
    await expect(table.locator('tbody tr').first()).toContainText(/toukokuu 2026.*5\.5\.2026 300,00\s€.*80,00\s€.*28,88\s€.*51,12\s€.*11\s897,88\s€/)
    await expect(table.locator('.property-loan-certificate-row')).toHaveText(/^Isännöitsijäntodistus 1\.3\.2026: 12\s000,00\s€$/)
    await expect(table.locator('tr.property-loan-backward')).toHaveCount(2)
    // Each month is a point on the chart: pointing at one shows its figures, a click or an arrow key
    // picks it, and the month picked is marked in the table.
    const chart = saved.locator('.line-chart')
    await expect(chart.locator('.property-loan-share .chart-line-dot')).toHaveCount(5)
    const tip = chart.locator('.chart-tip')
    await expect(tip).toBeHidden()
    await chart.locator('.chart-point-hit').last().hover()
    await expect(tip).toContainText(/^toukokuu 2026Velkaosuus11\s897,88\s€Rahoitusvastike80,00\s€Korko28,88\s€ \(2,900\s%\)Lyhennys51,12\s€$/)
    await chart.locator('.chart-point-hit').nth(2).click()
    await expect(tip).toContainText('Isännöitsijäntodistus 1.3.2026')
    await expect(table.locator('tr.is-selected')).toContainText('maaliskuu 2026')
    await chart.locator('svg').press('ArrowRight')
    await expect(table.locator('tr.is-selected')).toContainText('huhtikuu 2026')
    await expect(tip).toContainText(/^huhtikuu 2026/)
    // The estimate to the loan's end: the line runs on dashed, its months summed by year repay the share.
    await saved.getByRole('checkbox', { name: 'Arvio laina-ajan loppuun' }).check()
    await expect(chart.locator('.property-loan-share.property-loan-ahead .chart-line')).toHaveCount(1)
    const ahead = saved.locator('.property-loan-forecast-years')
    await expect(ahead).toContainText(/Velkaosuus maksettu 31\.12\.2044 mennessä, kun korko pysyy 2,900\s%\./)
    await expect(ahead.locator('tbody tr').first()).toContainText(/^2026/)
    await expect(ahead.locator('tbody tr').last()).toContainText(/^2044.*0,00\s€$/)
    await expect(ahead.locator('tfoot')).toContainText(/11\s897,88\s€/)
    await chart.locator('.chart-point-hit').last().hover()
    await expect(tip).toContainText(/^joulukuu 2044 \(arvio\)Velkaosuus0,00\s€/)
    await saved.getByRole('checkbox', { name: 'Arvio laina-ajan loppuun' }).uncheck()
    await expect(ahead).toHaveCount(0)
    // Interest, and repayment with it, summed from the first month: lines on the share's scale.
    await saved.getByRole('checkbox', { name: 'Lyhennys + korko yhteensä', exact: true }).check()
    await saved.getByRole('checkbox', { name: 'Korko yhteensä', exact: true }).check()
    await expect(chart.locator('.property-loan-paid .chart-line')).toHaveCount(1)
    await expect(chart.locator('.property-loan-interest .chart-line')).toHaveCount(1)
    await chart.locator('.chart-point-hit').last().hover()
    await expect(tip).toContainText(/Lyhennys \+ korko yhteensä400,00\s€Korko yhteensä145,62\s€$/)
    // The choices hold for every loan in this browser.
    expect(await page.evaluate(() => localStorage.getItem('tilari.properties.loanChart'))).toBe('{"interest":true,"paid":true,"forecast":false}')
    // The certificate is the housing company's document, held by the loan: not unlinked on Asiakirjat.
    const housingDocs = page.locator('.property-housing-docs')
    await expect(housingDocs.locator('.doc-line', { hasText: 'Isännöitsijäntodistus' })).toContainText('Velkaosuus 1.3.2026, Putkiremontti')
    await page.getByRole('tab', { name: /^Asiakirjat/ }).click()
    const docLine = page.locator('.property-docs .doc-line', { hasText: 'Isännöitsijäntodistus' })
    await expect(docLine).toBeVisible()
    await expect(docLine.getByRole('button', { name: 'Poista linkki' })).toHaveCount(0)

    // The share in the figures: a tile on the overview, with what is still to recover debt-free.
    const kpi = (label: string) => page.locator('.overview-kpi', { has: page.locator('.overview-kpi-label', { hasText: new RegExp(`^${label}$`) }) })
    await page.getByRole('tab', { name: /^Yleiskatsaus/ }).click()
    await expect(kpi('Velkaosuus')).toContainText(/^Velkaosuus11\s898\s€velattomana palauttamatta \d/)
    // The payback chart under the cash flow draws the share too, dashed, from the months it is followed.
    await expect(page.locator('.property-share-line .chart-line')).toHaveCount(1)
    await expect(page.locator('.overview-legend', { has: page.locator('.property-swatch-share') })).toContainText('Velkaosuus')
    // A month's box names each line with its colour, as the legend does.
    const payback = page.locator('.line-chart', { has: page.locator('.property-share-line') })
    await payback.locator('.chart-point-hit').last().hover()
    await expect(payback.locator('.chart-tip-row')).toHaveText([/^Palauttamatta/, /^Kertynyt kassavirta/, /^Velkaosuus/])
    await expect(payback.locator('.chart-tip-row .chart-tip-swatch')).toHaveCount(3)
    // On Talous: the rahoitusvastike paid in 2026 split as on the card, the break-even price debt-free.
    await page.getByRole('tab', { name: /^Talous/ }).click()
    const years = page.locator('.property-section', { has: page.getByRole('heading', { name: 'Tilikausittain' }) })
    await expect(years.locator('thead')).toContainText(/Yhtiölainan korko.*Yhtiölainan lyhennys/)
    await expect(years.locator('tbody tr', { hasText: '1.1.2026' })).toContainText(/145,62\s€254,38\s€/)
    await expect(page.locator('.property-breakeven')).toContainText(/velaton hinta, velkaosuus 11\s898\s€ 31\.5\.2026/)
    // The portfolio: the shares together, a column, and a chart of them.
    await page.goto('/#/properties')
    await expect(kpi('Yhtiölainaosuudet')).toContainText(/11\s898\s€/)
    await expect(page.locator('.property-table').first().locator('thead')).toContainText('Velkaosuus')
    await expect(page.getByRole('heading', { name: 'Yhtiölainaosuudet kuukauden lopussa' })).toBeVisible()

    // Another object copies the loan's terms; its share and charges are its own.
    await page.goto('/#/property/30/housing')
    await loans.getByRole('button', { name: 'Kopioi toisesta kohteesta' }).click()
    const pick = loans.getByRole('textbox', { name: 'Kopioi toisesta kohteesta' })
    await pick.click()
    await page.getByRole('option', { name: /Putkiremontti/ }).click()
    await expect(card.getByLabel('Laina', { exact: true })).toHaveValue('Putkiremontti')
    await expect(card.getByLabel('Marginaali %')).toHaveValue('0,8')
    await expect(card.getByText('Ehdot kopioitu toisen kohteen lainasta.', { exact: false })).toBeVisible()
    // The copied rate, and empty rows for the object's own share and rahoitusvastike, which a save asks for.
    await expect(card.locator('.property-lease-increase')).toHaveCount(3)
    await card.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(card.locator('.form-issues li')).toHaveText([
      'Velkaosuudet, rivi 1: Päivä: puuttuu',
      'Velkaosuudet, rivi 1: Velkaosuus: puuttuu',
      'Rahoitusvastikkeet, rivi 1: Alkaen: puuttuu',
      'Rahoitusvastikkeet, rivi 1: Rahoitusvastike €/kk: puuttuu',
    ])
    const copyRows = card.locator('.property-lease-increase')
    await copyRows.nth(0).getByLabel('Päivä · puuttuu').fill('2025-01-01')
    await copyRows.nth(0).getByLabel('Velkaosuus · puuttuu').fill('5000')
    await copyRows.nth(1).getByLabel('Alkaen · puuttuu').fill('2025-01-01')
    await copyRows.nth(1).getByLabel('Rahoitusvastike €/kk · puuttuu').fill('40')
    await expect(card.locator('.form-issues li')).toHaveCount(0)
    await card.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(card).toHaveCount(0)
    const garage = loans.locator('.property-loan-card')
    await expect(garage.locator('.property-loan-figure').first()).toContainText(/Todistus 1\.1\.2025: 5\s000,00\s€/)
    // The garage pays no housing company in the book: each charge counts as paid. An "i" by the share
    // says so on hover, and under the figures on a click.
    const info = garage.getByRole('button', { name: /^Kirjanpidosta ei löytynyt kohteen kuukausittaisia maksuja taloyhtiölle/ })
    await expect(info).toHaveAttribute('title', /olettaa jokaisen kuukauden rahoitusvastikkeen maksetuksi/)
    await expect(garage.locator('.property-loan-note')).toHaveCount(0)
    await info.click()
    await expect(garage.locator('.property-loan-note')).toContainText('olettaa jokaisen kuukauden rahoitusvastikkeen maksetuksi')
    // The share's and the charge's documents are missing: they mark the tab.
    await expect(page.getByRole('tab', { name: /^Taloyhtiö/ }).locator('.tabs-mark-crit')).toHaveCount(1)

    await page.setViewportSize({ width: 360, height: 740 })
    const workspace = page.locator('main.workspace')
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'housing tab').toBeLessThanOrEqual(0)
    await loans.locator('.property-loan-card').getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await expect(card).toHaveCount(1)
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'loan card').toBeLessThanOrEqual(0)
    // Talous too, with long words in its acquisition-cost movements: each takes two lines.
    await page.goto('/#/property/60/finance')
    await expect(page.locator('.property-era td.property-col-text').first()).toBeVisible()
    expect(await workspace.evaluate((el) => el.scrollWidth - el.clientWidth), 'finance tab').toBeLessThanOrEqual(0)
  })
})

test.describe('rental object figures edited on Talous', () => {
  test('each section has its own Muokkaa and saves only itself; the overview adds a price estimate there', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/property/4/finance')

    // Sale costs and target: a wrong percentage is refused in the section, which stays open.
    const sale = page.locator('.property-finance-sale')
    await expect(sale).toContainText('Myyntikulut, % velattomasta hinnasta: – · Myyntikulut, kiinteä €: – · Tavoitetuotto, % vuodessa: –')
    await sale.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await sale.getByLabel('Myyntikulut, % velattomasta hinnasta').fill('kaksi')
    await sale.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(sale.locator('.error')).toHaveText('Prosentti muodossa 3,5.')
    await sale.getByLabel('Myyntikulut, % velattomasta hinnasta').fill('2,5')
    await sale.getByLabel('Myyntikulut, kiinteä €').fill('1000')
    await sale.getByLabel('Tavoitetuotto, % vuodessa').fill('6')
    await sale.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(sale).toContainText(/Myyntikulut, % velattomasta hinnasta: 2,5 % · Myyntikulut, kiinteä €: 1\s000,00\s€ · Tavoitetuotto, % vuodessa: 6 %/)

    // Other capital: a row added and saved.
    const capital = page.locator('.property-finance-capital')
    await expect(capital).toContainText('Ei muuta sijoitettua pääomaa.')
    await capital.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await capital.getByRole('button', { name: 'Lisää rivi' }).click()
    await capital.getByLabel('Päivä').fill('2024-01-01')
    await capital.getByLabel('Summa €').fill('5000')
    await capital.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(capital).toContainText(/1\.1\.2024\s*5\s000,00/)
    // The sale costs stay as saved: a section's save leaves the others alone.
    await expect(sale).toContainText('2,5 %')

    // The bank loan refuses an account that is not a number; Peru leaves it as it was.
    const loan = page.locator('.property-finance-loan')
    await loan.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await loan.getByLabel('Lainatilit').fill('laina')
    await loan.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(loan.locator('.error')).toHaveText('Tilinumerot pilkuilla eroteltuina.')
    await loan.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(loan).toContainText('Kohteelle ei ole linkitetty omaa lainaa.')

    // The overview's "+ Hinta-arvio" opens Talous's price estimates with a new row.
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await page.getByRole('button', { name: '+ Hinta-arvio' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/finance$/)
    const valuations = page.locator('.property-finance-valuations')
    await valuations.getByLabel('Myyntihinta (ilman lainaosuutta)').fill('120000')
    await valuations.getByLabel('Lähde').fill('Oma arvio')
    await valuations.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(valuations).toContainText(/120\s000,00/)
    await expect(valuations).toContainText('Oma arvio')
  })
})

test.describe('rental object deposits', () => {
  test('a deposit booked for the object is offered for its lease, linked and shown with its balance', async ({ page }) => {
    await openBook(page)
    // The golden book has no deposit account: the deposit goes on a liability account, its text names it.
    await page.goto('/#/voucher/new/200')
    await expect(page.getByLabel('Otsikko')).toBeVisible()
    await page.getByLabel('Otsikko').fill('Vuokravakuus Asunto')
    await page.getByLabel('Tositteen pvm').fill('2025-01-05')
    const customer = page.getByLabel('Asiakas')
    await customer.fill('Testi Vuokralainen')
    await customer.press('Escape')
    const income = page.getByLabel('Tulotili')
    await expect(income).toBeVisible({ timeout: 30_000 })
    await income.click()
    await page.getByRole('option', { name: /^2000 / }).click()
    // No VAT: the whole amount on the liability account.
    await page.locator('.assistant-vat .vat-select-type .icon-select-btn').click()
    await page.getByRole('option', { name: 'Veroton', exact: true }).click()
    await page.getByLabel('Määrä', { exact: true }).fill('500')
    await editorSaveButton(page).click()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)

    const lease = await newLeaseCard(page)
    const tenant = lease.getByRole('combobox', { name: 'Vuokralainen' }).or(lease.getByLabel('Vuokralainen'))
    await tenant.first().fill('Testi Vuokralainen')
    await tenant.first().press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-01-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    // Booked for the object and received near the lease's start: starred.
    await lease.getByLabel('Lisää vakuus…').click()
    await page.getByRole('option', { name: /^★ 5\.1\.2025 · Vuokravakuus Asunto · Testi Vuokralainen · 500,00\s€$/ }).click()
    const linked = lease.locator('.property-lease-deposit .property-doc-list')
    await expect(linked).toContainText('5.1.2025 · Vuokravakuus Asunto')
    // Each booking opens its voucher from the form.
    await expect(linked.getByRole('button', { name: /^Saatu 5\.1\.2025 500,00\s€$/ })).toBeVisible()
    await saveLeaseCard(page)

    const card = page.locator('.property-lease-card')
    await expect(card).toContainText(/Vuokravakuus: saatu 500,00\s€ · saldo 500,00\s€/)
    await card.getByText('Vakuuden kirjaukset (1)').click()
    await expect(card.locator('.property-deposit li')).toContainText(/Saatu\s*5\.1\.2025 500,00\s€/)
  })
})

test.describe('rental object lease cards in place', () => {
  test('a lease is added and changed on its own card; an overlap is refused on the card, which stays open', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4/leases')
    await page.locator('.property-leases').getByRole('button', { name: '+ Vuokrasopimus' }).click()
    const form = page.locator('.property-lease-card-edit')
    const tenant = form.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await form.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await form.getByLabel('Vuokra €/kk').first().fill('650')
    await form.getByLabel('Vesi €/kk').first().fill('20')
    await form.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/4\/leases$/)
    const card = page.locator('.property-lease-card')
    await expect(card).toContainText('670,00 €/kk')

    // The card turns into its form and saves only that lease.
    await card.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await form.getByLabel('Vuokra €/kk').first().fill('700')
    await form.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(card).toContainText('720,00 €/kk')

    // A second lease on the same days is refused on its own card.
    await page.locator('.property-leases').getByRole('button', { name: '+ Vuokrasopimus' }).click()
    const other = form.getByLabel('Vuokralainen').first()
    await other.fill('Toinen Vuokralainen')
    await other.press('Escape')
    await form.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await form.getByLabel('Vuokra €/kk').first().fill('500')
    await form.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(form.locator('.error')).toBeVisible()
    await expect(form).toHaveCount(1)
    await form.getByRole('button', { name: 'Peru', exact: true }).click()

    // The owner's first day of rent has its own small Muokkaa under the title.
    await page.locator('.property-rent-dates').getByRole('button', { name: 'Muokkaa' }).click()
    await page.locator('.property-rent-dates-edit').getByLabel('Vuokra omistajalle alkaen').fill('2025-04-01')
    await page.locator('.property-rent-dates-edit').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(page.locator('.property-rent-dates')).toContainText('Vuokra omistajalle alkaen 1.4.2025')
  })

  test('an open card is in the address and keeps its unsaved form through a voucher', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4/leases')
    const leases = page.locator('.property-leases')
    const form = page.locator('.property-lease-card-edit')
    await leases.getByRole('button', { name: '+ Vuokrasopimus' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/leases\/new$/)
    const tenant = form.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await form.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await form.getByLabel('Vuokra €/kk').first().fill('650')
    const chooser = page.waitForEvent('filechooser')
    await form.locator('label', { hasText: 'Lataa sopimus' }).click()
    await (await chooser).setFiles({ name: 'sopimus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sopimus') })
    await expect(form.getByRole('textbox', { name: 'Sopimus' })).toHaveValue(/Vuokrasopimus Asunto Testi Vuokralainen/)
    await form.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/4\/leases$/)

    // A second lease typed on a new card; the first lease's contract opens its voucher, and the way
    // back opens the card again with what was typed.
    await leases.getByRole('button', { name: '+ Vuokrasopimus' }).click()
    const other = form.getByLabel('Vuokralainen').first()
    await other.fill('Toinen Vuokralainen')
    await other.press('Escape')
    await form.getByLabel('Alkaa', { exact: true }).fill('2026-01-01')
    await leases.getByRole('button', { name: /Vuokrasopimus Asunto Testi Vuokralainen/ }).first().click()
    await expect(page).toHaveURL(/#\/property\/4\/leases\/new\/voucher\/\d+\/edit$/)
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/leases\/new$/)
    await expect(form.getByLabel('Vuokralainen').first()).toHaveValue('Toinen Vuokralainen')
    await expect(form.getByLabel('Alkaa', { exact: true })).toHaveValue('2026-01-01')
    await form.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/4\/leases$/)
  })
})

test.describe('rental object rent exceptions', () => {
  test('an agreed exception lowers the expected rent on its days and shows on the card and in the months', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    const lease = await newLeaseCard(page)
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
    await saveLeaseCard(page)

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
    await expect(october.getByRole('button', { name: 'Muokkaa poikkeusta' })).toBeVisible()
    await expect(card.getByText('Poikkeava vuokra (2)')).toBeVisible()
    // A month with an exception changes it in place, the stored one filled in.
    await may.getByRole('button', { name: 'Muokkaa poikkeusta' }).click()
    await expect(form.getByLabel('Alkaen')).toHaveValue('2025-05-01')
    await expect(form.getByLabel('Päättyen')).toHaveValue('2025-05-31')
    await expect(form.getByLabel('Vuokra €/kk')).toHaveValue('450,00')
    await expect(form.getByLabel('Syy')).toHaveValue('Remonttihyvitys')
    await form.getByLabel('Vuokra €/kk').fill('500')
    await form.getByRole('button', { name: 'Tallenna poikkeus' }).click()
    await expect(form).toHaveCount(0)
    await expect(card).toContainText(/Vuokrasaldo 30\.11\.2025: vuokrarästi 5\s210,00\s€/)
    await expect(may.locator('.property-rent-exception')).toHaveText(/520,00\s€\*/)
    await expect(card.getByText('Poikkeava vuokra (2)')).toBeVisible()
    // The same form removes it, once confirmed: the month expects the normal rent again.
    await october.getByRole('button', { name: 'Muokkaa poikkeusta' }).click()
    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      void dialog.accept()
    })
    await form.getByRole('button', { name: 'Poista poikkeus' }).click()
    await expect(form).toHaveCount(0)
    expect(asked).toMatch(/^Poistetaanko poikkeus 1\.10\.2025–31\.10\.2025\?/)
    await expect(card).toContainText(/Vuokrasaldo 30\.11\.2025: vuokrarästi 5\s880,00\s€/)
    await expect(october.locator('.property-rent-exception')).toHaveCount(0)
    await expect(october.getByRole('button', { name: 'Lisää poikkeus' })).toBeVisible()
    await expect(card.getByText('Poikkeava vuokra (1)')).toBeVisible()

    // The card turns into its form, in place, where exceptions are entered.
    await card.getByRole('button', { name: 'Muokkaa', exact: true }).click()
    const cardForm = page.locator('.property-lease-card-edit')
    await expect(cardForm).toHaveCount(1)
    await expect(page).toHaveURL(/#\/property\/4\/leases\/lease\/[^/]+$/)
    await expect(cardForm.locator('.property-lease-exception')).toHaveCount(1)
    // Peruuta gives the card back unchanged.
    await cardForm.getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(cardForm).toHaveCount(0)
    await expect(card.getByText('Poikkeava vuokra (1)')).toBeVisible()
  })
})

test.describe('rental object lease dates', () => {
  test('leases on the same days are refused with both named; an own first day of rent shows as the reason', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    const form = page.locator('.property-lease-card-edit')
    const fill = async (lease: Locator, name: string, starts: string) => {
      const tenant = lease.getByLabel('Vuokralainen').first()
      await tenant.fill(name)
      await tenant.press('Escape')
      await lease.getByLabel('Alkaa', { exact: true }).fill(starts)
      await lease.getByLabel('Vuokra €/kk').first().fill('650')
    }
    await fill(await newLeaseCard(page), 'Testi Vuokralainen', '2025-01-01')
    await saveLeaseCard(page)
    // The second lease's card refuses the overlap, naming both.
    await fill(await newLeaseCard(page), 'Toinen Vuokralainen', '2025-06-01')
    await form.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(form.locator('.form-issues li')).toHaveText(['Alkaa: samoina päivinä kuin sopimus Testi Vuokralainen 1.1.2025 alkaen'])
    await expect(form.getByLabel('Alkaa · samoina päivinä kuin sopimus Testi Vuokralainen 1.1.2025 alkaen')).toHaveAttribute('aria-invalid', 'true')
    await form.getByRole('button', { name: 'Peru', exact: true }).click()

    // The first lease ends before the second starts, each on its own card.
    await page.locator('.property-lease-card', { hasText: 'Testi Vuokralainen' }).getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await form.getByLabel('Päättyy').fill('2025-05-31')
    await saveLeaseCard(page)
    await fill(await newLeaseCard(page), 'Toinen Vuokralainen', '2025-06-01')
    await saveLeaseCard(page)

    // The golden book links no purchase: without an own day the box shows the books' start.
    await page.locator('.property-rent-dates').getByRole('button', { name: 'Muokkaa' }).click()
    const rentDates = page.locator('.property-rent-dates-edit')
    await expect(rentDates.getByLabel('Vuokra omistajalle alkaen')).toHaveValue('2024-01-01')
    await rentDates.getByLabel('Vuokra omistajalle alkaen').fill('2025-02-01')
    await rentDates.getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(rentDates).toHaveCount(0)
    // The ended lease's account starts after the lease: on the owner's day.
    await expect(page.locator('.property-leases')).toContainText('laskettu 1.2.2025 alkaen: omistajan antama päivä')
  })
})

test.describe('rental object reminders', () => {
  test('a lease ending soon, an increase due and no water settlement show on the object and mark the list', async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    const lease = await newLeaseCard(page)
    const tenant = lease.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2024-01-01')
    await lease.getByLabel('Päättyy').fill('2026-02-28')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByLabel('Vesi €/kk').first().fill('20')
    await lease.getByLabel('Korotussääntö').selectOption({ label: 'Euroa vuodessa' })
    await lease.getByLabel('Korotus € / v').fill('15')
    await saveLeaseCard(page)

    // On the as-of date (30.11.2025).
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    const warnings = page.locator('.property-warnings')
    // The two reminders with a day are tiles, the whole sentence on hover; the others are lines led by a pill.
    const ending = warnings.locator('.due-tile', { hasText: 'Vuokrasopimus päättyy · Testi Vuokralainen' })
    await expect(ending).toContainText('28.2.2026')
    await expect(ending.locator('.pill-warn')).toHaveText('90 pv jäljellä')
    await expect(ending).toHaveAttribute('title', 'Vuokrasopimus (Testi Vuokralainen) päättyy 28.2.2026, eikä seuraavaa ole kirjattu.')
    const increase = warnings.locator('.due-tile', { hasText: 'Vuokrankorotus · Testi Vuokralainen' })
    await expect(increase).toContainText('1.1.2026')
    await expect(increase.locator('.pill-warn')).toHaveText('32 pv jäljellä')
    await expect(increase).toHaveAttribute('title', /^Vuokrankorotusta 1\.1\.2026 \(Testi Vuokralainen\) ei ole kirjattu\./)
    const water = warnings.locator('li', { hasText: 'Vesitasauksia ei ole lisätty, vaikka vuokralainen maksaa vesiennakkoa (1.1.2024 alkaen).' })
    await expect(water.locator('.pill-warn')).toHaveText('Hoidettava')
    const contract = warnings.locator('li', { hasText: 'Vuokrasopimus puuttuu (Testi Vuokralainen, 1.1.2024 alkaen): liitä sopimus vuokrasuhteeseen.' })
    await expect(contract.locator('.pill-crit')).toHaveText('Puuttuu')

    await page.goto('/#/properties')
    const row = page.locator('.property-table').first().locator('tr', { hasText: 'Testi Vuokralainen' })
    const mark = row.locator('.property-warn-mark')
    await expect(mark).toHaveText(/^⚠ \d+$/)
    await expect(mark).toHaveAttribute('title', /^• .*\n• .*päättyy 28\.2\.2026/s)

    // Every object's warnings in one list after the figures, each object opening its page.
    const alerts = page.locator('.property-alerts')
    await expect(alerts.locator('.due-tile', { hasText: 'Vuokrankorotus · Testi Vuokralainen' })).toContainText('32 pv jäljellä')
    await expect(alerts.getByRole('button', { name: 'Asunto', exact: true })).toBeVisible()

    // The header's ⚠ counts them and opens the list from anywhere.
    await page.goto('/#/browse')
    const header = page.locator('.topbar-alerts')
    await expect(header).toHaveText(/^⚠ \d+$/)
    await header.click()
    await expect(page).toHaveURL(/#\/properties\/alerts$/)
    await expect(page.locator('.property-alerts')).toBeInViewport()
    await page.locator('.property-alerts').getByRole('button', { name: 'Asunto', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4$/)

    // The leases' tab is marked with its worst open item: the contract is missing.
    await expect(page.getByRole('tab', { name: /^Vuokrasuhteet/ }).locator('.tabs-mark-crit')).toBeVisible()
    // A tile on the object's page opens the lease it is about: its card in edit, on the leases' tab.
    await page.locator('.property-warnings .due-tile', { hasText: 'Vuokrankorotus' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/leases\/lease\/[^/]+$/)
    await expect(page.locator('.property-lease-card-edit')).toHaveCount(1)
  })
})

test.describe('rental object missing documents', () => {
  test("a missing notice can be skipped from the reminder and taken back on the lease's card; the contract cannot", async ({ page }) => {
    await openBook(page)
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    const lease = await newLeaseCard(page)
    const tenant = lease.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2024-01-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByRole('button', { name: 'Lisää korotus' }).click()
    const increase = lease.locator('.property-lease-increase').first()
    await increase.getByLabel('Alkaen').fill('2025-01-01')
    await increase.getByLabel('Vuokra €/kk').fill('660')
    await saveLeaseCard(page)

    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    const notice = page.locator('.property-warnings li', { hasText: 'Vuokrankorotuksen 1.1.2025 korotusilmoitus puuttuu (Testi Vuokralainen).' })
    const contract = page.locator('.property-warnings li', { hasText: 'Vuokrasopimus puuttuu (Testi Vuokralainen, 1.1.2024 alkaen)' })
    await expect(contract).toBeVisible()
    await expect(contract.getByRole('button', { name: 'Ohita' })).toHaveCount(0)
    await notice.getByRole('button', { name: 'Ohita' }).click()
    await expect(notice).toHaveCount(0)
    await expect(contract).toBeVisible()

    // The lease's card shows the owner's word; taking it back brings the reminder back.
    await page.getByRole('tab', { name: /^Vuokrasuhteet/ }).click()
    await page.locator('.property-lease-card').getByRole('button', { name: 'Muokkaa', exact: true }).click()
    const noDoc = page.locator('.property-lease-card-edit .property-lease-increase').first().getByLabel('Ei asiakirjaa')
    await expect(noDoc).toBeChecked()
    await noDoc.uncheck()
    await saveLeaseCard(page)
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await expect(notice).toBeVisible()

    // The portfolio's list skips it too.
    await page.goto('/#/properties')
    const listed = page.locator('.property-alerts li', { hasText: 'Vuokrankorotuksen 1.1.2025 korotusilmoitus puuttuu' })
    await listed.getByRole('button', { name: 'Ohita' }).click()
    await expect(listed).toHaveCount(0)
    await expect(page.locator('.property-alerts')).toContainText('Vuokrasopimus puuttuu (Testi Vuokralainen, 1.1.2024 alkaen)')
  })
})

test.describe('rental object water settlements', () => {
  test('a settlement is shared by days with the tenant, writes the letter and shows on the object page', async ({ page }) => {
    await openBook(page)
    // The letter's voucher is dated on the book's day: inside the test book's last fiscal year.
    await page.locator('.practice-banner').getByLabel('Päivämäärä').fill('2025-12-15')
    await page.goto('/#/property/4/water')
    const panel = page.locator('.property-water')
    await expect(panel.getByRole('heading', { name: 'Vesimaksut ja vesitasaukset' })).toBeVisible()
    await expect(panel).toContainText('Ei vesitasauksia.')

    const lease = await newLeaseCard(page)
    const tenant = lease.getByLabel('Vuokralainen').first()
    await tenant.fill('Testi Vuokralainen')
    await tenant.press('Escape')
    await lease.getByLabel('Alkaa', { exact: true }).fill('2025-03-01')
    await lease.getByLabel('Vuokra €/kk').first().fill('650')
    await lease.getByLabel('Vesi €/kk').first().fill('20')
    await expect(lease.getByLabel('Vesimaksu tasataan kulutuksen mukaan')).toBeChecked()
    await saveLeaseCard(page)

    // A new settlement on its own card on the Vesimaksut tab, shared with the saved lease.
    await page.getByRole('tab', { name: /^Vesimaksut/ }).click()
    await panel.getByRole('button', { name: '+ Vesitasaus' }).click()
    await expect(page).toHaveURL(/#\/property\/4\/water\/new$/)
    const water = panel.locator('.property-water-edit').first()
    // A settlement without its period is not saved: both days are marked and listed.
    await water.getByLabel('Summa €').first().fill('36,20')
    await panel.locator('.property-lease-card-edit').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(panel.locator('.form-issues li')).toHaveText(['Jakso alkaa: puuttuu', 'Jakso päättyy: puuttuu'])
    await expect(water.getByLabel('Jakso alkaa · puuttuu')).toBeFocused()
    await water.getByLabel('Jakso alkaa · puuttuu').fill('2025-01-01')
    await water.getByLabel('Jakso päättyy · puuttuu').fill('2025-06-30')
    await expect(panel.locator('.form-issues li')).toHaveCount(0)
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
    await expect(share.locator('.pill-warn')).toHaveText('avoin')
    // With the actual use: 60,00 € by days is 40,44 €, less 80,00 € of advances.
    await water.getByLabel('Toteutunut kulutus €').fill('60')
    await expect(share).toContainText('palautetaan 39,56 €')
    await expect(water).toContainText('96,20 €')

    const download = page.waitForEvent('download')
    await share.getByRole('button', { name: 'Luo vesitasauslaskelma' }).click()
    expect((await download).suggestedFilename()).toMatch(/^vesitasaus-.*-2025-06-30\.pdf$/)
    await expect(share.getByRole('textbox', { name: 'Vesitasauslaskelma' })).toHaveValue(/Vesitasaus Asunto 1\.1\.2025–30\.6\.2025/)
    await panel.locator('.property-lease-card-edit').getByRole('button', { name: 'Tallenna', exact: true }).click()
    await expect(panel.locator('.property-lease-card-edit')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/property\/4\/water$/)

    // The overview shows the latest settlement of the running lease.
    await page.getByRole('tab', { name: 'Yleiskatsaus' }).click()
    await expect(page.locator('.property-now', { has: page.getByRole('heading', { name: 'Vesi', exact: true }) })).toContainText(
      'Vesitasaus 1.1.2025–30.6.2025: palautetaan 39,56 €',
    )
    await page.getByRole('tab', { name: /^Vesimaksut/ }).click()
    await expect(panel).toContainText('Tasausjakso 1.1.2025–30.6.2025')
    await expect(panel).toContainText('taloyhtiö: hyvitys 36,20 €, kulutus 60,00 €, ennakot 96,20 €')
    await expect(panel).toContainText('Taloyhtiön tasausta ei löydy kirjanpidosta.')
    const row = panel.locator('.property-water-shares li').first()
    await expect(row).toContainText('Testi Vuokralainen')
    await expect(row).toContainText('palautetaan 39,56 €')
    await expect(row.locator('.pill-warn')).toHaveText('avoin')
    await expect(row.getByRole('button', { name: /Vesitasaus Asunto/ })).toBeVisible()
    // No statement linked: the settlement's place for it says so.
    await expect(panel.locator('.property-doc-slot', { hasText: 'Tasauslaskelma' }).locator('.pill-crit')).toHaveText('Asiakirja puuttuu')
    // The stored settlement opens its own card again, named in the address.
    await panel.locator('.property-water-card').getByRole('button', { name: 'Muokkaa', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4\/water\/settlement\/[^/]+$/)
    await expect(panel.locator('.property-water-edit .property-water-share')).toContainText('palautetaan 39,56 €')
    await panel.locator('.property-lease-card-edit').getByRole('button', { name: 'Peru', exact: true }).click()
    await expect(page).toHaveURL(/#\/property\/4\/water$/)
    await page.getByRole('tab', { name: /^Vuokrasuhteet/ }).click()
    const card = page.locator('.property-lease-card').first()
    await expect(card).toContainText('vesimaksu tasataan kulutuksen mukaan')
    const latest = card.locator('.property-lease-terms', { hasText: 'Vesitasaus 1.1.2025–30.6.2025: palautetaan 39,56 €' })
    await expect(latest.locator('.pill-warn')).toHaveText('avoin')
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

  test('the chart turns costs up, shows any of its bars and the running total, remembers them; a month shows its cash flow; the legend in columns, one on a phone', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/property/4')
    const chart = page.locator('svg.property-chart').first()
    await expect(chart.locator('.property-bar-income').first()).toBeVisible()
    await expect(chart.locator('.property-bar-net')).toHaveCount(0)
    const column = chart.locator('.chart-col').filter({ has: page.getByRole('button', { name: 'helmikuu 2025' }) })
    const box = async (cls: string) => {
      const r = column.locator(cls)
      return { y: Number(await r.getAttribute('y')), h: Number(await r.getAttribute('height')) }
    }
    // Costs hang below the zero line, where the income bar ends.
    let income = await box('.property-bar-income')
    let costs = await box('.property-bar-expense')
    expect(costs.y).toBeCloseTo(income.y + income.h, 1)

    await page.getByRole('checkbox', { name: 'Kulut ylöspäin' }).check()
    income = await box('.property-bar-income')
    costs = await box('.property-bar-expense')
    expect(costs.y + costs.h).toBeCloseTo(income.y + income.h, 1)
    expect(costs.y).toBeLessThan(income.y + income.h)

    const net = page.getByRole('checkbox', { name: 'Kassavirta', exact: true })
    await net.check()
    await expect(column.locator('.property-bar-net')).toHaveCount(1)
    await expect(column.locator('.property-bar-net title')).toHaveText(/^Kassavirta, helmikuu 2025: /)

    // Each item has its checkbox: the cash flow alone, then its running total as a line. It fits
    // the bars' scale here, so no axis of its own on the right (chartGrid's tests cover that).
    await page.getByRole('checkbox', { name: 'Tuotot' }).uncheck()
    await page.getByRole('checkbox', { name: 'Kulut ja korot' }).uncheck()
    await expect(page.getByRole('checkbox', { name: 'Kulut ylöspäin' })).toBeDisabled()
    await expect(chart.locator('.property-bar-income, .property-bar-expense')).toHaveCount(0)
    await expect(column.locator('.property-bar-net')).toHaveCount(1)
    await page.getByRole('checkbox', { name: 'Kertynyt kassavirta' }).check()
    const total = chart.locator('.property-total')
    await expect(total.locator('.chart-line')).toHaveCount(1)
    await expect(total.locator('.overview-y-tick')).toHaveCount(0)
    await expect(total.locator('.chart-line-dot title').first()).toHaveText(/^Kertynyt kassavirta, /)
    await net.uncheck()
    await expect(total.locator('.chart-line')).toHaveCount(1)

    // The choices come back on the next visit.
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Tuotot' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Kertynyt kassavirta' })).toBeChecked()
    await expect(net).not.toBeChecked()
    await page.getByRole('checkbox', { name: 'Tuotot' }).check()
    await page.getByRole('checkbox', { name: 'Kulut ja korot' }).check()
    await net.check()

    // The month's lines sum to its cash flow: income less costs and interest.
    await page.getByRole('button', { name: 'helmikuu 2025' }).click()
    const sums = page.locator('.property-month-head .browse-count')
    const cents = (text: string) => Number(text.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', ''))
    const [inText, costText, netText] = await sums.locator('> *').allInnerTexts()
    expect(netText).toMatch(/^Kassavirta /)
    expect(cents(netText)).toBe(cents(inText) + cents(costText))

    // The checkboxes stay through a tab switch.
    await page.getByRole('tab', { name: /^Talous/ }).click()
    await page.getByRole('tab', { name: /^Yleiskatsaus/ }).click()
    await expect(net).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Kulut ylöspäin' })).toBeChecked()

    // The checkboxes run top to bottom in columns; a phone has one, the chart drawn at its own width
    // (text keeps its size).
    const items = page.locator('.overview-legend').first().locator('> *')
    expectColumns(await legendRows(items), 'several')
    await page.setViewportSize({ width: 360, height: 740 })
    const xs = await items.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
    expect(new Set(xs).size).toBe(1)
    await expect
      .poll(() => chart.evaluate((el) => Math.abs(el.viewBox.baseVal.width - el.getBoundingClientRect().width)))
      .toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
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

    await page.goto('/#/property/4/leases')
    await expect(panel).toBeHidden()

    // The cost-centre page follows a month in the address the same way.
    await page.goto('/#/allocation/4/month/2025-02')
    const nav = page.locator('.ledger-head-nav').first()
    await expect(nav).toHaveAttribute('data-start', '2025-02-01')
    await page.goto('/#/allocation/4/month/2025-03')
    await expect(nav).toHaveAttribute('data-start', '2025-03-01')
  })
})
