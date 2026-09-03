import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GLYPH = {
  search:
    'M10.2 5.2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm7.3 11.2-3.2-3.2',
  print:
    'M7.2 3.6h9.6v4.2H7.2V3.6zM5 9.2h14A1.4 1.4 0 0 1 20.4 10.6v6.2h-3.2v3.6H6.8v-3.6H3.6v-6.2A1.4 1.4 0 0 1 5 9.2zm3.2 9.8h7.6v-3.2H8.2v3.2z',
  copy: 'M8.2 6.2h10.2v12.4H8.2V6.2zm-3 3h2.2v10.2A1.4 1.4 0 0 0 8.8 20.8H16v1.6H7.4A2.8 2.8 0 0 1 4.6 19.6V9.2h.6z',
  template:
    'M7 3.8h7.2L18.8 8.4v11.8H7V3.8zm7.2 1.6v3h3l-3-3zM9.2 12.2h7.6v1.6H9.2v-1.6zm0 3.2h5.6v1.6H9.2v-1.6z',
  trash:
    'M9.2 4.4h5.6l.6 1.6h3.4v1.8H5.2V6h3.4l.6-1.6zM7 9.4h10l-.7 10.2H7.7L7 9.4z',
  broom:
    'M14.6 4.2 16.2 5.8 9.4 12.6 7.8 11zM8.6 13.2l2.2 2.2-4.4 4.4H4.2v-2.2l4.4-4.4z',
  numbers:
    'M6.2 6.2h2.4v1.6H6.2V6.2zm0 5h2.4v1.6H6.2v-1.6zm0 5h2.4v1.6H6.2v-1.6zM11 6.2h6.8v1.6H11V6.2zm0 5h6.8v1.6H11v-1.6zm0 5h6.8v1.6H11v-1.6z',
}

function MenuIcon({ name }: { name: keyof typeof GLYPH }) {
  return (
    <svg viewBox="0 0 24 24" className="editor-menu-glyph" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={GLYPH[name]}
      />
    </svg>
  )
}

export type EditorMenuItem = {
  id: string
  label: string
  shortcut?: string
  icon: keyof typeof GLYPH
  disabled?: boolean
  onSelect: () => void
}

export function EditorMenu({
  label,
  items,
}: {
  label: string
  items: EditorMenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 0, right: 0 })
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const node = e.target as Node
      if (boxRef.current?.contains(node) || listRef.current?.contains(node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setPos({
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(true)
  }

  return (
    <div className="editor-menu" ref={boxRef}>
      {open
        ? createPortal(
            <ul
              ref={listRef}
              className="editor-menu-list"
              role="menu"
              style={{ bottom: pos.bottom, right: pos.right }}
            >
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="editor-menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return
                      setOpen(false)
                      item.onSelect()
                    }}
                  >
                    <MenuIcon name={item.icon} />
                    <span className="editor-menu-label">{item.label}</span>
                    {item.shortcut ? (
                      <span className="editor-menu-shortcut">{item.shortcut}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
      <button
        type="button"
        ref={btnRef}
        className="editor-tool-btn editor-menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={toggle}
      >
        <span className="editor-menu-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
    </div>
  )
}

export function ToolGlyph({
  children,
}: {
  children: ReactNode
}) {
  return (
    <svg viewBox="0 0 24 24" className="editor-tool-glyph" aria-hidden>
      {children}
    </svg>
  )
}
