export type VoucherIdFields = {
  series?: string | null
  doc_number?: number | null
  date?: string | null
  id?: number
}

/** Kitsas-style voucher id: `A 12/2024`, `12/2024`, or `#id`. */
export function formatVoucherId(
  series: string | null | undefined,
  doc_number: number | null | undefined,
  date: string | null | undefined,
  opts?: { yearDigits?: 2 | 4; fallback?: string },
): string {
  const digits = opts?.yearDigits ?? 4
  const year = digits === 2 ? (date?.slice(2, 4) ?? '') : (date?.slice(0, 4) ?? '')
  const id = doc_number != null ? String(doc_number) : ''
  if (series && id) return `${series} ${id}/${year}`
  if (id) return `${id}/${year}`
  return opts?.fallback ?? '-'
}

export function formatVoucherIdFromDetail(data: VoucherIdFields): string {
  return formatVoucherId(data.series, data.doc_number, data.date, {
    fallback: data.id != null ? `#${data.id}` : '-',
  })
}
