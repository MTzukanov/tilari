import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchItem = { value: string; label: string }

export function SearchSelect({
  items,
  value,
  onChange,
  placeholder,
  allowCustom = false,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  items: SearchItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  allowCustom?: boolean
  disabled?: boolean
  'aria-label'?: string
}) {
  const selected = items.find((i) => i.value === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

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
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(item: SearchItem) {
    onChange(item.value)
    setQuery(item.label)
    setOpen(false)
  }

  return (
    <div className="search-select" ref={boxRef}>
      <input
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
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
          if (boxRef.current?.contains(e.relatedTarget as Node)) return
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
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
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
      {open && filtered.length > 0 ? (
        <ul className="search-select-list" role="listbox">
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
      ) : null}
    </div>
  )
}
