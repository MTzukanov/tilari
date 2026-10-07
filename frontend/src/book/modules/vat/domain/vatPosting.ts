/** VAT companion accounts and codes used when the editor splits a net line. */

/** Account of the single VAT line of a domestic code (0 = none; see vatBooking). */
export function vatAccount(code: number): number {
  if (code === 21) return 1763
  if (code === 28) return 17631
  if (code === 11) return 2939
  if (code === 18) return 29391
  return 0
}

/** Code of that VAT line (the code itself when there is none). */
export function vatCompanionCode(code: number): number {
  if (code === 21) return 221
  if (code === 28) return 428
  if (code === 11) return 111
  if (code === 18) return 418
  return code
}

export function isVatBookingLine(line: { vat_code?: string; account?: string }): boolean {
  const code = Number(line.vat_code || 0)
  const account = Number(line.account)
  return code >= 100 || account === 1763 || account === 2939 || account === 29391 || account === 17631
}

export function isPurchaseVatCode(code: number): boolean {
  return [21, 28, 29].includes(code)
}

/** Kitsas reverse-charge codes: tax and deduction are both booked on top of the net amount. */
export const REVERSE_CHARGE_CODES = new Set([24, 25, 26, 27, 29])

export function isReverseCharge(code: number): boolean {
  return REVERSE_CHARGE_CODES.has(code)
}

export type VatBookingLine = {
  account: number
  vat_code: number
  debit_cents: number | null
  credit_cents: number | null
  /** 418/428 lines open a new era (cash-basis VAT). */
  new_era?: boolean
}

/**
 * Lines of one assistant/statement row like Kitsas `ApuriRivi::viennit`.
 * `amountCents`: what the payment line pays for the row - gross for domestic VAT codes,
 * net for reverse charge. `credit`: the row is booked on the credit side (income, or a refund
 * deposit), Kitsas `plusOnKredit`.
 * - 11/21: VAT out of the gross, 111 on the VAT liability / 221 on the receivable;
 * - 18/28: cash basis, 418/428 on the unallocated accounts, new era;
 * - 24-27/29 reverse charge: tax 1xx (liability) and deduction 2xx (receivable) on top of net;
 * - 12/22 brutto, 13/23 margin, 0/14/15/16/19: the whole amount, no VAT line (the VAT return
 *   computes brutto and margin tax).
 */
export function vatBooking(
  code: number,
  percent: number,
  amountCents: number,
  credit: boolean,
): { mainCents: number; lines: VatBookingLine[] } {
  const pct = Number(percent || 0)
  const side = (cents: number, onCredit: boolean): Pick<VatBookingLine, 'debit_cents' | 'credit_cents'> =>
    onCredit ? { debit_cents: null, credit_cents: cents } : { debit_cents: cents, credit_cents: null }
  if (!pct || !amountCents) return { mainCents: amountCents, lines: [] }
  if (isReverseCharge(code)) {
    const vat = Math.round((amountCents * pct) / 100)
    if (!vat) return { mainCents: amountCents, lines: [] }
    return {
      mainCents: amountCents,
      lines: [
        { account: 1763, vat_code: 200 + code, ...side(vat, credit) },
        { account: 2939, vat_code: 100 + code, ...side(vat, !credit) },
      ],
    }
  }
  const companion: Record<number, { account: number; code: number; newEra?: boolean }> = {
    11: { account: 2939, code: 111 },
    21: { account: 1763, code: 221 },
    18: { account: 29391, code: 418, newEra: true },
    28: { account: 17631, code: 428, newEra: true },
  }
  const c = companion[code]
  if (!c) return { mainCents: amountCents, lines: [] }
  const vat = Math.round((amountCents * pct) / (100 + pct))
  if (!vat) return { mainCents: amountCents, lines: [] }
  return {
    mainCents: amountCents - vat,
    lines: [{ account: c.account, vat_code: c.code, ...side(vat, credit), ...(c.newEra ? { new_era: true } : {}) }],
  }
}
