/** Files from a paste event (Ctrl+V). Screenshots often arrive as items, not files. */
export function filesFromClipboardData(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const out: File[] = []
  const seen = new Set<string>()

  function add(file: File | null | undefined) {
    if (!file || file.size <= 0) return
    const key = `${file.name}:${file.size}:${file.type}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(file)
  }

  if (data.files?.length) {
    for (const file of Array.from(data.files)) add(file)
  }
  for (const item of Array.from(data.items || [])) {
    add(item.getAsFile())
  }
  return out
}

function extForType(type: string): string {
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/png') return 'png'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/webp') return 'webp'
  if (type === 'application/pdf') return 'pdf'
  const slash = type.indexOf('/')
  return slash >= 0 ? type.slice(slash + 1) : 'bin'
}

function isAttachmentType(type: string): boolean {
  return type.startsWith('image/') || type === 'application/pdf'
}

/** Button path: Clipboard API (needs a user gesture + permission). */
export async function filesFromClipboardApi(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    throw new Error('clipboard-read-unavailable')
  }
  const items = await navigator.clipboard.read()
  const out: File[] = []
  for (const item of items) {
    for (const type of item.types) {
      if (!isAttachmentType(type)) continue
      const blob = await item.getType(type)
      if (!blob.size) continue
      out.push(new File([blob], `liite.${extForType(type)}`, { type: blob.type || type }))
    }
  }
  return out
}
