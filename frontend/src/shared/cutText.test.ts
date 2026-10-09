import type { MouseEvent } from 'react'
import { describe, expect, it } from 'vitest'
import { showCutText } from './cutText'

/** happy-dom has no layout: give elements the widths a narrow column would. */
function widths(el: HTMLElement, scroll: number, client: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scroll })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: client })
}

function hover(target: Element) {
  showCutText({ target } as unknown as MouseEvent<HTMLElement>)
}

function row(html: string): HTMLTableRowElement {
  const table = document.createElement('table')
  table.innerHTML = `<tbody><tr>${html}</tr></tbody>`
  return table.querySelector('tr')!
}

describe('showCutText', () => {
  it('gives a cut cell its full text, and takes it away once it fits', () => {
    const td = row('<td>Pitkä selite, joka ei mahdu sarakkeeseen</td>').querySelector('td')!
    widths(td, 300, 120)
    hover(td)
    expect(td.title).toBe('Pitkä selite, joka ei mahdu sarakkeeseen')
    widths(td, 300, 300)
    hover(td)
    expect(td.hasAttribute('title')).toBe(false)
  })

  it('uses the cut span inside the cell, from a hover on its icon', () => {
    const tr = row('<td><span class="name"><svg><path></path></svg>Asunto Oy Esimerkki, A 12</span></td>')
    const span = tr.querySelector('span')!
    widths(span, 200, 90)
    widths(tr.querySelector('td')!, 100, 100)
    hover(tr.querySelector('path')!)
    expect(span.title).toBe('Asunto Oy Esimerkki, A 12')
  })

  it('leaves a cell alone when it fits or has a title of its own', () => {
    const tr = row('<td>Lyhyt</td><td title="Oma vihje">Pitkä teksti</td>')
    const [fits, own] = [...tr.querySelectorAll('td')]
    widths(fits, 50, 80)
    widths(own, 300, 80)
    hover(fits)
    hover(own)
    expect(fits.hasAttribute('title')).toBe(false)
    expect(own.title).toBe('Oma vihje')
  })
})
