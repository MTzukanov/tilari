import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, initLocale } from '../../../i18n'
import type { WaterStatementCandidate } from '../api'
import { WaterEditor } from './WaterEditor'
import { newSettlement, pickStatement, type SettlementDraft } from './waterDrafts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLElement

beforeEach(() => {
  initLocale('fi')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

/** A payment to the housing company on the object: + the company paid the owner back. */
function candidate(id: number, date: string, line_snt: number): WaterStatementCandidate {
  const voucher = { voucher_id: id, date, doc_number: null, series: null, title: 'IBAN-maksu viitteellä 55501234', files: [] }
  return {
    voucher,
    lines: [{ line_id: id, date, amount_snt: line_snt, line_snt, text: voucher.title, partner: null, voucher, income: false, partner_id: 5 }],
    suspect: 'reference',
  }
}

async function show(draft: SettlementDraft, candidates: WaterStatementCandidate[]) {
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(WaterEditor, {
          drafts: [draft],
          onChange: () => undefined,
          leases: [],
          tenantName: () => '',
          docs: [],
          lines: [],
          candidates,
          onCreateLetter: async () => undefined,
          onUpload: async () => undefined,
          isCreated: () => false,
          onDeleteDocs: async () => undefined,
          onOpenVoucher: () => undefined,
        }),
      ),
    )
  })
}

/** The "i" beside the statement's buttons, and its note once opened. */
const statementInfo = () => container.querySelector<HTMLButtonElement>('.property-lease-actions .property-info')
const notes = () => [...container.querySelectorAll('.property-info-note')].map((p) => p.textContent)

describe('WaterEditor notes', () => {
  it('what the stars mean is behind an "i" by the statement while none is picked', async () => {
    const period = { ...newSettlement(), from: '2027-01-01', to: '2027-12-31', amount: '37,90' }
    await show(period, [candidate(31, '2027-12-22', 37_90)])
    expect(statementInfo()?.getAttribute('aria-label')).toBe('★ Summa täsmää tähän tasaukseen sentilleen.')
    expect(notes()).toEqual([])
    await act(async () => statementInfo()!.click())
    expect(notes()).toEqual(['★ Summa täsmää tähän tasaukseen sentilleen.'])

    // No amount to match: the company's other payments are the guesses.
    await show({ ...period, amount: '' }, [candidate(31, '2027-12-22', 37_90)])
    expect(statementInfo()?.getAttribute('aria-label')).toMatch(/^★ Taloyhtiölle maksettu muu kuin vastike/)
    // Nothing to guess from: no "i".
    await show(period, [])
    expect(statementInfo()).toBeNull()
  })

  it('a period filled from the picked statement is marked as a guess; the shares say how they are counted', async () => {
    const candidates = [candidate(31, '2027-12-22', -37_90)]
    const picked = pickStatement(newSettlement(), '31', candidates, [])
    await show(picked, candidates)
    expect(statementInfo()?.getAttribute('aria-label')).toBe('Jakso on arvioitu tositteen päivästä: tarkista se tasauslaskelmasta.')
    // Typed over, the period is the owner's: no "i".
    await show({ ...picked, from: '2027-02-01' }, candidates)
    expect(statementInfo()).toBeNull()

    const shares = container.querySelector('h4.property-info-head')
    expect(shares?.textContent).toBe('Vuokralaisten osuudeti')
    expect(shares?.querySelector('.property-info')?.getAttribute('aria-label')).toMatch(/^Kulutusta ei ole annettu/)
    // The line that asked for the period is gone: the empty date fields and the save say it.
    expect(container.textContent).not.toContain('Anna jakson alku- ja loppupäivä.')
  })
})
