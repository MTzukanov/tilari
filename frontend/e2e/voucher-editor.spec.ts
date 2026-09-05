import { expect, test, type Page } from '@playwright/test'
import { openBook } from './helpers'

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
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toBeDisabled()
    await expect(page.getByTestId('assistant-rows')).toHaveCount(0)
    await expect(page.locator('.assistant-vat [data-vat-icon="purchase-netto"]')).toBeVisible()
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
    await page.getByRole('link', { name: 'Muokkaa' }).click()
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toBeDisabled()
    const otsikko = page.getByRole('textbox', { name: 'Otsikko' })
    const riviselite = page.locator('label').filter({ hasText: 'Riviselite' }).locator('input, textarea')
    if ((await riviselite.count()) > 0) {
      const title = await otsikko.inputValue()
      const row = await riviselite.inputValue()
      expect(row).not.toBe(title)
    }
    await otsikko.fill('Muokattu otsikko')
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toBeEnabled()
  })

  test('footer has Kitsas buttons, shortcuts, and no duplicate title', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/voucher/new/100')
    await expect(page.getByText('Sähköinen tosite')).toBeVisible()
    await expect(page.locator('.editor-footer')).toContainText('Uusi tosite')
    await expect(page.locator('.editor-footer')).not.toContainText('Sähköinen tosite')
    await expect(page.getByRole('button', { name: 'Tallenna luonnos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toHaveAttribute(
      'title',
      /Ctrl\+S/,
    )
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toHaveAttribute(
      'title',
      /Ctrl\+Shift\+S/,
    )
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
    await page.getByRole('textbox', { name: 'Otsikko' }).fill('Valmis sulkee')
    const menotili = page.locator('label').filter({ hasText: 'Menotili' }).locator('input')
    await menotili.fill('4000')
    await menotili.press('Tab')
    await maaraInput(page).fill('12,50')
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toBeEnabled()
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
    await page.getByRole('link', { name: 'Muokkaa' }).click()
    await expect(page.getByRole('button', { name: 'Tallenna', exact: true })).toBeDisabled()
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

  test('existing voucher allows changing voucher type', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/browse')
    await expect(page.locator('.ledger-table tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.ledger-table tbody tr').first().click()
    await page.getByRole('link', { name: 'Muokkaa' }).click()
    const typeBtn = page.locator('label').filter({ hasText: 'Tositelaji' }).locator('button')
    await expect(typeBtn).toBeEnabled()
    await typeBtn.click()
    await expect(page.getByRole('option', { name: 'Tulo' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Siirto' })).toBeVisible()
  })
})
