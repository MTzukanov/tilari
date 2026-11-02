/** The return as plain text in OmaVero's order and wording, to read while filling the form by hand. */
import { formatFiCents } from '../../../cents'
import { ANSWERS } from './fields6b'
import { HOLDING_GROUPS } from './form8a'
import type { RowView, SaleIdType, TaxReturnView } from './types'

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

const SALE_ID_TYPE: Record<SaleIdType, string> = { 1: 'Y-tunnus', 2: 'Kiinteistötunnus', 3: 'Maakoodi' }

function form8aText(view: TaxReturnView): string[] {
  const groups = view.form8a.groups.filter((group) => group.lines.length)
  if (!groups.length) return []
  const out = ['', 'Luettelo yhteisön omistamista arvopapereista ja arvo-osuuksista (lomake 8A)']
  for (const group of groups) {
    const def = HOLDING_GROUPS.find((item) => item.key === group.key)
    out.push('', group.title)
    // Housing shares bought since 2006 have no separate comparison value, so Muu omaisuus does not ask for one.
    const empty = group.key === 'other' ? '0,00' : 'täytä itse'
    for (const line of group.lines) {
      out.push(
        `Yhtiön tai osuuskunnan nimi: ${line.name}`,
        `Y-tunnus: ${line.business_id || 'täytä itse'}`,
        `Osakkeiden lukumäärä: ${line.shares}`,
        `Tuloverotuksessa poistamaton hankintameno: ${plainAmount(line.cost_cents)}`,
        `Vertailuarvo kappaleelta: ${line.unit_value || empty}`,
        `Vertailuarvo yhteensä: ${line.value_cents ? plainAmount(line.value_cents) : empty}`,
      )
    }
    out.push(
      `Osakkeiden lukumäärä yhteensä: ${group.shares_total}`,
      `${def?.costLabel ?? ''}: ${plainAmount(group.cost_cents)}`,
      `${def?.valueLabel ?? ''}: ${plainAmount(group.value_cents)}`,
    )
  }
  out.push(
    '',
    `Tuloverotuksen poistamattomat hankintamenot yhteensä: ${plainAmount(view.form8a.cost_cents)}`,
    `Vertailuarvot yhteensä: ${plainAmount(view.form8a.value_cents)}`,
  )
  return out
}

function form71bText(view: TaxReturnView): string[] {
  const { rows } = view.form71b
  if (!rows.length) return []
  const out = ['', 'Veronalaiset luovutusvoitot ja verotuksessa vähennyskelpoiset luovutustappiot (lomake 71B)']
  const part = (title: string, resultLabel: string, totalLabel: string, chosen: typeof rows, total: number) => {
    if (!chosen.length) return
    out.push('', title)
    for (const row of chosen) {
      out.push(
        `Luovutetun kohteen tunnuksen tyyppi: ${SALE_ID_TYPE[row.id_type]}`,
        `Luovutetun kohteen nimi: ${row.name}`,
        `${SALE_ID_TYPE[row.id_type]}: ${row.id_code || 'täytä itse'}`,
        ...(row.apartment ? [`Huoneiston numero: ${row.apartment}`] : []),
        `Hankinta-aika: ${row.acquired ? fiDate(row.acquired) : 'täytä itse'}`,
        `Luovutusaika: ${row.sold ? fiDate(row.sold) : 'täytä itse'}`,
        `Omistusosuus: ${row.share_after || 'täytä itse'}`,
        `Luovutushinta tai todennäköinen luovutushinta: ${plainAmount(row.price_cents)}`,
        `Verotuksessa poistamaton hankintameno: ${plainAmount(row.cost_cents)}`,
        `Voiton hankkimisesta aiheutuneet menot: ${plainAmount(row.expenses_cents)}`,
        `${resultLabel}: ${plainAmount(Math.abs(row.result_cents))}`,
      )
    }
    out.push(`${totalLabel}: ${plainAmount(total)}`)
  }
  part(
    'Veronalaiset muun omaisuuden luovutusvoitot',
    'Veronalainen luovutusvoitto',
    'Veronalaiset luovutusvoitot yhteensä',
    rows.filter((row) => row.result_cents >= 0),
    view.form71b.gains_cents,
  )
  part(
    'Muun omaisuuden rajoittamattomasti vähennyskelpoiset luovutustappiot',
    'Luovutustappio',
    'Luovutustappiot yhteensä',
    rows.filter((row) => row.result_cents < 0),
    view.form71b.losses_cents,
  )
  return out
}

function form62Text(view: TaxReturnView): string[] {
  if (!view.form62.used) return []
  const out = ['', 'Erittely varauksista, arvonmuutoksista ja poistoista (lomake 62)']
  for (const section of view.form62.sections.filter((item) => item.has_values)) {
    out.push('', section.title, ...section.rows.filter((row) => row.cents).map((row) => `${row.label}: ${plainAmount(row.cents)}`))
  }
  return out
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
  out.push(...form62Text(view), ...form8aText(view), ...form71bText(view))
  return out.join('\n')
}
