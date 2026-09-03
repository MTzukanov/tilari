import { voucherTypeName } from '../../../shared/voucherTypes'
import { creatableVoucherTypes } from '../catalog'
import { IconSelect } from './IconSelect'
import { VoucherTypeIcon } from './VoucherTypeIcon'

export function TypeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: number
  onChange: (type: number) => void
  disabled?: boolean
}) {
  const options = creatableVoucherTypes().map((d) => d.type)
  if (!options.includes(value)) options.unshift(value)
  return (
    <IconSelect
      value={value}
      disabled={disabled}
      aria-label={voucherTypeName(value)}
      onChange={onChange}
      options={options.map((type) => ({
        value: type,
        label: voucherTypeName(type),
        icon: <VoucherTypeIcon type={type} />,
      }))}
    />
  )
}
