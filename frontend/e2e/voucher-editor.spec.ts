import { expect, test, type Page } from '@playwright/test'
import { editorSaveButton, openBook, skipWebkitOpfs } from './helpers'

function maaraInput(page: Page) {
  return page.getByRole('textbox', { name: 'Määrä', exact: true })
}

async function expectBrowse(page: Page) {
  await expect(page).toHaveURL(/#\/browse/)
  await expect(page.locator('.browse-toolbar')).toBeVisible()
}

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('voucher editor', () => {
  test('meno editor has Kitsas tabs, type icon, and Tallenna off until complete', async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Liitä leikepöydältä' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Kirjaa' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Viennit' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Muistiinpanot' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Liitteet' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Loki' })).toBeVisible()
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(page.getByTestId('assistant-rows')).toHaveCount(0)
    await expect(page.locator('.assistant-vat [data-vat-icon="purchase-netto"]')).toBeVisible()
    await expect(page.locator('.assistant-vat .vat-select-type .icon-select-btn')).toContainText(
      'Verollinen osto (netto)',
    )
    await page.locator('.assistant-vat .vat-select-type .icon-select-btn').click()
    await expect(page.locator('.icon-select-list [data-vat-icon="purchase-netto"]').first()).toBeVisible()
    await expect(page.locator('.icon-select-list [data-vat-icon="cash"]').first()).toBeVisible()
    await expect(page.locator('.icon-select-list [data-vat-icon="sales-netto"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('Lisää rivi appends a selected table row and keeps the previous line', async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await menotili.fill('4000')
    await menotili.press('Tab')
    await maaraInput(page).fill('12,50')
    await expect(page.getByTestId('assistant-rows')).toHaveCount(0)
    await page.getByRole('button', { name: 'Lisää rivi' }).click()
    const table = page.getByTestId('assistant-rows')
    await expect(table).toBeVisible()
    const menotiliBox = await menotili.boundingBox()
    const tableBox = await table.boundingBox()
    expect(menotiliBox && tableBox).toBeTruthy()
    const overlap =
      menotiliBox!.x < tableBox!.x + tableBox!.width &&
      tableBox!.x < menotiliBox!.x + menotiliBox!.width &&
      menotiliBox!.y < tableBox!.y + tableBox!.height &&
      tableBox!.y < menotiliBox!.y + menotiliBox!.height
    expect(overlap).toBe(false)
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await expect(table.locator('tbody tr').nth(1)).toHaveClass(/is-selected/)
    await expect(table.locator('tbody tr').first()).toContainText('Vuokra')
    await expect(table.locator('tbody tr').nth(1)).toContainText('Vuokra')
    await expect(table.locator('tbody tr').nth(1).locator('[data-vat-icon="purchase-netto"]')).toBeVisible()
    await expect(table.locator('tbody tr').nth(1)).toContainText('25,50 %')
    await expect(table.locator('thead')).toContainText('€')
    await page.getByRole('button', { name: 'Poista rivi' }).click()
    await expect(page.getByTestId('assistant-rows')).toHaveCount(0)
  })

  test('euro fields keep one decimal and allow typing in Veroton', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    const maara = maaraInput(page)
    await maara.fill('12.34.56')
    await expect(maara).toHaveValue('12,34')
    const alv = page.locator('.assistant-vat .vat-select')
    const veroton = page.locator('.assistant-net input')
    const vatAmt = page.locator('.assistant-vat-amount input')
    const kohdennus = page.locator('label').filter({ hasText: 'Kohdennus' }).locator('.search-select')
    const maaraBox = await maara.boundingBox()
    const alvBox = await alv.boundingBox()
    const netBox = await veroton.boundingBox()
    const vatAmtBox = await vatAmt.boundingBox()
    const kohdennusBox = await kohdennus.boundingBox()
    expect(maaraBox && alvBox && netBox && vatAmtBox && kohdennusBox).toBeTruthy()
    expect(Math.abs(maaraBox!.y - netBox!.y)).toBeLessThan(6)
    expect(Math.abs(maaraBox!.y - vatAmtBox!.y)).toBeLessThan(6)
    expect(maaraBox!.x).toBeLessThan(netBox!.x)
    expect(netBox!.x).toBeLessThan(vatAmtBox!.x)
    expect(Math.abs(maaraBox!.width - netBox!.width)).toBeLessThan(8)
    expect(Math.abs(netBox!.width - vatAmtBox!.width)).toBeLessThan(8)
    await expect(vatAmt).toHaveAttribute('readonly', '')
    expect(alvBox!.y).toBeGreaterThan(maaraBox!.y + 8)
    expect(Math.abs(alvBox!.width - kohdennusBox!.width)).toBeLessThan(8)
    await expect(maara).toHaveValue('12,34')
    await maara.fill('12,,99')
    await expect(maara).toHaveValue('12,99')

    await veroton.click()
    await veroton.fill('')
    await veroton.pressSequentially('10,25')
    await expect(veroton).toHaveValue('10,25')
    await expect(maara).toHaveValue(/^\d+,\d{2}$/)
  })

  test('attachments are a clickable preview list; paste adds another file', async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await page.locator('.dropzone input[type=file]').setInputFiles({
      name: 'kuitti.png',
      mimeType: 'image/png',
      buffer: png1x1,
    })
    const preview = page.getByRole('link', { name: 'kuitti.png' }).first()
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('href', /^blob:/)
    await expect(preview).toHaveAttribute('target', '_blank')
    await expect(page.locator('.att-thumb-img').first()).toHaveAttribute('src', /^blob:/)

    await page.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'liite.png', { type: 'image/png' }))
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      document.dispatchEvent(event)
    })
    const pasted = page.getByRole('link', { name: 'liite.png' }).first()
    await expect(pasted).toBeVisible()
    await expect(pasted).toHaveAttribute('href', /^blob:/)
    const dropBox = await page.locator('.dropzone').boundingBox()
    expect(dropBox?.height ?? 999).toBeLessThan(160)
    const titleBox = await page.locator('.dropzone-copy').boundingBox()
    const actionsBox = await page.locator('.dropzone-actions').boundingBox()
    expect(titleBox && actionsBox).toBeTruthy()
    expect(Math.abs(titleBox!.x + titleBox!.width - (actionsBox!.x + actionsBox!.width))).toBeLessThan(24)
    expect(titleBox!.y).toBeLessThan(actionsBox!.y)
    await page.getByRole('tab', { name: 'Liitteet' }).click()
    await expect(page.locator('.attachments-tab').getByRole('link', { name: 'kuitti.png' })).toBeVisible()
    await expect(page.locator('.attachments-tab').getByRole('link', { name: 'liite.png' })).toBeVisible()
  })

  test('Tab closes an open dropdown instead of stacking lists', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await page.locator('label').filter({ hasText: 'Maksutapa' }).locator('button').click()
    await expect(page.locator('ul.search-select-list')).toHaveCount(1)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect.poll(() => page.locator('ul.search-select-list').count()).toBeLessThanOrEqual(1)
  })

  test('row table does not overlap Kirjaa fields at a mid viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 })
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await page.getByRole('button', { name: 'Lisää rivi' }).click()
    const table = page.getByTestId('assistant-rows')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await expect(table).toBeVisible()
    const fieldBox = await menotili.boundingBox()
    const tableBox = await table.boundingBox()
    expect(fieldBox && tableBox).toBeTruthy()
    const overlap =
      fieldBox!.x < tableBox!.x + tableBox!.width &&
      tableBox!.x < fieldBox!.x + fieldBox!.width &&
      fieldBox!.y < tableBox!.y + tableBox!.height &&
      tableBox!.y < fieldBox!.y + fieldBox!.height
    expect(overlap).toBe(false)
  })

  test('Viennit VAT picker stays in its cell; a long file name wraps with a title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 900 })
    await openBook(page)
    await page.goto('/#/voucher/new/200')
    const longName = 'esimerkkilasku_2024_pitka_tiedostonimi_liite.pdf'
    await page.locator('.dropzone input[type=file]').setInputFiles({
      name: longName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n'),
    })
    const card = page.getByRole('link', { name: longName })
    await expect(card).toHaveAttribute('title', longName)
    const nameBox = await card.locator('.att-name').boundingBox()
    expect(nameBox!.height).toBeGreaterThan(25)

    await page.getByRole('tab', { name: 'Viennit' }).click()
    const row = page.locator('table.editor-table tbody tr').first()
    await row.locator('.vat-select-type button').click()
    await page.locator('.icon-select-list li', { hasText: 'Verollinen myynti' }).first().click()
    const rateBox = await row.locator('.vat-select-rate').boundingBox()
    const cellBox = await row.locator('td').nth(4).boundingBox()
    expect(rateBox && cellBox).toBeTruthy()
    expect(rateBox!.x + rateBox!.width).toBeLessThanOrEqual(cellBox!.x + cellBox!.width)
  })

  test('siirto uses a different Kirjaa form', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/300')
    await expect(page.getByText('Tililtä')).toBeVisible()
    await expect(page.getByText('Tilille')).toBeVisible()
    await expect(page.getByTestId('assistant-rows')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Kirjaa' })).toBeVisible()
  })

  test('Tallenna stays off on an unchanged existing voucher', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/browse')
    await expect(page.locator('.ledger-table tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.ledger-table tbody tr').first().click()
    await expect(page.locator('form.editor.voucher-work')).toBeVisible()
    await expect(editorSaveButton(page)).toBeDisabled()
    const otsikko = page.getByRole('textbox', { name: 'Otsikko' })
    const riviselite = page.locator('label').filter({ hasText: 'Riviselite' }).locator('input, textarea')
    if ((await riviselite.count()) > 0) {
      const title = await otsikko.inputValue()
      const row = await riviselite.inputValue()
      expect(row).not.toBe(title)
    }
    await otsikko.fill('Muokattu otsikko')
    await expect(editorSaveButton(page)).toBeEnabled()
  })

  test('an unchanged draft can be posted as it is', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/6/edit')
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Luonnos - ei kirjattu')
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toBeVisible()
    // Kitsas allows posting a draft without edits; only status and number change.
    await expect(editorSaveButton(page)).toBeEnabled()
    await editorSaveButton(page).click()
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toHaveCount(0)
    await expect(page.locator('.editor-doc-number')).toBeVisible()
    await expect(editorSaveButton(page)).toBeDisabled()
  })

  test('posting is blocked for a date without a fiscal year', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await page.getByLabel('Tositteen pvm').fill('2030-01-15')
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Ei tilikautta')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await menotili.fill('4000')
    await menotili.press('Tab')
    await maaraInput(page).fill('12,50')
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(editorSaveButton(page)).toHaveAttribute('title', /ei ole tilikautta/)
    await page.getByLabel('Tositteen pvm').fill('2025-01-15')
    await expect(editorSaveButton(page)).toBeEnabled()
  })

  test('footer has Kitsas buttons, shortcuts, and no duplicate title', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.locator('.editor-footer')).toContainText('Uusi tosite')
    await expect(page.locator('.editor-footer')).not.toContainText('Sähköinen tosite')
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toBeVisible()
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(editorSaveButton(page)).toHaveAttribute('title', /Lisää vähintään yksi vienti/)
    // Posting needs a fiscal year for the date; the test book has 2024-2025.
    await page.getByLabel('Tositteen pvm').fill('2025-06-15')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await menotili.fill('4000')
    await menotili.press('Tab')
    await maaraInput(page).fill('1,00')
    await expect(editorSaveButton(page)).toBeEnabled()
    await expect(editorSaveButton(page)).toHaveAttribute('title', /Ctrl\+S/)
    await expect(editorSaveButton(page)).toHaveAttribute('title', /Ctrl\+Shift\+S/)
    await expect(page.getByRole('button', { name: 'Sulje' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lisää toimintoja' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Huomiomerkki' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edellinen tosite' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Lisää toimintoja' }).click()
    await expect(page.getByRole('menuitem', { name: /Siirry tositteeseen/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Tulosta tosite/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Kopioi uuden pohjaksi/ })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: /Poista tosite/ })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Tyhjennä viennit' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /Siirry tositteeseen/ })).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Luonnos')
    await page.keyboard.press('Escape')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.keyboard.press('Escape')
    await expectBrowse(page)
  })

  test('footer stays on screen while the form scrolls', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    const footer = page.locator('.editor-footer')
    const before = await footer.boundingBox()
    expect(before).toBeTruthy()
    const view = page.viewportSize()
    expect(before!.y + before!.height).toBeGreaterThan((view?.height ?? 0) - 90)
    await page.locator('.editor-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const after = await footer.boundingBox()
    expect(after).toBeTruthy()
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(4)
  })

  test('draft save stays in the editor', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Luonnos jää auki')
    await page.getByRole('button', { name: 'Tallenna luonnos' }).click()
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    await expect(page.locator('.editor-footer')).not.toContainText('Uusi tosite')
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toBeVisible()
  })

  test('Ctrl+S and Tallenna stay; Ctrl+Shift+S stays in the editor', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    // Posting needs a fiscal year for the date; the test book has 2024-2025.
    await page.getByLabel('Tositteen pvm').fill('2025-06-15')
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Valmis sulkee')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await menotili.fill('4000')
    await menotili.press('Tab')
    await maaraInput(page).fill('12,50')
    await expect(editorSaveButton(page)).toBeEnabled()
    await page.keyboard.press('Control+Shift+S')
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Valmis sulkee muokattu')
    await page.keyboard.press('Control+S')
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    await expect(page.locator('form.editor.voucher-work')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Valmis sulkee muokattu')
  })

  test('saved attachments stay visible in the dropzone', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await page.locator('.dropzone input[type=file]').setInputFiles({
      name: 'kuitti.png',
      mimeType: 'image/png',
      buffer: png1x1,
    })
    await expect(page.locator('.dropzone .att-card').first()).toBeVisible()
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Liitteellinen luonnos')
    await page.getByRole('button', { name: 'Tallenna luonnos' }).click()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    await expect(page.locator('.dropzone .att-card').first()).toBeVisible()
    const savedDrop = await page.locator('.dropzone').boundingBox()
    expect(savedDrop?.height ?? 999).toBeLessThan(160)
    const preview = page.locator('.dropzone a').first()
    await expect(preview).toHaveAttribute('target', '_blank')
    await expect(preview).toHaveAttribute('href', /./)
  })

  test('posted voucher hides draft and shows number navigation', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/browse')
    await expect(page.locator('.ledger-table tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.ledger-table tbody tr').first().click()
    await expect(page.locator('form.editor.voucher-work')).toBeVisible()
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toHaveCount(0)
    await expect(page.locator('.editor-doc-number')).toBeVisible()
    await expect(page.locator('.editor-doc-year')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edellinen tosite' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Seuraava tosite' })).toBeVisible()
    await page.getByRole('button', { name: 'Lisää toimintoja' }).click()
    await expect(page.getByRole('menuitem', { name: /Kopioi uuden pohjaksi/ })).toBeEnabled()
  })

  test('Cancel asks to discard changes and voucher type stays enabled', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
    await expect(typeBtn).toBeEnabled()
    await typeBtn.click()
    await page.getByRole('option', { name: 'Tulo' }).click()
    await expect(page.getByText('Tulotili')).toBeVisible()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.getByText('Tulotili')).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expectBrowse(page)
  })

  test('side nav asks to discard unsaved new voucher changes', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
    await typeBtn.click()
    await page.getByRole('option', { name: 'Tulo' }).click()
    await expect(page.getByText('Tulotili')).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Päävalikko' })
    page.once('dialog', (dialog) => dialog.dismiss())
    await nav.getByRole('link', { name: 'Selaa' }).click()
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.getByText('Tulotili')).toBeVisible()
    await expect(page).toHaveURL(/voucher\/new\/100/)

    page.once('dialog', (dialog) => dialog.accept())
    await nav.getByRole('link', { name: 'Selaa' }).click()
    await expectBrowse(page)
  })

  test('browser back asks to discard unsaved new voucher changes', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/browse')
    await expect(page.locator('.browse-toolbar')).toBeVisible()
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
    await typeBtn.click()
    await page.getByRole('option', { name: 'Tulo' }).click()
    await expect(page.getByText('Tulotili')).toBeVisible()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.goBack()
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.getByText('Tulotili')).toBeVisible()
    await expect(page).toHaveURL(/voucher\/new\/100/)

    page.once('dialog', (dialog) => dialog.accept())
    await page.goBack()
    await expectBrowse(page)
  })

  test('refresh asks to discard unsaved new voucher changes', async ({ page, browserName }) => {
      // The book comes back from OPFS after the reload (unreliable in Playwright WebKit).
      skipWebkitOpfs(browserName)
      // Not in the test details: Playwright ignores `timeout` there.
      test.setTimeout(90_000)
      await openBook(page)
      await page.goto('/#/voucher/new/100')
      await expect(page.getByText('Sähköinen tosite')).toBeVisible()
      const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
      await typeBtn.click()
      await page.getByRole('option', { name: 'Tulo' }).click()
      await expect(page.getByText('Tulotili')).toBeVisible()

      page.once('dialog', (dialog) => {
        expect(dialog.type()).toBe('beforeunload')
        void dialog.dismiss()
      })
      await page.reload({ timeout: 5_000 }).catch(() => undefined)
      await expect(page.getByText('Tulotili')).toBeVisible()

      page.once('dialog', (dialog) => {
        expect(dialog.type()).toBe('beforeunload')
        void dialog.accept()
      })
      await page.reload({ timeout: 60_000 })
      await expect(page.getByRole('heading', { name: 'Testikirja Oy' })).toBeVisible({
        timeout: 60_000,
      })
      await expect(page.locator('form.editor.voucher-work')).toBeVisible()
      await expect(page.getByText('Tulotili')).toHaveCount(0)
  })

  test('existing voucher allows changing voucher type', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/browse')
    await expect(page.locator('.ledger-table tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.ledger-table tbody tr').first().click()
    await expect(page.locator('form.editor.voucher-work')).toBeVisible()
    const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
    await expect(typeBtn).toBeEnabled()
    await typeBtn.click()
    await expect(page.getByRole('option', { name: 'Tulo' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Siirto' })).toBeVisible()
  })
})

/** Account cells of the "Viennit" table, in order (a new line's is empty). */
async function lineAccounts(page: Page): Promise<string[]> {
  const tab = page.getByRole('tab', { name: 'Viennit' })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const cells = page.locator('table.editor-table tbody tr td:first-child input')
  await expect(cells.first()).toBeVisible()
  const values = await cells.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  return values.map((v) => v.split(' ')[0])
}

function openVoucherId(page: Page): number {
  const m = page.url().match(/voucher\/(\d+)(?:\/v\/\d+)?\/edit/)
  return m ? Number(m[1]) : 0
}

// The editor stays mounted while only the address changes from one voucher to another.
test.describe('voucher editor between vouchers', () => {
  test('a new voucher straight after saving a stored one starts clean and saves on its own lines', async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/voucher/3/edit')
    const title = page.getByRole('textbox', { name: 'Otsikko' })
    await expect(title).toHaveValue('Vuokra Toimisto')
    await title.fill('Vuokra Toimisto tarkistettu')
    await editorSaveButton(page).click()
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(title).toHaveValue('Vuokra Toimisto tarkistettu')

    // No other page in between: the stored voucher's lines, ids and number must not come along.
    await page.goto('/#/voucher/new/200')
    await expect(page.locator('.editor-footer')).toContainText('Uusi tosite')
    await expect(title).toHaveValue('')
    await expect(page.getByText('Tulotili')).toBeVisible()
    expect(await lineAccounts(page)).toEqual(['', ''])

    await page.getByRole('tab', { name: 'Kirjaa' }).click()
    await page.getByLabel('Tositteen pvm').fill('2025-06-15')
    await title.fill('Uusi myynti')
    const tulotili = page.locator('label').filter({ hasText: 'Tulotili' }).locator('input')
    await tulotili.fill('3000')
    await tulotili.press('Tab')
    await page.locator('.assistant-vat .vat-select-type .icon-select-btn').click()
    await page.getByRole('option', { name: 'Veroton', exact: true }).click()
    await maaraInput(page).fill('80,00')
    await editorSaveButton(page).click()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    // Loaded as stored once it has its number.
    await expect(page.locator('.editor-doc-number')).toHaveText(/^\d+$/)
    await expect(page.locator('.editor .error')).toHaveCount(0)
    const savedId = openVoucherId(page)
    expect(savedId).toBeGreaterThan(10)
    await expect(title).toHaveValue('Uusi myynti')
    expect((await lineAccounts(page)).sort()).toEqual(['1910', '3000'])

    // The stored voucher keeps its own two lines.
    await page.goto('/#/voucher/3/edit')
    await expect(title).toHaveValue('Vuokra Toimisto tarkistettu')
    expect(await lineAccounts(page)).toEqual(['4000', '1910'])
  })

  test('Uusi tosite from a stored voucher, and a new voucher of another type, start clean', async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/voucher/4/edit')
    const title = page.getByRole('textbox', { name: 'Otsikko' })
    await expect(title).toHaveValue('Palvelut Projekti A')

    const nav = page.getByRole('navigation', { name: 'Päävalikko' })
    await nav.getByRole('link', { name: 'Uusi tosite' }).click()
    await expect(page).toHaveURL(/#\/voucher\/new\/100$/)
    await expect(page.locator('.editor-footer')).toContainText('Uusi tosite')
    await expect(title).toHaveValue('')
    await expect(page.getByText('Menotili')).toBeVisible()
    expect(await lineAccounts(page)).toEqual(['', ''])

    // A purchase begun, then a sale's address: after the leave prompt, a sale's empty form.
    await page.getByRole('tab', { name: 'Kirjaa' }).click()
    await title.fill('Kesken jäänyt osto')
    page.once('dialog', (dialog) => dialog.accept())
    await page.goto('/#/voucher/new/200')
    await expect(page.getByText('Tulotili')).toBeVisible()
    await expect(title).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toBeDisabled()
  })

  test("another stored voucher's address shows and saves its own lines; the way back and a copy still work", async ({
    page,
  }) => {
    await openBook(page)
    await page.goto('/#/account/4000/voucher/3/edit')
    const title = page.getByRole('textbox', { name: 'Otsikko' })
    await expect(title).toHaveValue('Vuokra Toimisto')
    expect(await lineAccounts(page)).toEqual(['4000', '1910'])

    await page.goto('/#/account/4000/voucher/4/edit')
    await expect(title).toHaveValue('Palvelut Projekti A')
    expect(await lineAccounts(page)).toEqual(['5000', '1910'])
    await title.fill('Palvelut Projekti A tarkistettu')
    await editorSaveButton(page).click()
    await expect(editorSaveButton(page)).toBeDisabled()
    await expect(page.locator('.editor .error')).toHaveCount(0)
    expect(await lineAccounts(page)).toEqual(['5000', '1910'])

    // Back to the page the voucher was opened from.
    await page.getByRole('button', { name: 'Sulje' }).click()
    await expect(page).toHaveURL(/#\/account\/4000$/)
    await expect(page.locator('.ledger-num')).toHaveText('4000')

    // A copy is a new voucher of its own; the original keeps its lines.
    await page.goto('/#/voucher/4/edit')
    await expect(title).toHaveValue('Palvelut Projekti A tarkistettu')
    await page.getByRole('button', { name: 'Lisää toimintoja' }).click()
    await page.getByRole('menuitem', { name: /Kopioi uuden pohjaksi/ }).click()
    await expect(page).toHaveURL(/#\/voucher\/new\/100\/from\/4$/)
    await expect(page.locator('.editor-footer')).toContainText('Uusi tosite')
    await expect(title).toHaveValue('Palvelut Projekti A tarkistettu')
    // The form rebuilds a copy's lines with the payment line first.
    expect((await lineAccounts(page)).sort()).toEqual(['1910', '5000'])
    await editorSaveButton(page).click()
    await expect(page).toHaveURL(/voucher\/\d+(\/v\/\d+)?\/edit/)
    await expect(page.locator('.editor-doc-number')).toHaveText(/^\d+$/)
    await expect(page.locator('.editor .error')).toHaveCount(0)
    expect(openVoucherId(page)).toBeGreaterThan(10)
    await page.goto('/#/voucher/4/edit')
    await expect(title).toHaveValue('Palvelut Projekti A tarkistettu')
    expect(await lineAccounts(page)).toEqual(['5000', '1910'])
  })

  test('go to and change number ask in the page, not in a browser prompt', async ({ page }) => {
    // A native prompt blocks the tab (browser automation cannot type into it): none may open here.
    const native: string[] = []
    page.on('dialog', (dialog) => {
      native.push(dialog.type())
      void dialog.dismiss()
    })
    await openBook(page)
    await page.goto('/#/voucher/4/edit')
    const title = page.getByRole('textbox', { name: 'Otsikko' })
    await expect(title).toHaveValue('Palvelut Projekti A')

    // Ctrl+G: this voucher's number, selected. Esc closes it and only it.
    await page.keyboard.press('Control+g')
    const goTo = page.getByRole('dialog', { name: 'Tositenumero:', exact: true })
    const goToField = goTo.getByRole('textbox', { name: 'Tositenumero:', exact: true })
    await expect(goToField).toBeFocused()
    await expect(goToField).toHaveValue('4')
    await page.keyboard.press('Escape')
    await expect(goTo).toHaveCount(0)
    await expect(title).toHaveValue('Palvelut Projekti A')
    expect(openVoucherId(page)).toBe(4)

    // Typing replaces the selected number, and Enter goes there.
    await page.keyboard.press('Control+g')
    await expect(goToField).toBeFocused()
    await page.keyboard.type('3')
    await page.keyboard.press('Enter')
    await expect(title).toHaveValue('Vuokra Toimisto')
    expect(openVoucherId(page)).toBe(3)

    // Vaihda tunnistenumero: Peru keeps the number, OK sets it (saved with the voucher).
    const more = page.getByRole('button', { name: 'Lisää toimintoja' })
    const change = page.getByRole('dialog', { name: 'Uusi tositenumero:', exact: true })
    await more.click()
    await page.getByRole('menuitem', { name: 'Vaihda tunnistenumero' }).click()
    await expect(change.getByRole('textbox')).toHaveValue('3')
    await change.getByRole('button', { name: 'Peru' }).click()
    await expect(change).toHaveCount(0)
    await expect(page.locator('.editor-doc-number')).toHaveText('3')
    await expect(more).toBeFocused()

    await more.click()
    await page.getByRole('menuitem', { name: 'Vaihda tunnistenumero' }).click()
    await change.getByRole('textbox').fill('33')
    await change.getByRole('button', { name: 'OK' }).click()
    await expect(change).toHaveCount(0)
    await expect(page.locator('.editor-doc-number')).toHaveText('33')
    await expect(editorSaveButton(page)).toBeEnabled()
    expect(native).toEqual([])
  })

  test('a voucher that cannot be loaded says so, with the way back, instead of a blank or stale form', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await openBook(page)
    const failed = page.locator('.voucher-load-failed')
    await page.goto('/#/voucher/99999/edit')
    await expect(failed.getByRole('alert')).toHaveText('Tositetta 99999 ei löydy.')
    await expect(page.locator('form.editor')).toHaveCount(0)
    await failed.getByRole('button', { name: 'Selaukseen' }).click()
    await expectBrowse(page)

    // Straight from a stored voucher: its form does not stay at the wrong address.
    await page.goto('/#/account/4000/voucher/3/edit')
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Vuokra Toimisto')
    await page.goto('/#/account/4000/voucher/99999/edit')
    await expect(failed.getByRole('alert')).toHaveText('Tositetta 99999 ei löydy.')
    await expect(page.locator('form.editor')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Vuokra Toimisto')
    // The way back leads where the voucher was opened from; Esc too.
    await failed.getByRole('button', { name: 'Tiliin 4000' }).click()
    await expect(page).toHaveURL(/#\/account\/4000$/)
    await page.goto('/#/voucher/new/100/from/99999')
    await expect(failed.getByRole('alert')).toHaveText('Tositetta 99999 ei löydy.')
    await page.keyboard.press('Escape')
    await expectBrowse(page)
    // The next voucher loads as usual.
    await page.goto('/#/voucher/4/edit')
    await expect(page.getByRole('textbox', { name: 'Otsikko' })).toHaveValue('Palvelut Projekti A')
    expect(pageErrors).toEqual([])
  })
})
