import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

export type IconSelectOption<T extends string | number> = {
  value: T
  label: string
  closedLabel?: string
  icon?: ReactNode
  group?: string
  disabled?: boolean
}

export function IconSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  options: IconSelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const selected = options.find((o) => o.value === value) ?? options[0]
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
  }, [value, options])

  function pick(option: IconSelectOption<T>) {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  function moveActive(dir: 1 | -1) {
    if (!options.length) return
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) {
        setActive(i)
        return
      }
    }
  }

  let lastGroup: string | undefined

  return (
    <div className={`icon-select${className ? ` ${className}` : ''}`} ref={boxRef}>
      <button
        type="button"
        className="icon-select-btn"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (boxRef.current?.contains(e.relatedTarget as Node)) return
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            if (open) moveActive(1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            moveActive(-1)
          } else if (e.key === 'Enter' && open && options[active]) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Tab' || e.key === 'Escape') {
            if (e.key === 'Escape' && open) e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        {selected?.icon ? <span className="icon-select-icon">{selected.icon}</span> : null}
        <span className="icon-select-label">{selected?.closedLabel ?? selected?.label ?? ''}</span>
      </button>
      {open ? (
        <ul className="icon-select-list search-select-list" role="listbox">
          {options.map((option, i) => {
            const showGroup = Boolean(option.group && option.group !== lastGroup)
            lastGroup = option.group
            return (
              <Fragment key={String(option.value)}>
                {showGroup ? (
                  <li className="icon-select-group" role="presentation">
                    {option.group}
                  </li>
                ) : null}
                <li
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  className={`${i === active ? 'is-active' : ''}${option.disabled ? ' is-disabled' : ''}`}
                  onMouseEnter={() => {
                    if (!option.disabled) setActive(i)
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(option)
                  }}
                >
                  {option.icon ? <span className="icon-select-icon">{option.icon}</span> : null}
                  <span>{option.label}</span>
                </li>
              </Fragment>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
