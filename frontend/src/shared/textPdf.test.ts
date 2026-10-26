import { describe, expect, it } from 'vitest'
import { textPdf, textWidth, wrapText } from './textPdf'

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes)

describe('textPdf', () => {
  it('writes a valid single-page PDF whose xref points at each object', () => {
    const pdf = latin1(textPdf([[{ x: 56, y: 780, text: 'Hello (world)', bold: true }]], 'Kirje'))
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    offsets.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true))
    expect(pdf).toContain('/F2 10 Tf 56 780 Td (Hello \\(world\\)) Tj')
    expect(pdf).toContain('/Title (Kirje)')
  })

  it('encodes Finnish letters, the euro sign and number spaces in WinAnsi', () => {
    const pdf = latin1(textPdf([[{ x: 0, y: 0, text: 'Vesimaksu 1 200,00 € äö −5' }]]))
    // ä = \344, ö = \366, € = \200, narrow and no-break spaces = \240, minus = '-'.
    expect(pdf).toContain('(Vesimaksu 1\\240200,00\\240\\200 \\344\\366 -5)')
  })

  it('measures with Helvetica widths and wraps at spaces', () => {
    expect(textWidth('0000', 10)).toBeCloseTo(22.24)
    expect(textWidth('ä', 10)).toBe(textWidth('a', 10))
    expect(wrapText('yksi kaksi kolme neljä', textWidth('yksi kaksi', 10), 10)).toEqual(['yksi kaksi', 'kolme', 'neljä'])
  })
})
