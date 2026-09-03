import type { Route } from './routing'
import { useI18n } from '../i18n'
import { TilariMark } from '../shared/TilariMark'
import { NAV_ITEMS, activeNav as activeNavFromModules } from '../modules/registry'

export type NavId = string

export function activeNav(route: Route): NavId | null {
  return activeNavFromModules(route)
}

function NavGlyph({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'nav-glyph',
    'aria-hidden': true,
  } as const
  switch (name) {
    case 'horse':
      return <TilariMark className="nav-glyph tilari-mark-nav" />
    case 'plus':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M6 3.5h9.5A2.5 2.5 0 0 1 18 6v12.5A2.5 2.5 0 0 1 15.5 21H6a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 6 3.5zm6 4.2v3.3H15.3v2H12v3.3H10V13H6.7v-2H10V7.7h2z"
          />
        </svg>
      )
    case 'book':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M6 4.5h11.2A2.3 2.3 0 0 1 19.5 6.8v11.4A2.3 2.3 0 0 1 17.2 20.5H6.8A2.3 2.3 0 0 1 4.5 18.2V6.8A2.3 2.3 0 0 1 6.8 4.5H6zm1.8 2.2v11h9.4V6.7H7.8zm2 2.3h5.4v1.6H9.8V9zm0 3h5.4v1.6H9.8V12z"
          />
        </svg>
      )
    case 'invoice':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M7 3.5h10A2 2 0 0 1 19 5.5v15l-3.2-1.5L12.5 20l-3.2-1.5L6 20.5v-15A2 2 0 0 1 8 3.5h-1zm2.2 4.2v1.7h5.6V7.7H9.2zm0 3.2v1.7h5.6v-1.7H9.2z"
          />
        </svg>
      )
    case 'chart':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M4.5 19.5V5.8h2.2v13.7H4.5zm4.4 0V10h2.3v9.5H8.9zm4.5 0V7.2h2.3v12.3h-2.3zm4.4 0v-6.2H20v6.2h-2.2z"
          />
        </svg>
      )
    case 'years':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5V18a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V6.5A2.5 2.5 0 0 1 6.5 4zm1 3.2v2.1h9V7.2h-9zm0 4.2v2h4.2v-2H7.5zm0 3.4v2h6.6v-2H7.5z"
          />
        </svg>
      )
    case 'pct':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M7.4 6.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zm9.2 6.8a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM17.8 6.4 8.4 17.8l-1.6-1.3L16.2 5.1l1.6 1.3z"
          />
        </svg>
      )
    case 'gear':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M9.513 5.995 10.32 2.802h3.36l.807 3.193 2.829-1.687 2.376 2.376-1.687 2.829 3.193.807v3.36l-3.193.807 1.687 2.829-2.376 2.376-2.829-1.687-.807 3.193h-3.36l-.807-3.193-2.829 1.687-2.376-2.376 1.687-2.829L2.802 13.68v-3.36l3.193-.807L4.308 6.684 6.684 4.308zM9.1 12a2.9 2.9 0 1 0 5.8 0 2.9 2.9 0 1 0-5.8 0z"
          />
        </svg>
      )
    case 'help':
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M12 3.2A8.8 8.8 0 1 1 3.2 12 8.8 8.8 0 0 1 12 3.2zm.1 12.4a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm.05-8.3c-1.9 0-3.2 1.15-3.2 2.85h1.85c0-.7.55-1.2 1.3-1.2.75 0 1.25.45 1.25 1.15 0 .7-.4 1.05-1.15 1.55-.95.6-1.7 1.35-1.7 2.55v.4h1.85v-.25c0-.7.35-1.15 1.2-1.7.95-.6 1.85-1.4 1.85-2.7 0-1.7-1.35-2.65-3.25-2.65z"
          />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M12 8.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm0 5.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm0 5.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z"
          />
        </svg>
      )
  }
}

export function SideNav({
  route,
  open,
  onNavigate,
  onClose,
}: {
  route: Route
  open: boolean
  onNavigate: (href: string) => void
  onClose: () => void
}) {
  const current = activeNav(route)
  const { t } = useI18n()
  return (
    <>
      {open ? (
        <button type="button" className="sidenav-backdrop" aria-label={t('nav.closeMenu')} onClick={onClose} />
      ) : null}
      <nav className={`sidenav ${open ? 'is-open' : ''}`} aria-label={t('nav.main')}>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={`sidenav-item ${current === item.id ? 'is-active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              onNavigate(item.href)
              onClose()
            }}
          >
            <NavGlyph name={item.icon} />
            <span>{t(item.labelKey)}</span>
          </a>
        ))}
      </nav>
    </>
  )
}
