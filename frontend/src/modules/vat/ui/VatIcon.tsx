import { vatIconKind, type VatIconKind } from './vatCodes'

const LETTER: Partial<Record<VatIconKind, string>> = {
  'sales-netto': 'N',
  'purchase-netto': 'N',
  'sales-brutto': 'B',
  'purchase-brutto': 'B',
  cash: '€',
  zero: '0',
  eu: 'EU',
  'eu-goods': 'EU',
  margin: 'M',
  tax: '%',
}

const TONE: Record<VatIconKind, 'sales' | 'purchase' | 'neutral' | 'empty'> = {
  none: 'empty',
  'sales-netto': 'sales',
  'purchase-netto': 'purchase',
  'sales-brutto': 'sales',
  'purchase-brutto': 'purchase',
  cash: 'neutral',
  zero: 'sales',
  eu: 'purchase',
  'eu-goods': 'purchase',
  globe: 'purchase',
  ship: 'purchase',
  hammer: 'neutral',
  margin: 'neutral',
  invoice: 'neutral',
  tax: 'neutral',
}

function Glyph({ kind }: { kind: VatIconKind }) {
  if (kind === 'globe') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zm0 1.7c1.9 0 3.6 3.1 3.6 7.1S13.9 19.1 12 19.1 8.4 16 8.4 12 10.1 4.9 12 4.9zM4.6 11.2h14.8v1.6H4.6z"
        />
      </svg>
    )
  }
  if (kind === 'ship') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 4.2 18.4 14H5.6L12 4.2zM4.4 15.4h15.2l-1.4 3.2H5.8L4.4 15.4zm1.8 4.4h11.6V21H6.2v-1.2z"
        />
      </svg>
    )
  }
  if (kind === 'hammer') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M14.2 3.4 20 9.2l-2.2 2.2-1.6-1.6-6.8 6.8-2.8-.2-.2-2.8 6.8-6.8-1.6-1.6 2.6-1.8zm-6 12.4 1.4 1.4-4.2 4.2-1.4-1.4 4.2-4.2z"
        />
      </svg>
    )
  }
  if (kind === 'invoice') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M7.2 3.6h9.6A1.6 1.6 0 0 1 18.4 5.2v15l-2.8-1.3-2.4 1.3-2.4-1.3-2.8 1.3V5.2A1.6 1.6 0 0 1 8.8 3.6H7.2zm2.2 3.6v1.6h6.2V7.2H9.4zm0 3.1v1.6h6.2v-1.6H9.4z"
        />
      </svg>
    )
  }
  const letter = LETTER[kind]
  if (letter) return <span className="vat-icon-letter">{letter}</span>
  return null
}

export function VatIcon({ code }: { code: number }) {
  const kind = vatIconKind(code)
  return (
    <span className={`vat-icon vat-icon-${TONE[kind]}`} data-vat-icon={kind} aria-hidden>
      <Glyph kind={kind} />
    </span>
  )
}
