import type { CheckView, FileProblem } from '../api'

export type Tab = 'figures' | 'facts' | 'forms' | 'file'

/** Where a check or a file problem is fixed: a tab, a place in it, and the 6B rows to open there. */
export type Jump = { tab: Tab; to: string; codes?: number[] }

/** The element id of a place a jump goes to. */
export function anchorId(to: string): string {
  return `tax-return-at-${to}`
}

function rows(codes: number[] | undefined): Jump | null {
  return codes?.length ? { tab: 'figures', to: `row-${codes[0]}`, codes } : null
}

export function checkJump(check: CheckView): Jump | null {
  switch (check.key) {
    case 'unplaced':
      return { tab: 'figures', to: 'unplaced' }
    case 'custom_accounts':
      return { tab: 'figures', to: 'confirm' }
    case 'unanswered':
    case 'tax_free_answer':
      return { tab: 'facts', to: 'answers' }
    case 'dividend_answer':
      return { tab: 'facts', to: 'dividend' }
    case 'negative':
    case 'manual':
    case 'to_check':
      return rows(check.codes)
    case 'sale_split':
    case 'sale_gap':
      return { tab: 'forms', to: 'form-71B' }
    case 'form8a_gap':
      return { tab: 'forms', to: check.codes?.length ? `form-8A-${check.codes[0]}` : 'form-8A' }
    case 'form62_tax':
    case 'form62_book':
    case 'form62_limit':
      return { tab: 'forms', to: 'form-62' }
    case 'form73_listed':
    case 'form73_gap':
    case 'form73_tax':
      return { tab: 'forms', to: 'form-73' }
    default:
      return null
  }
}

const CONTACT_CODES = [41, 42, 44]
const SHAREHOLDER_NAME = 701
const DIVIDEND_AMOUNT = 522

export function problemJump(problem: FileProblem): Jump | null {
  switch (problem.key) {
    case 'contact_name':
    case 'contact_phone':
      return { tab: 'facts', to: 'contact' }
    case 'audit':
    case 'audit_remarks':
      return { tab: 'facts', to: 'statements' }
    case 'no_shareholders':
      return { tab: 'facts', to: 'shareholders' }
    case 'shareholder_id':
      return { tab: 'file', to: 'ids' }
    case 'negative':
      return rows([problem.code])
    case 'text':
      if (CONTACT_CODES.includes(problem.code)) return { tab: 'facts', to: 'contact' }
      return problem.code === SHAREHOLDER_NAME ? { tab: 'facts', to: 'shareholders' } : null
    case 'distribution':
      return { tab: 'facts', to: problem.code === DIVIDEND_AMOUNT ? 'dividend' : 'free-equity' }
    case 'answer':
    case 'unanswered':
      return { tab: 'facts', to: 'answers' }
    case 'form62_negative':
      return { tab: 'forms', to: 'form-62' }
    case 'form73_listed':
    case 'form73_ownership':
      return { tab: 'forms', to: 'form-73' }
    case 'holding_name':
    case 'holding_id':
    case 'holding_shares':
    case 'holding_unit':
    case 'holding_cost':
      return { tab: 'forms', to: 'form-8A' }
    case 'sale_fields':
    case 'sale_id':
    case 'sale_share':
      return { tab: 'forms', to: 'form-71B' }
    default:
      return null
  }
}
