import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Ledger } from '../../../book/ledger'
import { I18nProvider, initLocale } from '../../../i18n'
import { VoucherEditor } from './VoucherEditor'

/** The editor's book: a Ledger on the golden test book, with answers that can be held back. */
const book = vi.hoisted(() => ({ service: null as unknown }))
vi.mock('../../../book/engine', () => ({ getBookService: () => book.service }))

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const testBook = path.join(repoRoot, 'testdb', 'tilari-test.kitsas')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Address = { voucherId: number | null; defaultType: number | null; copyFromId?: number }

let ledger: Ledger
let root: Root
let container: HTMLElement
/** Held answers: `fetchVoucher(id)` and `saveVoucher` wait for these while set. */
let heldLoads: Map<number, Promise<void>>
let heldSave: Promise<void> | null
const onSaved = vi.fn()
const onCancel = vi.fn()
const onOpenVoucher = vi.fn()

function gate(): { wait: Promise<void>; release: () => void } {
  let release = () => undefined as void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

beforeEach(async () => {
  initLocale('fi')
  ledger = new Ledger()
  await ledger.openBytes(readFileSync(testBook), { sourceName: 'tilari-test.kitsas', dbPath: 'test:golden' })
  heldLoads = new Map()
  heldSave = null
  onSaved.mockReset()
  onCancel.mockReset()
  onOpenVoucher.mockReset()
  book.service = new Proxy(ledger, {
    get(target, prop) {
      if (prop === 'fetchVoucher') {
        return async (id: number) => {
          await heldLoads.get(id)
          return target.fetchVoucher(id)
        }
      }
      if (prop === 'saveVoucher') {
        return async (...args: Parameters<Ledger['saveVoucher']>) => {
          await heldSave
          return target.saveVoucher(...args)
        }
      }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

/** Render the editor at an address, as the vouchers screen does (same element, new props). */
async function show(address: Address) {
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(VoucherEditor, {
          ...address,
          defaultDate: '2025-06-15',
          backLabel: 'Selaukseen',
          onSaved,
          onCancel,
          onOpenVoucher,
          onCopyAsNew: () => undefined,
        }),
      ),
    )
  })
}

async function settle(ms = 20) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return
    await settle(5)
  }
  throw new Error(`not seen: ${what} (title "${titleInput()?.value}")`)
}

function titleInput(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('.voucher-meta-row label.grow input')!
}

function loadError(): string | null {
  return container.querySelector('.voucher-load-failed [role=alert]')?.textContent ?? null
}

function footerText(): string {
  return container.querySelector('.editor-footer')?.textContent ?? ''
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function findButton(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

function button(text: string): HTMLButtonElement {
  const found = findButton(text)
  if (!found) throw new Error(`no button ${text}`)
  return found
}

async function lineIds(id: number): Promise<number[]> {
  return (await ledger.fetchVoucher(id)).entries.map((e) => e.id)
}

describe('VoucherEditor between addresses', () => {
  it('a new voucher opened straight from a saved one starts clean and saves as a voucher of its own', async () => {
    await show({ voucherId: 3, defaultType: null })
    await waitFor(() => titleInput().value === 'Vuokra Toimisto', 'voucher 3 loaded')
    typeInto(titleInput(), 'Vuokra Toimisto tarkistettu')
    await settle()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
    // Saved and loaded again: "Tallenna" is back (not "Tallennetaan") and off until the next change.
    await waitFor(() => findButton('Tallenna')?.disabled === true, 'voucher 3 saved')
    expect((await ledger.fetchVoucher(3)).title).toBe('Vuokra Toimisto tarkistettu')

    await show({ voucherId: null, defaultType: 200 })
    await settle()
    // A new sale's empty form: nothing of voucher 3 (title, date, type, number).
    expect(titleInput().value).toBe('')
    expect(container.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2025-06-15')
    expect(container.textContent).toContain('Tulotili')
    expect(footerText()).toContain('Uusi tosite')

    typeInto(titleInput(), 'Uusi myynti')
    await settle()
    await act(async () => button('Tallenna luonnos').click())
    await waitFor(() => onSaved.mock.calls.length > 0, 'new voucher saved')
    expect(container.querySelector('.error')).toBeNull()
    const newId = onSaved.mock.calls[0][0] as number
    expect(newId).not.toBe(3)
    const saved = await ledger.fetchVoucher(newId)
    expect(saved.title).toBe('Uusi myynti')
    expect(saved.type).toBe(200)
    expect(saved.entries).toEqual([])
    expect(await lineIds(3)).toEqual([5, 6])
  })

  it("a late answer for the voucher shown before does not replace the next one's lines", async () => {
    const late = gate()
    heldLoads.set(3, late.wait)
    await show({ voucherId: 3, defaultType: null })
    await show({ voucherId: 4, defaultType: null })
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'voucher 4 loaded')
    late.release()
    await settle(50)
    expect(titleInput().value).toBe('Palvelut Projekti A')
    expect(container.querySelector('.editor-doc-number')?.textContent).toBe('4')
  })

  it('a save that ends after the address moved on does not load the saved voucher over the next one', async () => {
    await show({ voucherId: 4, defaultType: null })
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'voucher 4 loaded')
    typeInto(titleInput(), 'Palvelut Projekti A tarkistettu')
    await settle()
    const slow = gate()
    heldSave = slow.wait
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }))
    })
    await show({ voucherId: 3, defaultType: null })
    await waitFor(() => titleInput().value === 'Vuokra Toimisto', 'voucher 3 loaded')
    slow.release()
    await settle(50)
    expect((await ledger.fetchVoucher(4)).title).toBe('Palvelut Projekti A tarkistettu')
    expect(titleInput().value).toBe('Vuokra Toimisto')
    expect(container.querySelector('.editor-doc-number')?.textContent).toBe('3')
  })

  it('a copy of a stored voucher starts as a new voucher without its line ids', async () => {
    await show({ voucherId: 4, defaultType: null })
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'voucher 4 loaded')
    await show({ voucherId: null, defaultType: 100, copyFromId: 4 })
    await waitFor(() => footerText().includes('Uusi tosite'), 'copy shown')
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'copy loaded')
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
    await waitFor(() => onSaved.mock.calls.length > 0, 'copy saved')
    expect(container.querySelector('.error')).toBeNull()
    const copyId = onSaved.mock.calls[0][0] as number
    expect(copyId).not.toBe(4)
    expect((await ledger.fetchVoucher(copyId)).entries.map((e) => e.account).sort()).toEqual([1910, 5000])
    expect(await lineIds(4)).toEqual([7, 8])
  })
})

