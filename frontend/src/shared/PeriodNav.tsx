import { useMemo } from 'react'
import type { Period } from '../api'
import {
  formatRangeLabel,
  monthsInPeriods,
  parseRangeValue,
  rangeValue,
  type NavMode,
} from './periodNav'
import { useI18n } from '../i18n'

/** Shared ‹ label › stepper used by PeriodNav and ALV tax-period browsing. */
export function PeriodStepper({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
  prevTitle,
  nextTitle,
  disabled = false,
  options,
  value,
  onSelect,
  selectAriaLabel,
}: {
  label: string
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  prevTitle?: string
  nextTitle?: string
  disabled?: boolean
  options?: { value: string; label: string }[]
  value?: string
  onSelect?: (value: string) => void
  selectAriaLabel?: string
}) {
  const showSelect = Boolean(options?.length && onSelect && !disabled)

  return (
    <div
      className={`nav-stepper ${disabled ? 'is-disabled' : ''}`}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="nav-btn"
        disabled={disabled || !canPrev}
        title={prevTitle}
        onClick={onPrev}
      >
        {'\u2039'}
      </button>
      {showSelect ? (
        <select
          className="nav-label nav-label-select"
          aria-label={selectAriaLabel || label}
          value={value}
          onChange={(e) => onSelect?.(e.target.value)}
        >
          {options!.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="nav-label">{label}</span>
      )}
      <button
        type="button"
        className="nav-btn"
        disabled={disabled || !canNext}
        title={nextTitle}
        onClick={onNext}
      >
        {'\u203a'}
      </button>
    </div>
  )
}

export function PeriodNav({
  radioName,
  mode,
  start_date,
  end_date,
  canPrev,
  canNext,
  periods,
  sticky = false,
  onSelectMode,
  onSelectRange,
  onPrev,
  onNext,
}: {
  radioName: string
  mode: NavMode
  start_date: string
  end_date: string
  canPrev: boolean
  canNext: boolean
  periods: Period[]
  sticky?: boolean
  onSelectMode: (mode: NavMode) => void
  onSelectRange: (starts: string, ends: string) => void
  onPrev: () => void
  onNext: () => void
}) {
  const scopedDisabled = mode === 'all'
  const { t } = useI18n()
  const label = formatRangeLabel(mode, start_date, end_date)
  const current = rangeValue(start_date, end_date)

  const options = useMemo(() => {
    if (mode === 'all') return []
    const ranges = mode === 'month' ? monthsInPeriods(periods) : periods
    const opts = ranges.map((r) => ({
      value: rangeValue(r.starts, r.ends),
      label: formatRangeLabel(mode, r.starts, r.ends),
    }))
    if (start_date && end_date && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label })
    }
    return opts
  }, [mode, periods, start_date, end_date, current, label])

  return (
    <div
      className={`ledger-head-nav${sticky ? ' is-sticky' : ''}`}
      data-start={start_date}
      data-end={end_date}
    >
      <div className="ledger-nav">
        <div className="nav-mode" role="radiogroup" aria-label={t('period.kind')}>
          <label className={`nav-radio ${mode === 'month' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name={radioName}
              checked={mode === 'month'}
              onChange={() => onSelectMode('month')}
            />
            {t('period.month')}
          </label>
          <label className={`nav-radio ${mode === 'year' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name={radioName}
              checked={mode === 'year'}
              onChange={() => onSelectMode('year')}
            />
            {t('period.year')}
          </label>
          <label className={`nav-radio ${mode === 'all' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name={radioName}
              checked={mode === 'all'}
              onChange={() => onSelectMode('all')}
            />
            {t('period.all')}
          </label>
        </div>

        <PeriodStepper
          label={label}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={onPrev}
          onNext={onNext}
          disabled={scopedDisabled}
          prevTitle={mode === 'month' ? t('period.prevMonth') : t('period.prevYear')}
          nextTitle={mode === 'month' ? t('period.nextMonth') : t('period.nextYear')}
          options={options}
          value={current}
          selectAriaLabel={t('period.pick')}
          onSelect={(raw) => {
            const next = parseRangeValue(raw)
            if (next) onSelectRange(next.starts, next.ends)
          }}
        />
      </div>
    </div>
  )
}
