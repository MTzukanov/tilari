import { describe, expect, it } from 'vitest'
import { readFileBytes } from './readFileBytes'

describe('readFileBytes', () => {
  it('reads a Blob via stream with progress', async () => {
    const payload = new Uint8Array(64)
    payload[0] = 7
    payload[63] = 9
    const blob = new Blob([payload])
    const ticks: { loaded: number; total: number | null }[] = []
    const bytes = await readFileBytes(blob, {
      onProgress: (p) => ticks.push(p),
    })
    expect([...bytes]).toEqual([...payload])
    expect(ticks.at(-1)?.loaded).toBe(64)
  })
})
