/** The return as plain text in OmaVero's order and wording, to read while filling the form by hand. */
import { formatFiCents } from '../../../cents'
import { ANSWERS } from './fields6b'
import type { RowView, TaxReturnView } from './types'

/** Plain spaces and a plain minus, so the text pastes anywhere. */
export function plainAmount(cents: number): string {
  return formatFiCents(cents).replace(/ /g, ' ').replace('−', '-')
}

/** What to type into a field: no thousands separators. */
export function typedAmount(cents: number): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

function fiDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

function yesNo(value: boolean): string {
  return value ? 'Kyllä' : 'Ei'
}

const AUDIT_TEXT: Record<number, string> = {
  1: 'Kyllä',
  2: 'Ei, tehdään myöhemmin.',
  3: 'Ei, tilintarkastaja on jätetty valitsematta.',
}

function rowText(row: RowView): string | null {
  if (row.state === 'zero') return null
  const mark = row.state === 'manual' ? ' (käsin)' : row.check ? ' (tarkista)' : ''
  if (row.tax_code != null) {
    return `${row.label}: Kirjanpito ${plainAmount(row.book_cents)}, Verotus ${plainAmount(row.tax_cents)}${mark}`
  }
  return `${row.label}: ${plainAmount(row.book_cents)}${mark}`
}

export function omaVeroText(view: TaxReturnView): string {
  const { inputs, values } = view
  const out: string[] = [
    'Elinkeinotoiminnan veroilmoitus - yhteisö (6B)',
    `${view.company.name}, ${view.company.business_id}`,
    `Tilikausi ${fiDate(view.starts)} - ${fiDate(view.ends)}`,
    '',
    'Lisätietojen antajan yhteystiedot',
    `Nimi: ${view.company.contact_name}`,
    `Puhelinnumero: ${view.company.contact_phone}`,
  ]
  if (inputs.contact_email) out.push(`Sähköposti: ${inputs.contact_email}`)

  out.push('', 'Osakkeenomistajat', `Onko kaikkien osakkaiden omistusosuus alle 10 %? ${yesNo(inputs.all_below_10_percent)}`)
  for (const holder of inputs.shareholders) {
    out.push(
      `Nimi: ${holder.name}`,
      'Henkilötunnus tai Y-tunnus: täytä itse',
      `Osakkeiden lukumäärä: ${holder.shares}`,
      `Vuokrat: ${plainAmount(holder.rents_cents)}`,
      `Korot: ${plainAmount(holder.interest_cents)}`,
      `Luovutukset: ${plainAmount(holder.sales_cents)}`,
      `Muut suoritukset: ${plainAmount(holder.other_cents)}`,
      `Osakaslainat: ${plainAmount(holder.loans_cents)}`,
    )
  }

  out.push('', 'Yhteisön päätös varojenjaosta')
  out.push(`Onko yhteisö päättänyt jakaa osinkoa tai varoja vapaan oman pääoman rahastosta? ${yesNo(Boolean(inputs.dividend || inputs.free_equity))}`)
  if (inputs.dividend) {
    out.push(
      `Päivä, jolloin päätös osingon- tai ylijäämänjaosta on tehty: ${fiDate(inputs.dividend.decided)}`,
      `Päivä, jolloin osinko tai ylijäämä on nostettavissa: ${fiDate(inputs.dividend.payable)}`,
      `Jaettavan osingon tai ylijäämän määrä yhteensä: ${plainAmount(inputs.dividend.amount_cents)}`,
    )
  }
  if (inputs.free_equity) {
    out.push(
      `Päivä, jolloin päätös varojen jaosta on tehty: ${fiDate(inputs.free_equity.decided)}`,
      `Päivä, jolloin varat ovat nostettavissa: ${fiDate(inputs.free_equity.payable)}`,
      `Vapaan oman pääoman rahastosta jaettavaksi päätetty määrä: ${plainAmount(inputs.free_equity.amount_cents)}`,
    )
  }
  out.push(`Yhtiön hallussa olevien omien osakkeiden lukumäärä tilikauden päättyessä: ${inputs.own_shares}`)

  for (const group of view.groups) {
    const lines = group.rows.flatMap((row) => rowText(row) ?? [])
    const totals = group.totals.filter((total) => total.cents || total.code === 354 || total.code === 397 || total.code === 435 || total.code === 460 || total.code === 478)
    if (!lines.length && !totals.length) continue
    out.push('', group.title, ...lines, ...totals.map((total) => `${total.label}: ${plainAmount(total.cents)}`))
  }
  if (values[504]) out.push(`Erät, joita ei oteta huomioon tappiota vahvistettaessa: ${plainAmount(values[504])}`)
  out.push('', 'Kaikki muut rahakentät: 0,00')

  out.push('', 'Kysymykset')
  for (const answer of ANSWERS) {
    const value = inputs.answers[answer.key]
    out.push(`${answer.label} ${value == null ? 'täytä itse' : yesNo(value)}`)
  }
  out.push(`Pitääkö yhtiön antaa erittely varauksista, arvonmuutoksista tai poistamattomista hankintamenoista? ${yesNo(view.forms.some((f) => f.form === '62'))}`)

  out.push('', 'Tilinpäätöstiedot ja muut liitteet')
  out.push(`Valitse, onko tilintarkastus tehty: ${inputs.audit ? AUDIT_TEXT[inputs.audit] : 'täytä itse'}`)
  if (inputs.audit === 1 && inputs.audit_remarks != null) {
    out.push(`Sisältääkö tilintarkastuskertomus kielteisiä lausuntoja, huomautuksia tai lisätietoja? ${yesNo(inputs.audit_remarks)}`)
  }
  out.push(`Onko tilinpäätös laadittu? ${yesNo(inputs.statements_prepared)}`)
  if (inputs.ownership_change_year) out.push(`Omistusmuutos, verovuosi: ${inputs.ownership_change_year}`)

  const forms = view.forms.map((f) => f.form)
  out.push('', `Liitelomakkeet ja muut ilmoitukset: ${forms.length ? forms.join(', ') : 'ei lukujen perusteella'}`)
  return out.join('\n')
}
