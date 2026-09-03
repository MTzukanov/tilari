export function SectionToggle({
  title,
  open,
  onToggle,
}: {
  title: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <h2>
      <button type="button" className="section-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="section-toggle-icon" aria-hidden="true">
          {open ? '\u25BE' : '\u25B8'}
        </span>
        {title}
      </button>
    </h2>
  )
}