describe('VoucherEditor when a voucher cannot be loaded', () => {
  it('a voucher not in the book says so, with the way back, instead of an empty form', async () => {
    await show({ voucherId: 99999, defaultType: null })
    await waitFor(() => loadError() != null, 'load error shown')
    expect(loadError()).toBe('Tositetta 99999 ei löydy.')
    expect(container.querySelector('form.editor')).toBeNull()
    await act(async () => button('Selaukseen').click())
    expect(onCancel).toHaveBeenCalledTimes(1)

    // A copy of a voucher not in the book the same.
    await show({ voucherId: null, defaultType: 100, copyFromId: 99999 })
    await waitFor(() => loadError() === 'Tositetta 99999 ei löydy.', 'copy load error shown')
    expect(container.querySelector('form.editor')).toBeNull()
  })

  it("the voucher shown before does not stay at the address; shortcuts but Esc do nothing; the next voucher loads", async () => {
    // Ctrl+S on a form that cannot be saved explains why in an alert; there is no form here.
    const before = window.alert
    const alert = vi.fn()
    window.alert = alert
    try {
      await show({ voucherId: 3, defaultType: null })
      await waitFor(() => titleInput()?.value === 'Vuokra Toimisto', 'voucher 3 loaded')
      await show({ voucherId: 99999, defaultType: null })
      await waitFor(() => loadError() != null, 'load error shown')
      expect(container.querySelector('form.editor')).toBeNull()
      expect(container.textContent).not.toContain('Vuokra Toimisto')
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
      })
      expect(alert).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(onCancel).toHaveBeenCalledTimes(1)

      await show({ voucherId: 4, defaultType: null })
      await waitFor(() => titleInput()?.value === 'Palvelut Projekti A', 'voucher 4 loaded')
      expect(loadError()).toBeNull()
      expect(container.querySelector('.editor-doc-number')?.textContent).toBe('4')
    } finally {
      window.alert = before
    }
  })
})

describe('VoucherEditor number prompts', () => {
  /** The in-app prompt (`shared/usePrompt`), portalled to the body. */
  function prompt(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role=dialog]')
  }

  function promptInput(): HTMLInputElement {
    return prompt()!.querySelector('input')!
  }

  async function pressInPrompt(key: string, ctrlKey = false) {
    await act(async () => {
      promptInput().dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }))
    })
  }

  async function chooseMenu(label: string) {
    await act(async () => container.querySelector<HTMLButtonElement>('.editor-menu-btn')!.click())
    const item = [...document.querySelectorAll<HTMLButtonElement>('.editor-menu-item')].find(
      (b) => b.querySelector('.editor-menu-label')?.textContent === label,
    )
    await act(async () => item!.click())
  }

  it('"Vaihda tunnistenumero" asks in the page: Esc keeps the editor, OK sets the number without saving', async () => {
    await show({ voucherId: 4, defaultType: null })
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'voucher 4 loaded')

    await chooseMenu('Vaihda tunnistenumero')
    expect(prompt()?.textContent).toContain('Uusi tositenumero:')
    expect(promptInput().value).toBe('4')
    expect(promptInput().inputMode).toBe('numeric')
    // The editor's own Esc (back to the list) does not see it.
    await pressInPrompt('Escape')
    expect(prompt()).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
    expect(container.querySelector('.editor-doc-number')?.textContent).toBe('4')

    await chooseMenu('Vaihda tunnistenumero')
    await act(async () => typeInto(promptInput(), '42'))
    await pressInPrompt('s', true)
    expect(prompt()).not.toBeNull()
    const ok = [...prompt()!.querySelectorAll('button')].find((b) => b.textContent === 'OK')!
    await act(async () => ok.click())
    await settle()
    expect(prompt()).toBeNull()
    expect(container.querySelector('.editor-doc-number')?.textContent).toBe('42')
    // The prompt's form is not the editor's: nothing was saved.
    expect(onSaved).not.toHaveBeenCalled()
    expect((await ledger.fetchVoucher(4)).doc_number).toBe(4)
  })

  it('Ctrl+G asks the number in the page and opens that voucher', async () => {
    await show({ voucherId: 4, defaultType: null })
    await waitFor(() => titleInput().value === 'Palvelut Projekti A', 'voucher 4 loaded')
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }))
    })
    expect(prompt()?.textContent).toContain('Tositenumero:')
    expect(promptInput().value).toBe('4')
    await act(async () => typeInto(promptInput(), '3'))
    const ok = [...prompt()!.querySelectorAll('button')].find((b) => b.textContent === 'OK')!
    await act(async () => ok.click())
    await waitFor(() => onOpenVoucher.mock.calls.length > 0, 'voucher 3 opened')
    expect(onOpenVoucher).toHaveBeenCalledWith(3)
    expect(prompt()).toBeNull()
  })
})
