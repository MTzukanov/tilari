/**
 * Dividend vouchers as drafts the owner posts, built the way the book has always booked them: the
 * decision (type 300) moves the distribution out of the previous years' profit, and "Osingon maksu"
 * (type 0) turns it into the withholding and a debt to each shareholder, or pays it from a bank account.
 * Pure: the page saves them with the ordinary voucher save.
 */
import type { SaveEntryInput, SaveVoucherInput } from '../../../types'
import { STATUS_DRAFT, TYPE_OTHER, TYPE_TRANSFER } from '../../../vouchers'
import { DISTRIBUTION_ACCOUNT, WITHHOLDING_ACCOUNT } from './dividends'
import type { Recipient } from './recipients'

/** Edellisten tilikausien voitto/tappio and Voitonjakovelat in Kitsas's chart. */
export const RETAINED_ACCOUNT = 2251
export const PAYABLE_ACCOUNT = 2943

/** D Edellisten tilikausien voitto / C Osingonjako. */
export function decisionDraft(input: { date: string; amount_snt: number; title: string }): SaveVoucherInput {
  return {
    date: input.date,
    type: TYPE_TRANSFER,
    status: STATUS_DRAFT,
    title: input.title,
    entries: [
      { account: RETAINED_ACCOUNT, debit_cents: input.amount_snt, description: input.title },
      { account: DISTRIBUTION_ACCOUNT, credit_cents: input.amount_snt, description: input.title },
    ],
  }
}

/**
 * D Osingonjako for the recipients' gross; per recipient C the withholding and C the net on `account`
 * (Voitonjakovelat, or a bank account), each line naming the recipient. `withholding` describes those lines.
 */
export function paymentDraft(input: { date: string; title: string; withholding: string; recipients: Recipient[]; account: number }): SaveVoucherInput {
  const gross = input.recipients.reduce((sum, r) => sum + r.gross_snt, 0)
  const lines: SaveEntryInput[] = [{ account: DISTRIBUTION_ACCOUNT, debit_cents: gross, description: input.title }]
  for (const r of input.recipients) {
    if (r.withholding_snt > 0) lines.push({ account: WITHHOLDING_ACCOUNT, credit_cents: r.withholding_snt, description: input.withholding, partner: { id: r.partner_id } })
    if (r.net_snt > 0) lines.push({ account: input.account, credit_cents: r.net_snt, description: input.title, partner: { id: r.partner_id } })
  }
  return { date: input.date, type: TYPE_OTHER, status: STATUS_DRAFT, title: input.title, entries: lines }
}
