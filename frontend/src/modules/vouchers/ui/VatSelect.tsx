import {
  defaultVatPercent,
  isZeroVatType,
  VAT_RATES,
  vatFromKey,
  vatKey,
  vatPercentLabel,
  vatTypeChoices,
} from '../../vat/ui/vatCodes'
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
  const choice = vatFromKey(value)
  const showRate = !isZeroVatType(choice.code)
  const rateValue = showRate
    ? VAT_RATES.includes(choice.percent as (typeof VAT_RATES)[number])
      ? choice.percent
      : choice.percent || defaultVatPercent(choice.code)
    : 0
  const rateOptions = [
    ...VAT_RATES.map((percent) => ({
      value: percent,
      label: vatPercentLabel(percent),
    })),
    ...(showRate && !VAT_RATES.includes(choice.percent as (typeof VAT_RATES)[number]) && choice.percent
      ? [{ value: choice.percent, label: vatPercentLabel(choice.percent) }]
      : []),
  ]

  return (
    <div className="vat-select">
      <IconSelect
        value={choice.code}
        disabled={disabled}
        aria-label={ariaLabel}
        className="vat-select-type"
        onChange={(code) => {
          const next = Number(code)
          if (isZeroVatType(next)) onChange(vatKey(next, 0))
          else onChange(vatKey(next, choice.percent || defaultVatPercent(next)))
        }}
        options={vatTypeChoices().map((c) => ({
          value: c.code,
          label: c.label,
          icon: <VatIcon code={c.code} />,
        }))}
      />
      {showRate ? (
        <IconSelect
          value={rateValue}
          disabled={disabled}
          aria-label={vatPercentLabel(rateValue)}
          className="vat-select-rate"
          onChange={(percent) => onChange(vatKey(choice.code, Number(percent)))}
          options={rateOptions}
        />
      ) : null}
    </div>
  )
}
