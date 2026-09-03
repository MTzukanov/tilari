const META = new Set(['TILI', 'KUVA', 'ERA', 'MUOTO'])

/** One row from Kitsas `Asetus.maksutavat-` / `maksutavat+`. */
export type PaymentMethod = {
  name: string
  account: number | null
  icon: string
  new_era: boolean
}

export const ALL_COUNTER_ACCOUNTS = 'all'

export function parsePaymentMethods(raw: string): PaymentMethod[] {
  if (!raw.trim()) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: PaymentMethod[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const map = item as Record<string, unknown>
    const names: string[] = []
    for (const [key, val] of Object.entries(map)) {
      if (!META.has(key) && typeof val === 'string' && val.trim()) names.push(val)
    }
    const name = String(map.fi || map.en || map.sv || names[0] || '').trim()
    if (!name) continue
    const tili = Number(map.TILI || 0)
    const era = map.ERA
    out.push({
      name,
      account: tili || null,
      icon: String(map.KUVA || ''),
      new_era: era === '-1' || era === -1 || Boolean(Number(era)),
    })
  }
  return out
}
