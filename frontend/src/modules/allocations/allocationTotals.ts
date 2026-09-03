const TYPE_COST_CENTRE = 1

export type SummableAllocation = {
  type: number
  kitsas_profit_cents: number
  income_cents: number
  expense_cents: number
  profit_cents: number
}

/** Avoid double-count when projects are listed separately but also rolled into the parent KP. */
export function rowsForTotal<T extends { type: number }>(
  visible: T[],
  includeProjects: boolean,
): T[] {
  if (includeProjects) {
    return visible.filter((row) => row.type === TYPE_COST_CENTRE)
  }
  return visible
}

export function sumAllocationRows(rows: SummableAllocation[]) {
  return rows.reduce(
    (acc, row) => ({
      kitsas_profit_cents: acc.kitsas_profit_cents + row.kitsas_profit_cents,
      income_cents: acc.income_cents + row.income_cents,
      expense_cents: acc.expense_cents + row.expense_cents,
      profit_cents: acc.profit_cents + row.profit_cents,
      count: acc.count + 1,
    }),
    { kitsas_profit_cents: 0, income_cents: 0, expense_cents: 0, profit_cents: 0, count: 0 },
  )
}
