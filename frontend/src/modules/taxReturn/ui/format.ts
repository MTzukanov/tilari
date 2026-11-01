import { formatFiCents } from '../../../book/cents'
import { formatDate } from '../../../shared/dates'

/** The form is Finnish, so its figures stay in Finnish format whatever the app's number setting says. */
export function formatFigure(cents: number): string {
  return formatFiCents(cents)
}

export function formatDay(iso: string): string {
  return formatDate(iso)
}
