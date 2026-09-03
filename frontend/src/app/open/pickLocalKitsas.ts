export type PickedKitsas = {
  file: File
  handle: FileSystemFileHandle | null
}

export function canPickWritableLocalFile(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

/** Open dialog with write permission when the browser supports it. */
export async function pickWritableLocalKitsas(): Promise<PickedKitsas | null> {
  if (!canPickWritableLocalFile()) return null
  const [handle] = await window.showOpenFilePicker!({
    types: [{ description: 'Kitsas', accept: { 'application/octet-stream': ['.kitsas'] } }],
    multiple: false,
    mode: 'readwrite',
  })
  const file = await handle.getFile()
  if (!file.name.toLowerCase().endsWith('.kitsas')) throw new Error('kitsas_required')
  const perm = await handle.requestPermission({ mode: 'readwrite' })
  return { file, handle: perm === 'granted' ? handle : null }
}
