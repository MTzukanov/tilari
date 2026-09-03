import { describe, expect, it } from 'vitest'
import { lockerBookLabel } from './lockerBooks'
import type { LockerBook } from '../../api'

const books: LockerBook[] = [
  { id: 'aaaaaaaa1111', name: 'Firma.kitsas', size: 1, sha256: 'a', updated_at: '2026-01-01' },
  { id: 'bbbbbbbb2222', name: 'Firma.kitsas', size: 2, sha256: 'b', updated_at: '2026-01-02' },
  { id: 'cccccccc3333', name: 'Muu.kitsas', size: 3, sha256: 'c', updated_at: '2026-01-03' },
]

describe('lockerBookLabel', () => {
  it('shows short id when names collide', () => {
    expect(lockerBookLabel(books[0], books)).toBe('Firma.kitsas · aaaaaaaa')
    expect(lockerBookLabel(books[2], books)).toBe('Muu.kitsas')
  })
})
