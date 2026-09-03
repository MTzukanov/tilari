export type AssistantRow = {
  account: string
  amount: string
  vatChoice: string
  allocation: string
  accrual_starts: string
  accrual_ends: string
  description: string
}

export const EMPTY_ASSISTANT_ROW: AssistantRow = {
  account: '',
  amount: '',
  vatChoice: '21:25.5',
  allocation: '0',
  accrual_starts: '',
  accrual_ends: '',
  description: '',
}

/** Kitsas: row description (selite) stays empty when it matches the voucher title (otsikko); save copies the title. */
export function descriptionIfDifferent(description: string, title: string): string {
  const row = description.trim()
  const heading = title.trim()
  if (!row || row === heading) return ''
  return description
}
