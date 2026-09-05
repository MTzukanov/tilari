import {
  defaultVatPercent,
  isZeroVatType,
  VAT_RATES,
  vatFromKey,
  vatKey,
  vatPercentLabel,
  vatTypeChoices,
  vatTypeKindForVoucher,
  type VatTypeKind,
} from '../../vat/ui/vatCodes'
import { VatIcon } from '../../vat/ui/VatIcon'
import { IconSelect } from './IconSelect'

export function VatSelect({
  value,
  onChange,
  disabled = false,
  kind = 'all',
  voucherType,
  fixedMenu = false,
  onVerticalNav,
  'aria-label': ariaLabel,
  'data-row-key': dataRowKey,
  'data-col': dataCol,
}: {
  value: string
  onChange: (key: string) => void
  disabled?: boolean
  /** Kitsas expense vs income filter; overrides voucherType when set. */
  kind?: VatTypeKind
  voucherType?: number
  fixedMenu?: boolean
  onVerticalNav?: (dir: 1 | -1) => void
  'aria-label'?: string
  'data-row-key'?: string
  'data-col'?: string
}) {
  const filter = voucherType != null ? vatTypeKindForVoucher(voucherType) : kind
  const types = vatTypeChoices(filter)
  const choice = vatFromKey(value)
  const typeInList = types.some((c) => c.code === choice.code)
  const typeOptions = typeInList
    ? types
    : [
        ...types,
        {
          code: choice.code,
          label: choice.label.replace(/\s+\d+,\d{2} %$/, ''),
          zeroRate: isZeroVatType(choice.code),
        },
      ]
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
    ...(showRate &&
    !VAT_RATES.includes(choice.percent as (typeof VAT_RATES)[number]) &&
    choice.percent
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
        menuMinWidthPx={280}
        fixedMenu={fixedMenu}
        onVerticalNav={onVerticalNav}
        data-row-key={dataRowKey}
        data-col={dataCol}
        onChange={(code) => {
          const next = Number(code)
          if (isZeroVatType(next)) onChange(vatKey(next, 0))
          else onChange(vatKey(next, choice.percent || defaultVatPercent(next)))
        }}
        options={typeOptions.map((c) => ({
          value: c.code,
          label: c.label,
          closedLabel: '',
          icon: <VatIcon code={c.code} />,
        }))}
      />
      {showRate ? (
        <IconSelect
          value={rateValue}
          disabled={disabled}
          aria-label={vatPercentLabel(rateValue)}
          className="vat-select-rate"
          fixedMenu={fixedMenu}
          onVerticalNav={onVerticalNav}
          onChange={(percent) => onChange(vatKey(choice.code, Number(percent)))}
          options={rateOptions}
        />
      ) : null}
    </div>
  )
}
