import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { clearTilariStorage, confirmEngineOpen, openBook, periodEndBook, testBook } from './helpers'

const PICKED = 'e2e-period-end.kitsas'

/**
 * The open picker hands out a real file handle (an OPFS file holding the period-end book), which
 * IndexedDB can keep like a picked disk file. A second call is a cancelled picker.
 */
async function pickerGivesOpfsFile(page: Page) {
  const data = [...readFileSync(periodEndBook)]
  await page.addInitScript(
    ({ data, name }) => {
      const w = window as unknown as { pickerCalls: number }
      w.pickerCalls = 0
      window.showOpenFilePicker = async () => {
        w.pickerCalls += 1
        if (w.pickerCalls > 1) throw new DOMException('cancelled', 'AbortError')
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle(name, { create: true })
        const out = await handle.createWritable()
        await out.write(new Uint8Array(data))
        await out.close()
        return [handle]
      }
    },
    { data, name: PICKED },
  )
}

function pickerCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls)
}

function bookToggle(page: Page) {
  return page.getByRole('button', { name: /^Kirjanpitotiedosto/ })
}

async function openRecent(page: Page, name: RegExp) {
  await bookToggle(page).click()
  await page.getByRole('group', { name: 'Tämä laite' }).getByRole('menuitem', { name }).click()
}

async function openTestBookWithoutHandle(page: Page) {
  await page.locator('input[type=file][accept*=".kitsas"]').setInputFiles(testBook)
  await confirmEngineOpen(page, 'wasm')
  await expect(bookToggle(page)).toHaveText('tilari-test.kitsas', { timeout: 60_000 })
}

/** The open book's file handle is in IndexedDB under its path. */
async function handleSavedForOpenBook(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const path = JSON.parse(localStorage.getItem('tilari.bookSession') ?? '{}').path as string
        const req = indexedDB.open('tilari-handles')
        req.onerror = () => resolve(false)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('handles')) return resolve(false)
          const get = db.transaction('handles').objectStore('handles').getAllKeys()
          get.onsuccess = () => resolve(get.result.includes(path))
          get.onerror = () => resolve(false)
        }
      }),
  )
}

test.describe('book file menu', () => {
  test('groups create, the open book, this device and own storage', async ({ page }) => {
    await openBook(page)
    const toggle = page.getByRole('button', { name: /^Kirjanpitotiedosto/ })
    await expect(toggle).toHaveText('tilari-test.kitsas')
    await toggle.click()
    const menu = page.getByRole('menu', { name: 'Kirjanpitotiedosto' })
    await expect(menu.locator('.book-menu-head')).toHaveText(['Avoin kirja', 'Tämä laite', 'Oma säilytys'])

    const device = menu.getByRole('group', { name: 'Tämä laite' })
    await expect(device.getByRole('menuitem', { name: 'Avaa tiedosto…', exact: true })).toBeVisible()
    await expect(device.getByRole('menuitem', { name: 'Tallenna tiedostoksi…', exact: true })).toBeVisible()
    // The open book is a recent of this device, marked as current.
    await expect(device.getByRole('menuitem', { name: /tilari-test\.kitsas/ })).toHaveAttribute(
      'aria-current',
      'true',
    )

    // No storage connected: the storage group only offers to connect one.
    const storage = menu.getByRole('group', { name: 'Oma säilytys' })
    await expect(storage.getByRole('menuitem')).toHaveText([/^Yhdistä omaan säilytykseen…/])
    await expect(menu.getByRole('menuitem', { name: 'Tallenna uutena kopiona' })).toHaveCount(0)

    const book = menu.getByRole('group', { name: 'Avoin kirja' })
    await expect(
      book.getByRole('menuitem', { name: 'Hylkää muutokset ja lataa uudelleen', exact: true }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      book.getByRole('menuitem', { name: 'Sulje ja poista tästä selaimesta', exact: true }),
    ).toBeVisible()
  })

  test('keyboard moves through the items and Esc returns to the button', async ({ page }) => {
    await openBook(page)
    const toggle = page.getByRole('button', { name: /^Kirjanpitotiedosto/ })
    await toggle.click()
    const menu = page.getByRole('menu', { name: 'Kirjanpitotiedosto' })
    await expect(menu.getByRole('menuitem', { name: 'Luo uusi kirja…', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(
      menu.getByRole('menuitem', { name: 'Sulje ja poista tästä selaimesta', exact: true }),
    ).toBeFocused()
    // The disabled reload (a clean book) is skipped.
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Avaa tiedosto…', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  test('create opens the new book dialog', async ({ page }) => {
    await openBook(page)
    await page.getByRole('button', { name: /^Kirjanpitotiedosto/ }).click()
    await page.getByRole('menuitem', { name: 'Luo uusi kirja…', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Uusi kirjanpito' })).toBeVisible()
  })

  test.describe('recent files of this device', () => {
    test.beforeEach(({ browserName }) => {
      test.skip(browserName !== 'chromium', 'file handles need the File System Access API')
    })

    test('reopen through the remembered handle and stay linked after reload', async ({ page }) => {
      await clearTilariStorage(page)
      await pickerGivesOpfsFile(page)
      await page.goto('/')
      await page.getByRole('button', { name: 'Avaa tiedosto…', exact: true }).click()
      await confirmEngineOpen(page, 'wasm')
      await expect(bookToggle(page)).toHaveText(PICKED, { timeout: 60_000 })
      await expect(page.locator('.status-storage-kind')).toHaveText('Levyllä')

      await openTestBookWithoutHandle(page)
      await openRecent(page, /e2e-period-end\.kitsas/)
      await expect(bookToggle(page)).toHaveText(PICKED, { timeout: 60_000 })
      expect(await pickerCalls(page)).toBe(1)

      await expect.poll(() => handleSavedForOpenBook(page)).toBe(true)
      await page.reload()
      await expect(bookToggle(page)).toHaveText(PICKED, { timeout: 60_000 })
      await expect(page.locator('.status-storage-kind')).toHaveText('Levyllä')
    })

    test('without a handle asks to pick the file again and keeps the open book', async ({ page }) => {
      await clearTilariStorage(page)
      await pickerGivesOpfsFile(page)
      await page.goto('/')
      await openTestBookWithoutHandle(page)
      await bookToggle(page).click()
      await page.getByRole('menuitem', { name: 'Avaa tiedosto…', exact: true }).click()
      await expect(bookToggle(page)).toHaveText(PICKED, { timeout: 60_000 })

      await openRecent(page, /tilari-test\.kitsas/)
      await expect(page.getByText('Valitse tiedosto tilari-test.kitsas uudelleen.')).toBeVisible()
      expect(await pickerCalls(page)).toBe(2)
      await expect(bookToggle(page)).toHaveText(PICKED)
      // The entry stays for next time.
      await bookToggle(page).click()
      await expect(
        page.getByRole('group', { name: 'Tämä laite' }).getByRole('menuitem', { name: /tilari-test\.kitsas/ }),
      ).toBeVisible()
    })
  })
})
