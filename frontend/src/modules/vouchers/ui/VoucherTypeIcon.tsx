import type { VoucherIconId } from '../catalog'
import { voucherTypeDef } from '../catalog'
import { AttachmentClip } from './AttachmentClip'

const FILL: Partial<Record<VoucherIconId, string>> = {
  expense: 'M4.5 10.25h15v3.5H4.5z',
  income:
    'M10.25 4.5h3.5v5.75h5.75v3.5h-5.75v5.75h-3.5v-5.75H4.5v-3.5h5.75V4.5z',
  transfer:
    'M4 7.1h9.8V5.4L20.2 8.5 13.8 11.6V9.9H4V7.1zm16 7H10.2v-1.7L3.8 15.5 10.2 18.6v-1.7H20v-2.8z',
  invoice:
    'M7.2 3.6h9.6A1.6 1.6 0 0 1 18.4 5.2v15l-2.8-1.3-2.4 1.3-2.4-1.3-2.8 1.3V5.2A1.6 1.6 0 0 1 8.8 3.6H7.2zm2.2 3.6v1.6h6.2V7.2H9.4zm0 3.1v1.6h6.2v-1.6H9.4z',
}

/** Stroke glyphs: same weight and viewBox as AttachmentClip so they read at the same size. */
const STROKE: Partial<Record<VoucherIconId, string[]>> = {
  statement: [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z',
    'M14 3v6h6',
    'M8 13h8',
    'M8 17h5',
  ],
  vat: ['M19 5 5 19', 'M7.2 9.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z', 'M16.8 19.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'],
  yearend: ['M5 5h14v14H5z'],
  other: ['M3.5 6.5h17', 'M3.5 12h17', 'M3.5 17.5h11'],
  memo: [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z',
    'M14 3v6h6',
  ],
  payroll: [
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
    'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  opening: ['M5 20V9', 'M12 20V4', 'M19 20v-7'],
  import: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 21h16'],
}

function StrokeGlyph({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" className="voucher-type-glyph voucher-type-stroke" aria-hidden>
      {paths.map((d) => (
        <path
          key={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          d={d}
        />
      ))}
    </svg>
  )
}

export function VoucherTypeIcon({
  type,
  className,
}: {
  type: number
  className?: string
}) {
  const def = voucherTypeDef(type)
  const stroke = STROKE[def.icon]
  const fill = FILL[def.icon]
  return (
    <span className={`voucher-type-icon ${def.kindClass}${className ? ` ${className}` : ''}`} aria-hidden>
      {def.icon === 'attachment' ? (
        <AttachmentClip className="voucher-type-glyph" />
      ) : stroke ? (
        <StrokeGlyph paths={stroke} />
      ) : (
        <svg viewBox="0 0 24 24" className="voucher-type-glyph">
          <path fill="currentColor" d={fill!} />
        </svg>
      )}
    </span>
  )
}
