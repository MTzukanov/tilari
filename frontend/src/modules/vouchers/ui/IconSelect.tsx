import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFixedMenuStyle } from '../../../shared/useFixedMenuStyle'

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
  menuMinWidthPx,
  fixedMenu = false,
  onVerticalNav,
  'aria-label': ariaLabel,
  'data-row-key': dataRowKey,
  'data-col': dataCol,
}: {
  value: T
  options: IconSelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  /** Minimum menu width (px); helps long labels. */
  menuMinWidthPx?: number
  /** Use fixed positioning to escape overflow clips (e.g. statement table). */
  fixedMenu?: boolean
  /** When menu is closed, ArrowUp/Down call this instead of opening the list. */
  onVerticalNav?: (dir: 1 | -1) => void
  'aria-label'?: string
  'data-row-key'?: string
  'data-col'?: string
}) {
  const selected = options.find((o) => o.value === value) ?? options[0]
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const menuStyle = useFixedMenuStyle(fixedMenu && open, boxRef, {
    minWidthPx: menuMinWidthPx ?? 0,
    menuRef,
    onScrollAway: close,
  })

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
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

  const list = open ? (
    <ul
      ref={menuRef}
      className={`icon-select-list search-select-list${fixedMenu ? ' is-fixed-menu' : ''}`}
      role="listbox"
      style={fixedMenu ? menuStyle : menuMinWidthPx ? { minWidth: menuMinWidthPx } : undefined}
    >
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
              <span className="icon-select-option-label">{option.label}</span>
            </li>
          </Fragment>
        )
      })}
    </ul>
  ) : null

  return (
    <div className={`icon-select${className ? ` ${className}` : ''}`} ref={boxRef}>
      <button
        type="button"
        className="icon-select-btn"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-row-key={dataRowKey}
        data-col={dataCol}
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null
          if (boxRef.current?.contains(next) || menuRef.current?.contains(next)) return
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const dir = e.key === 'ArrowDown' ? 1 : -1
            if (onVerticalNav) {
              e.preventDefault()
              setOpen(false)
              onVerticalNav(dir)
              return
            }
            e.preventDefault()
            setOpen(true)
            if (open) moveActive(dir)
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
      {fixedMenu && list ? createPortal(list, document.body) : list}
    </div>
  )
}
