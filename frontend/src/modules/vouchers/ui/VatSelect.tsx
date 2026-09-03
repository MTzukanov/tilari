import { vatChoices } from '../../vat/ui/vatCodes'
import { VatIcon } from '../../vat/ui/VatIcon'
import { IconSelect } from './IconSelect'

export function VatSelect({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (key: string) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <IconSelect
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
      options={vatChoices().map((c) => ({
        value: c.key,
        label: c.label,
        icon: <VatIcon code={c.code} />,
      }))}
    />
  )
}
