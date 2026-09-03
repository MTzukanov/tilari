/** Shared SQL predicates. Reports and modules must use these, not copy Kitsas rules. */

export const SQL_POSTED = 'Tosite.tila >= 100'

export function postedOnly(alias = 'Tosite'): string {
  return `${alias}.tila >= 100`
}

/** P&L accounts: number 3xxx and above (Kitsas CAST(tili AS text) >= '3'). */
export function pnlAccount(column = 'Vienti.tili'): string {
  return `CAST(${column} AS text) >= '3'`
}

/** Balance-sheet accounts: number below 3xxx. */
export function bsAccount(column = 'Vienti.tili'): string {
  return `CAST(${column} AS text) < '3'`
}

/** Assets (1xxx): CAST(tili AS text) < '2'. */
export function assetAccount(column = 'Vienti.tili'): string {
  return `CAST(${column} AS text) < '2'`
}
