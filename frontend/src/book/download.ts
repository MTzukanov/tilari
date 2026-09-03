export function downloadBytes(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.kitsas') ? name : `${name}.kitsas`
  a.click()
  URL.revokeObjectURL(url)
}
