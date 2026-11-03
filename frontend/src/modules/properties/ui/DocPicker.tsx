import { formatDate } from '../../../shared/dates'
import { FilePill } from '../../../shared/Pill'
import { SearchSelect } from '../../../shared/SearchSelect'
import type { DocCandidate } from '../api'

/**
 * A searchable pick of a Liitetieto voucher (the shared SearchSelect), newest first, with a pill
 * per file of the picked document that opens it. `starred` (suggested for this object) come first with a ★.
 * With a `placeholder` and no `label` it is an "add…" pick: the owner picks, the list resets.
 */
export function DocPicker({
  docs,
  value,
  onChange,
  label,
  placeholder,
  starred,
  className,
}: {
  docs: DocCandidate[]
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  starred?: (doc: DocCandidate) => boolean
  className?: string
}) {
  const star = (d: DocCandidate) => (starred?.(d) ? 0 : 1)
  const items = [
    ...(placeholder ? [] : [{ value: '', label: '–' }]),
    ...[...docs]
      .sort((a, b) => star(a) - star(b) || b.date.localeCompare(a.date) || b.voucher_id - a.voucher_id)
      .map((d) => ({ value: String(d.voucher_id), label: `${star(d) ? '' : '★ '}${formatDate(d.date)} · ${d.title}` })),
  ]
  const picked = docs.find((d) => String(d.voucher_id) === value)
  const pick = (
    <span className="property-doc-picker">
      <SearchSelect aria-label={label ?? placeholder} placeholder={placeholder} items={items} value={value} onChange={onChange} />
      {picked?.files.length ? (
        <span className="property-doc-picker-files">
          {picked.files.map((f) => (
            <FilePill key={f.id} id={f.id} name={f.name} />
          ))}
        </span>
      ) : null}
    </span>
  )
  if (!label) return pick
  return (
    <label className={className}>
      {label}
      {pick}
    </label>
  )
}
