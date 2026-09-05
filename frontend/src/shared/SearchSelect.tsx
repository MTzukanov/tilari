import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFixedMenuStyle } from './useFixedMenuStyle'

export type SearchItem = { value: string; label: string }

export function SearchSelect({
  items,
  value,
  onChange,
  placeholder,
  allowCustom = false,
  disabled = false,
  menuMinWidthPx,
  fixedMenu = false,
  onVerticalNav,
  'aria-label': ariaLabel,
  'data-row-key': dataRowKey,
  'data-col': dataCol,
}: {
  items: SearchItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  allowCustom?: boolean
  disabled?: boolean
  menuMinWidthPx?: number
  /** Use fixed positioning to escape overflow clips (e.g. statement table). */
  fixedMenu?: boolean
  /** When menu is closed, ArrowUp/Down call this instead of opening the list. */
  onVerticalNav?: (dir: 1 | -1) => void
  'aria-label'?: string
  'data-row-key'?: string
  'data-col'?: string
}) {
  const selected = items.find((i) => i.value === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const showMenu = open && items.length > 0
  const menuStyle = useFixedMenuStyle(fixedMenu && showMenu, boxRef, {
    minWidthPx: menuMinWidthPx ?? 280,
    menuRef,
    onScrollAway: close,
  })

  const shown = open ? query : selected?.label || (allowCustom ? value : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedLabel = (selected?.label || '').toLowerCase()
    if (!q || q === selectedLabel) return items.slice(0, 100)
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q),
      )
      .slice(0, 100)
  }, [items, query, selected])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(item: SearchItem) {
    onChange(item.value)
    setQuery(item.label)
    setOpen(false)
  }

  const absStyle =
    !fixedMenu && menuMinWidthPx
      ? { minWidth: Math.max(menuMinWidthPx, 0) }
      : undefined

  const list = showMenu ? (
    <ul
      ref={menuRef}
      className={`search-select-list${fixedMenu ? ' is-fixed-menu' : ''}`}
      role="listbox"
      style={fixedMenu ? menuStyle : absStyle}
    >
      {filtered.map((item, i) => (
        <li
          key={`${item.value}-${i}`}
          role="option"
          aria-selected={item.value === value}
          className={i === active ? 'is-active' : ''}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            pick(item)
          }}
        >
          {item.label}
        </li>
      ))}
    </ul>
  ) : null

  return (
    <div className="search-select" ref={boxRef}>
      <input
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        data-row-key={dataRowKey}
        data-col={dataCol}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        value={shown}
        onFocus={() => {
          setQuery(selected?.label || value || '')
          setOpen(true)
          setActive(0)
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null
          if (boxRef.current?.contains(next) || menuRef.current?.contains(next)) return
          setOpen(false)
        }}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setOpen(true)
          setActive(0)
          if (allowCustom) onChange(next)
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
            setActive((i) =>
              dir > 0
                ? Math.min(i + 1, Math.max(filtered.length - 1, 0))
                : Math.max(i - 1, 0),
            )
          } else if (e.key === 'Enter' && open && filtered[active]) {
            e.preventDefault()
            pick(filtered[active])
          } else if (e.key === 'Tab') {
            if (open && filtered[active]) {
              const q = query.trim().toLowerCase()
              const selectedLabel = (selected?.label || '').toLowerCase()
              if (q && q !== selectedLabel) pick(filtered[active])
            }
            setOpen(false)
          } else if (e.key === 'Escape') {
            if (open) e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {fixedMenu && list ? createPortal(list, document.body) : list}
    </div>
  )
}
