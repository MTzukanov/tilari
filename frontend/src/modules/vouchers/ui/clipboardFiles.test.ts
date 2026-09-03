import { describe, expect, it } from 'vitest'
import { filesFromClipboardData } from './clipboardFiles'

function fakeData(files: File[], itemFiles: File[] = []): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: itemFiles.map((file) => ({
      kind: 'file' as const,
      type: file.type,
      getAsFile: () => file,
    })),
  } as unknown as DataTransfer
}

describe('filesFromClipboardData', () => {
  it('reads files and image items, skipping empty duplicates', () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    const empty = new File([], 'empty.png', { type: 'image/png' })
    const fromItems = filesFromClipboardData(fakeData([], [png, empty]))
    expect(fromItems).toHaveLength(1)
    expect(fromItems[0].name).toBe('shot.png')
    const fromFiles = filesFromClipboardData(fakeData([png], [png]))
    expect(fromFiles).toHaveLength(1)
  })
})
