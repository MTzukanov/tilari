/** VAT companion accounts and codes used when the editor splits a net line. */

export function vatAccount(code: number): number {
  if ([21, 29].includes(code)) return 1763
  if (code === 28) return 17631
  if ([11, 12, 19].includes(code)) return 2939
  if (code === 18) return 29391
  return 0
}

export function vatCompanionCode(code: number): number {
  if ([21, 29].includes(code)) return code + 200
  if (code === 28) return 428
  if ([11, 12, 19].includes(code)) return code + 100
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
