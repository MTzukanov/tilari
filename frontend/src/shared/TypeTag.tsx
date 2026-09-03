import { accountTypeDescription } from './accountTypes'

/** Small type badge with native tooltip (title). */
export function TypeTag({ type }: { type: string | undefined | null }) {
  if (!type) return null
  const hint = accountTypeDescription(type)
  return (
    <span className="tag" title={hint} aria-label={hint}>
      {type}
    </span>
  )
}
