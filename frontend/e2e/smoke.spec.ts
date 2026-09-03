import { expect, test } from '@playwright/test'
import { eur, gotoMonth, openBook, openReports2024, selectNavMode } from './helpers'

const includeProjects = 'Sis\u00e4llyt\u00e4 projektit'
const hideEnded = 'Piilota p\u00e4\u00e4ttyneet'

test.describe('reports', () => {
  test('shows company header and 2024 tase / tulos', async ({ page }) => {
    await openReports2024(page)
    await expect(page.getByText('1234567-8')).toBeVisible()
    await expect(page.getByText(/harjoitus/)).toBeVisible()

    const bank = page.getByRole('row', { name: /1910/ })
    await expect(bank).toContainText('Pankkitili')
    await expect(bank).toContainText(eur('1 105,00'))

    const periodResult = page.getByRole('row', { name: /2371/ })
    await expect(periodResult).toContainText(eur('105,00'))

    const sales = page.getByRole('row', { name: /3000/ })
    await expect(sales).toContainText(eur('200,00'))
  })

  test('header returns to the front page', async ({ page }) => {
    await openReports2024(page)
    await page.getByRole('row', { name: /1910/ }).click()
    await expect(page.locator('.ledger-table')).toBeVisible()
    await page.locator('.topbar-home').click()
    await expect(page.getByRole('heading', { name: 'Tase' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Vastaavaa' })).toBeVisible()
  })
})

test.describe('ledger', () => {
  test('year ledger, March drill-down, and tosite', async ({ page }) => {
    await openReports2024(page)
    await page.getByRole('row', { name: /1910/ }).click()
    await expect(page.locator('.ledger-num')).toHaveText('1910')
    await expect(page.getByText(/6 rivi/)).toBeVisible()
    await expect(page.locator('.ledger-table')).not.toContainText('LUONNOS')

    await gotoMonth(page, '2024-03-01')
    await expect(page.getByRole('row', { name: /Alkusaldo/ })).toContainText(
      eur('1 000,00'),
    )
    await expect(page.getByText(/2 rivi/)).toBeVisible()

    await page.getByRole('row', { name: /Myynti Toimisto/ }).click()
    await expect(page.getByRole('heading', { name: 'Myynti Toimisto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tiliin 1910' })).toBeVisible()
    await expect(page.locator('.voucher-meta')).toContainText('Asiakas Oy')
  })

  test('voucher attachment is served as a blob url', async ({ page }) => {
    await openReports2024(page)
    await page.getByRole('row', { name: /1910/ }).click()
    await page.getByRole('row', { name: /Toimistotarvike/ }).click()
    await expect(page.getByRole('heading', { name: /Yleinen kulu/ })).toBeVisible()
    const link = page.getByRole('link', { name: 'kuitti.txt' })
    await expect(link).toHaveAttribute('href', /^blob:/)
    const href = await link.getAttribute('href')
    const text = await page.evaluate(async (url: string) => {
      const res = await fetch(url)
      return res.text()
    }, href!)
    expect(text).toBe('test-liite\n')
  })
})

test.describe('cost centres', () => {
  test('project rollup, hide ended, and all-time result', async ({ page }) => {
    await openReports2024(page)
    await page.getByRole('button', { name: 'Avaa kustannuspaikat' }).click()
    await expect(page.getByRole('heading', { name: 'Kustannuspaikat' })).toBeVisible()

    await expect(page.getByRole('row', { name: /^Toimisto/ })).toContainText(
      eur('120,00'),
    )

    await page.getByLabel(includeProjects).uncheck()
    await expect(page.getByRole('row', { name: /^Toimisto/ })).toContainText(
      eur('150,00'),
    )
    await page.getByLabel(includeProjects).check()

    await page.getByTitle('Seuraava tilikausi').click()
    await expect(page.locator('.ledger-head-nav').first()).toHaveAttribute('data-start', '2025-01-01')
    const ended = page.getByRole('row', { name: /Vanha KP/ })
    await expect(ended).toHaveClass(/is-ended/)
    await page.getByLabel(hideEnded).check()
    await expect(page.getByRole('row', { name: /Vanha KP/ })).toHaveCount(0)

    await page.getByTitle('Edellinen tilikausi').click()
    await expect(page.locator('.ledger-head-nav').first()).toHaveAttribute('data-start', '2024-01-01')
    await page.getByRole('row', { name: /^Toimisto/ }).click()
    await expect(page.getByRole('heading', { name: 'Toimisto' })).toBeVisible()
    await selectNavMode(page, 'Kaikki tilikaudet')
    await expect(page.locator('.allocation-summary')).toContainText(eur('200,00'))
  })

  test('deep-links to Asunto in 2025', async ({ page }) => {
    await openBook(page)
    await page.goto('/#/allocation/4')
    await expect(page.getByRole('heading', { name: 'Asunto' })).toBeVisible()
    await expect(page.locator('.allocation-summary')).toContainText(eur('300,00'))
  })
})

test.describe('balance-sheet-items', () => {
  test('opens balance-sheet-items view, expands an era, and drills down to tosite', async ({ page }) => {
    await openReports2024(page)
    await page.getByRole('link', { name: 'Raportit' }).click()
    await page.getByRole('button', { name: /Tase-erät/ }).click()
    await expect(page.getByRole('heading', { name: 'Tase-erät' })).toBeVisible()

    const itemToggle = page.locator('.item-toggle').first()
    await expect(itemToggle).toBeVisible()
    await itemToggle.click()
    await expect(page.locator('.item-movement').first()).toBeVisible()

    await page.locator('.balance-sheet-items table tbody tr.clickable').first().click()
    await expect(page).toHaveURL(/#\/balance-sheet-items\/voucher\/\d+/)
    await expect(page.locator('.voucher-head h2')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tase-eriin' })).toBeVisible()
  })
})
