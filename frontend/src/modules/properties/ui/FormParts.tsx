import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import type { LeaseVoucher, WaterMovement } from '../api'

/** A read-only cell lined up with the inputs: a label and its value. */
export function Shown({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="property-lease-shown">
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <span className="property-lease-value">{value}</span>}
    </div>
  )
}

/** A linked voucher as Kitsas numbers it, with its title; opens the voucher. */
export function VoucherLink({ voucher, onOpen }: { voucher: LeaseVoucher; onOpen: (voucherId: number) => void }) {
  return (
    <button type="button" className="btn-link" onClick={() => onOpen(voucher.voucher_id)}>
      {formatVoucherId(voucher.series, voucher.doc_number, voucher.date)} · {voucher.title}
    </button>
  )
}

/** A booked line: its date and the amount that counts; the line's text on hover. */
export function MovementLink({ movement, onOpen }: { movement: WaterMovement; onOpen: (voucherId: number) => void }) {
  return (
    <button type="button" className="btn-link" title={movement.text} onClick={() => onOpen(movement.voucher.voucher_id)}>
      {formatDate(movement.date)} {formatCents(movement.amount_snt)}
    </button>
  )
}
