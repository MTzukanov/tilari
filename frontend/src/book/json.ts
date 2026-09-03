export function parseJson(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object' && !ArrayBuffer.isView(raw) && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  let text: string
  if (raw instanceof Uint8Array) text = new TextDecoder().decode(raw)
  else text = String(raw)
  try {
    const data = JSON.parse(text) as unknown
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function nameFi(raw: unknown): string {
  const data = parseJson(raw)
  const name = data.nimi
  if (name && typeof name === 'object' && !Array.isArray(name)) {
    const map = name as Record<string, unknown>
    return String(map.fi || map.en || '')
  }
  if (typeof name === 'string') return name
  return ''
}

export function jsonDate(raw: unknown, key: string): string | null {
  const val = parseJson(raw)[key]
  if (val == null || val === '' || val === 'null') return null
  return String(val)
}
