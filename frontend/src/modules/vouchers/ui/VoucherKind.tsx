import { voucherTypeName } from '../../../shared/voucherTypes'
import { voucherTypeDef } from '../catalog'
import { VoucherTypeIcon } from './VoucherTypeIcon'

export function VoucherKind({ type }: { type: number }) {
  const def = voucherTypeDef(type)
  const name = voucherTypeName(type)
  return (
    <span className={`voucher-kind ${def.kindClass}`} title={name}>
      <VoucherTypeIcon type={type} />
      <span className="voucher-kind-name">{name}</span>
    </span>
  )
}
