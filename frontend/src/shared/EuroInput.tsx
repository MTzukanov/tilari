import type { FocusEvent, InputHTMLAttributes } from 'react'
import { formatEurInput, parseEurInput, sanitizeEurInput } from './money'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string
  onChange: (value: string) => void
  /** When true (default), blur rewrites the field to `0,00` style. */
  commitOnBlur?: boolean
}

function commitEurDraft(raw: string): string {
  if (!raw || raw === '-' || raw === ',' || raw === '-,') return ''
  return formatEurInput(parseEurInput(raw))
}

export function EuroInput({
  value,
  onChange,
  commitOnBlur = true,
  className,
  onBlur,
  placeholder = '0,00',
  ...rest
}: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      className={['amount-input', className].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(sanitizeEurInput(e.target.value))}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        if (commitOnBlur) {
          const next = commitEurDraft(value)
          if (next !== value) onChange(next)
        }
        onBlur?.(e)
      }}
    />
  )
}
