/**
 * A small PDF writer for plain letters: A4 pages of positioned text in the standard Helvetica
 * fonts (WinAnsi: Finnish and Swedish letters and the euro sign). No images, no embedded fonts.
 */

export const A4 = { width: 595, height: 842 } as const

export type PdfText = { x: number; y: number; text: string; size?: number; bold?: boolean; align?: 'left' | 'right' }

/** Helvetica advance widths (1/1000 em) for ASCII 32-126, from its AFM. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556,
  222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/** WinAnsi bytes for characters outside Latin-1; number formats' narrow spaces and minus fold in. */
const WIN_ANSI: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '–': 0x96,
  '—': 0x97,
  ' ': 0xa0,
  ' ': 0x20,
  '−': 0x2d,
}

function byteOf(ch: string): number {
  const code = ch.codePointAt(0) ?? 63
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code
  return WIN_ANSI[ch] ?? 63 // '?'
}

/** Width of `text` in points; letters with marks take their base letter's width. */
export function textWidth(text: string, size: number, bold = false): number {
  let units = 0
  for (const ch of text) {
    const byte = byteOf(ch)
    // Spaces of every kind are a space; letters with marks take their base letter's width.
    const code = byte === 0xa0 ? 32 : byte === 0x2d ? 45 : (ch.normalize('NFD')[0].codePointAt(0) ?? 63)
    units += code >= 32 && code <= 126 ? HELVETICA[code - 32] : 556
  }
  return (units * size * (bold ? 1.05 : 1)) / 1000
}

/** Lines of at most `width` points, broken at spaces. */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** A PDF string literal: brackets and backslashes escaped, bytes above ASCII as octal. */
function pdfString(text: string): string {
  let out = '('
  for (const ch of text) {
    const b = byteOf(ch)
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(b)
  }
  return `${out})`
}

const num = (n: number) => (Math.round(n * 100) / 100).toString()

function pageContent(items: PdfText[]): string {
  return items
    .map((item) => {
      const size = item.size ?? 10
      const x = item.align === 'right' ? item.x - textWidth(item.text, size, item.bold) : item.x
      return `BT /${item.bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(item.y)} Td ${pdfString(item.text)} Tj ET`
    })
    .join('\n')
}

/** The PDF file: one A4 page per list of texts. Everything written is ASCII, so lengths are byte counts. */
export function textPdf(pages: PdfText[][], title = ''): Uint8Array {
  const objects: string[] = []
  const add = (body: string) => objects.push(body) // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  add(`<< /Title ${pdfString(title)} /Producer (Tilari) >>`)
  const kids: string[] = []
  for (const items of pages) {
    const content = pageContent(items)
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const contentRef = objects.length
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`,
    )
    kids.push(`${objects.length} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
