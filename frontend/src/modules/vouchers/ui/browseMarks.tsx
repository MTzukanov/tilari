function StrokeMark({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" className="browse-menu-glyph" aria-hidden>
      {paths.map((d) => (
        <path
          key={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          d={d}
        />
      ))}
    </svg>
  )
}

const BIN_PATHS = [
  'M4 7h16',
  'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  'M6 7l1.1 13h9.8L18 7',
  'M10 11v6',
  'M14 11v6',
]

const ALL_PATHS = ['M4 6h16', 'M4 12h16', 'M4 18h10', 'M16 16h4v4h-4z']

export function StatusAllMark() {
  return (
    <span className="voucher-status-mark is-all" aria-hidden>
      <StrokeMark paths={ALL_PATHS} />
    </span>
  )
}

export function statusDotKind(status: number) {
  if (status >= 100) return 'posted'
  if (status === 0) return 'deleted'
  if (status >= 50) return 'draft'
  return 'other'
}

export function StatusMark({ kind }: { kind: ReturnType<typeof statusDotKind> }) {
  if (kind === 'deleted') {
    return (
      <span className="voucher-status-mark is-deleted" aria-hidden>
        <StrokeMark paths={BIN_PATHS} />
      </span>
    )
  }
  return <span className={`voucher-status-dot is-${kind}`} />
}

export function statusDotTitleKey(kind: ReturnType<typeof statusDotKind>) {
  if (kind === 'posted') return 'voucherStatus.posted'
  if (kind === 'deleted') return 'voucherStatus.deleted'
  if (kind === 'draft') return 'voucherStatus.draft'
  return 'voucherStatus.template'
}
