/**
 * What a card's form cannot be saved with, field by field: the lease, water and loan cards mark
 * each field to fix with its reason, list them above the buttons and move to the first.
 */
import { useEffect, type RefObject } from 'react'

type T = (key: string, vars?: Record<string, string | number>) => string

/**
 * A field to fix: `field` names it on the form (`starts`, `l2.increases.0.from`), `label` names it for
 * a reader (with its section and row), `message` says what to fix.
 */
export type FormIssue = { field: string; label: string; message: string }

/** Where a row's field is: its section's title key and its number, for the issue's label. */
export type RowAt = { section: string; n: number }

/** Collects a form's issues in the form's order; `label` and `message` are i18n keys. */
export function issueCollector(t: T) {
  const issues: FormIssue[] = []
  const issue = (field: string, label: string, message: string, at?: RowAt, vars?: Record<string, string | number>) =>
    issues.push({
      field,
      label: at ? t('properties.form.rowField', { section: t(at.section), n: at.n, field: t(label) }) : t(label),
      message: t(message, vars),
    })
  const has = (field: string) => issues.some((i) => i.field === field)
  return { issues, issue, has }
}

/** The reason a field is to fix, if it is. */
export function issueOf(issues: FormIssue[], field: string): string | undefined {
  return issues.find((i) => i.field === field)?.message
}

/** The marks an input carries when its field is to fix. */
export function invalidProps(issues: FormIssue[], field: string): { className?: string; 'aria-invalid'?: true } {
  return issueOf(issues, field) ? { className: 'field-invalid', 'aria-invalid': true } : {}
}

/** After a refused save (`refused` counts them), the first field to fix comes into view with the focus. */
export function useIssueFocus(ref: RefObject<HTMLElement | null>, refused: number): void {
  useEffect(() => {
    if (!refused) return
    const first = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-issue]')
    first?.scrollIntoView({ block: 'center' })
    first?.focus()
  }, [ref, refused])
}
