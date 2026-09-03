import { downloadBytes } from '../../book/download'

const KITSAS_TYPE = {
  description: 'Kitsas',
  accept: { 'application/octet-stream': ['.kitsas'] },
} as const

export function kitsasFileName(name: string): string {
  const trimmed = name.trim() || 'book.kitsas'
  return trimmed.toLowerCase().endsWith('.kitsas') ? trimmed : `${trimmed}.kitsas`
}

export function canSaveKitsasAs(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

/**
 * Save bytes via native save dialog, or prompt + download when unavailable.
 * @throws DOMException AbortError when the user cancels.
 */
export async function saveKitsasAs(
  bytes: Uint8Array,
  suggestedName: string,
  promptForName: (suggested: string) => string | null,
): Promise<void> {
  const suggested = kitsasFileName(suggestedName)
  if (canSaveKitsasAs()) {
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: suggested,
        types: [KITSAS_TYPE],
      })
      const w = await handle.createWritable()
      await w.write(bytes as BufferSource)
      await w.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }
  const picked = promptForName(suggested)
  if (!picked?.trim()) throw new DOMException('Aborted', 'AbortError')
  downloadBytes(bytes, picked.trim())
}
