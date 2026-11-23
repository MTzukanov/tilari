import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, initLocale } from '../i18n'
import { usePrompt } from './usePrompt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLElement
let ask: ReturnType<typeof usePrompt>['ask']
const pageSubmit = vi.fn()
const pageKey = vi.fn()

/** A page with a button that had focus, and the prompt's dialog inside its own form (as the editor has it). */
function Page() {
  const prompt = usePrompt()
  ask = prompt.ask
  return createElement(
    'form',
    {
      onSubmit: (e: Event) => {
        e.preventDefault()
        pageSubmit()
      },
    },
    createElement('button', { type: 'button', id: 'opener' }, 'Avaa'),
    prompt.dialog,
  )
}

beforeEach(async () => {
  initLocale('fi')
  pageSubmit.mockReset()
  pageKey.mockReset()
  window.addEventListener('keydown', pageKey)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(I18nProvider, null, createElement(Page))))
  document.querySelector<HTMLButtonElement>('#opener')!.focus()
})

afterEach(async () => {
  window.removeEventListener('keydown', pageKey)
  await act(async () => root.unmount())
  container.remove()
})

/** Opens the dialog; `answer` settles when it closes (wrapped, so awaiting `open` does not wait for it). */
async function open(label: string, value?: string): Promise<{ answer: Promise<string | null> }> {
  let answer!: Promise<string | null>
  await act(async () => {
    answer = ask(label, value)
  })
  return { answer }
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role=dialog]')
}

function input(): HTMLInputElement {
  return dialog()!.querySelector('input')!
}

function button(text: string): HTMLButtonElement {
  const found = [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === text)
  if (!found) throw new Error(`no button ${text}`)
  return found
}

function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function press(el: HTMLElement, key: string, shiftKey = false) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
  })
}

describe('usePrompt', () => {
  it('labels one field with the prompt, filled with the suggestion, selected and focused', async () => {
    await open('Tiedoston nimi', 'kirja.kitsas')
    const box = dialog()!
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toBe('Tiedoston nimi')
    expect(document.querySelector(`label[for="${input().id}"]`)?.textContent).toBe('Tiedoston nimi')
    expect(input().value).toBe('kirja.kitsas')
    expect(document.activeElement).toBe(input())
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 'kirja.kitsas'.length])
    expect([...box.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Peru', 'OK'])
    // Outside the page's DOM, so the page's styles and form do not reach it.
    expect(container.contains(box)).toBe(false)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('OK answers the text and gives focus back, without submitting the page', async () => {
    const { answer } = await open('Tiedoston nimi', 'kirja.kitsas')
    await act(async () => typeInto(input(), 'kopio.kitsas'))
    await act(async () => button('OK').click())
    expect(await answer).toBe('kopio.kitsas')
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('#opener'))
    expect(document.body.style.overflow).toBe('')
    expect(pageSubmit).not.toHaveBeenCalled()
  })

  it('OK on an emptied field answers an empty text, as window.prompt does', async () => {
    const { answer } = await open('Uusi tositenumero:', '12')
    await act(async () => typeInto(input(), ''))
    await act(async () => button('OK').click())
    expect(await answer).toBe('')
  })

  it('Esc answers null and does not reach the page', async () => {
    const { answer } = await open('Tositenumero:', '12')
    await press(input(), 'Escape')
    expect(await answer).toBeNull()
    expect(dialog()).toBeNull()
    expect(pageKey).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.querySelector('#opener'))
  })

  it('keeps the page shortcuts out while open', async () => {
    await open('Tositenumero:', '12')
    await press(input(), 's')
    await press(input(), 'Enter')
    expect(pageKey).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
  })

  it('Peru and a press outside answer null', async () => {
    const { answer: cancelled } = await open('Tiedoston nimi', 'a.kitsas')
    await act(async () => button('Peru').click())
    expect(await cancelled).toBeNull()

    const { answer: outside } = await open('Tiedoston nimi', 'a.kitsas')
    const backdrop = dialog()!.parentElement!
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    expect(await outside).toBeNull()
    expect(dialog()).toBeNull()
  })

  it('a press inside the dialog does not close it', async () => {
    await open('Tiedoston nimi', 'a.kitsas')
    await act(async () => {
      dialog()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    expect(dialog()).not.toBeNull()
  })

  it('Tab goes round the field and the two buttons', async () => {
    await open('Tiedoston nimi', 'a.kitsas')
    button('OK').focus()
    await press(button('OK'), 'Tab')
    expect(document.activeElement).toBe(input())
    await press(input(), 'Tab', true)
    expect(document.activeElement).toBe(button('OK'))
  })

  it('a newer question answers the open one null', async () => {
    const { answer: first } = await open('Ensimmäinen', '1')
    const { answer: second } = await open('Toinen', '2')
    expect(await first).toBeNull()
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1)
    expect(input().value).toBe('2')
    await act(async () => button('OK').click())
    expect(await second).toBe('2')
  })

  it('a question open when the page goes away answers null', async () => {
    const { answer } = await open('Tiedoston nimi', 'a.kitsas')
    await act(async () => root.unmount())
    expect(await answer).toBeNull()
    expect(dialog()).toBeNull()
    // afterEach unmounts again; a fresh root keeps that harmless.
    root = createRoot(container)
  })
})
