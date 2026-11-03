/**
 * Form 62, reserves, value changes and depreciation (`VSY06226`). Where the assets are in the ledger, its movements
 * fill a section and tax follows the book, until the owner types a figure. A typed figure wins and the rest of the
 * section follows from it. Reserves, value changes and buildings are typed: the ledger cannot tell their tax class.
 */
import { asCents } from '../../../cents'
import { postedOnly } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_DEPRECIATION, TYPE_OPENING } from '../../../vouchers'
import type { CheckView, Form62Row, Form62Section, Form62View, TaxReturnInputs } from './types'

type Role = 'opening' | 'additions' | 'disposals' | 'covered' | 'regular' | 'extra' | 'closing' | 'book' | 'increase' | 'decrease' | 'difference' | 'plain'

type FieldDef = { role: Role; code: number; label: string }

type SectionDef = {
  key: string
  title: string
  /** 6B fields whose accounts' movements fill this section. Empty: typed. */
  ledger: number[]
  /** Vero's check on regular depreciation, as a percentage of the base. Base at or under the floor is not checked. */
  limit?: { percent: number; floorCents: number }
  fields: FieldDef[]
}

function plain(code: number, label: string): FieldDef {
  return { role: 'plain', code, label }
}

export const SECTIONS_62: SectionDef[] = [
  {
    key: 'reserves',
    title: 'Erittely kirjanpidossa tehdyistä varauksista',
    ledger: [],
    fields: [
      plain(871, 'Toimintavaraus'),
      plain(872, 'Jälleenhankintavaraus'),
      plain(873, 'Luottotappiovaraus'),
      plain(874, 'Takuuvaraus'),
      plain(877, 'Asuintalovaraus'),
      plain(881, 'Pakolliset varaukset (KPL 5:14 §)'),
      plain(865, 'Muut varaukset'),
    ],
  },
  {
    key: 'value_changes',
    title: 'Erittely arvonmuutoksista',
    ledger: [],
    fields: [
      plain(866, 'Tulosvaikutteiset arvonlisäykset'),
      plain(867, 'Arvonlisäysten veronalainen osuus'),
      plain(868, 'Tulosvaikutteiset arvonalentumiset'),
      plain(869, 'Arvonalentumisten vähennyskelpoinen osuus'),
    ],
  },
  {
    key: 'movable',
    title: 'Irtain käyttöomaisuus (EVL 30 ja 31 §)',
    ledger: [403],
    limit: { percent: 25, floorCents: 120_000 },
    fields: [
      { role: 'opening', code: 800, label: 'Verotuksessa jäljellä oleva menojäännös verovuoden alussa' },
      { role: 'additions', code: 801, label: 'Lisäykset' },
      { role: 'disposals', code: 802, label: 'Luovutushinnat ja vakuutuskorvaukset' },
      { role: 'covered', code: 803, label: 'Katettu jälleenhankintavarauksella' },
      { role: 'regular', code: 804, label: 'Säännönmukainen poisto (EVL)' },
      { role: 'extra', code: 805, label: 'Lisäpoisto (EVL 32 §)' },
      { role: 'closing', code: 806, label: 'Verotuksessa jäljellä oleva menojäännös verovuoden lopussa' },
      { role: 'book', code: 807, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 847, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 848, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 849, label: 'Poistoero yhteensä' },
    ],
  },
  {
    key: 'buildings_shops',
    title: 'Rakennukset, esim. myymälät, tehtaat (EVL 34.2 § 1 kohta)',
    ledger: [],
    limit: { percent: 7, floorCents: 0 },
    fields: [
      { role: 'opening', code: 808, label: 'Rakennusten poistamaton hankintameno verovuoden alussa' },
      { role: 'additions', code: 809, label: 'Lisäykset' },
      { role: 'disposals', code: 810, label: 'Luovutetun hyödykkeen verotuksessa poistamaton hankintameno' },
      { role: 'covered', code: 811, label: 'Katettu jälleenhankintavarauksella' },
      { role: 'regular', code: 812, label: 'Säännönmukainen poisto (7 %)' },
      { role: 'extra', code: 813, label: 'Lisäpoisto (EVL 40 §)' },
      { role: 'closing', code: 814, label: 'Poistamaton hankintameno verovuoden lopussa' },
      { role: 'book', code: 815, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 850, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 851, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 852, label: 'Poistoero yhteensä' },
    ],
  },
  {
    key: 'buildings_offices',
    title: 'Rakennukset, esim. toimistot, asunnot (EVL 34.2 § 2 kohta)',
    ledger: [],
    limit: { percent: 4, floorCents: 0 },
    fields: [
      { role: 'opening', code: 816, label: 'Rakennusten poistamaton hankintameno verovuoden alussa' },
      { role: 'additions', code: 817, label: 'Lisäykset' },
      { role: 'disposals', code: 818, label: 'Luovutetun hyödykkeen verotuksessa poistamaton hankintameno' },
      { role: 'covered', code: 819, label: 'Katettu jälleenhankintavarauksella' },
      { role: 'regular', code: 820, label: 'Säännönmukainen poisto (4 %)' },
      { role: 'extra', code: 821, label: 'Lisäpoisto (EVL 40 §)' },
      { role: 'closing', code: 822, label: 'Poistamaton hankintameno verovuoden lopussa' },
      { role: 'book', code: 823, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 853, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 854, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 855, label: 'Poistoero yhteensä' },
    ],
  },
  {
    key: 'buildings_other',
    title: 'Rakennukset ja rakennelmat esim. säiliöt (EVL 34.2 § 3-5 kohta)',
    ledger: [],
    fields: [
      { role: 'opening', code: 824, label: 'Rakennusten poistamaton hankintameno verovuoden alussa' },
      { role: 'additions', code: 825, label: 'Lisäykset' },
      { role: 'disposals', code: 826, label: 'Luovutetun hyödykkeen verotuksessa poistamaton hankintameno' },
      { role: 'covered', code: 827, label: 'Katettu jälleenhankintavarauksella' },
      { role: 'regular', code: 828, label: 'Säännönmukainen poisto (EVL)' },
      { role: 'extra', code: 829, label: 'Lisäpoisto (EVL 40 §)' },
      { role: 'closing', code: 830, label: 'Poistamaton hankintameno verovuoden lopussa' },
      { role: 'book', code: 831, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 856, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 857, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 858, label: 'Poistoero yhteensä' },
    ],
  },
  {
    key: 'other_depreciation',
    title: 'Muut poistot, esim. tietokoneohjelmat, patentit',
    ledger: [400, 409],
    fields: [
      { role: 'opening', code: 832, label: 'Muu poistamaton hankintameno verovuoden alussa' },
      { role: 'additions', code: 833, label: 'Lisäykset' },
      { role: 'disposals', code: 834, label: 'Luovutetun hyödykkeen verotuksessa poistamaton hankintameno' },
      { role: 'covered', code: 835, label: 'Katettu jälleenhankintavarauksella' },
      { role: 'regular', code: 836, label: 'Säännönmukainen poisto (EVL)' },
      { role: 'extra', code: 837, label: 'Lisäpoisto (EVL 40 §)' },
      { role: 'closing', code: 838, label: 'Poistamaton hankintameno verovuoden lopussa' },
      { role: 'book', code: 839, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 859, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 860, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 861, label: 'Poistoero yhteensä' },
    ],
  },
  {
    key: 'long_term',
    title: 'Pitkävaikutteiset menot (EVL 24 ja 25 §)',
    ledger: [401],
    fields: [
      { role: 'opening', code: 840, label: 'Pitkävaikutteisten menojen poistamaton hankintameno verovuoden alussa' },
      { role: 'additions', code: 841, label: 'Lisäykset' },
      { role: 'regular', code: 842, label: 'Säännönmukainen poisto (EVL)' },
      { role: 'closing', code: 844, label: 'Poistamaton hankintameno verovuoden lopussa' },
      { role: 'book', code: 845, label: 'Kirjanpidossa tulosta rasittava suunnitelman mukainen poisto' },
      { role: 'increase', code: 862, label: 'Poistoeron lisäys' },
      { role: 'decrease', code: 863, label: 'Poistoeron vähennys' },
      { role: 'difference', code: 864, label: 'Poistoero yhteensä' },
    ],
  },
]

type Movements = { opening: number; additions: number; disposals: number; depreciation: number }

const NONE: Movements = { opening: 0, additions: 0, disposals: 0, depreciation: 0 }

/** A credit counts as depreciation on a depreciation voucher, or where the voucher also books on a depreciation account. */
function movements(db: SqliteDb, starts: string, ends: string, accounts: number[], depreciationAccounts: number[]): Movements {
  if (!accounts.length) return NONE
  const marks = accounts.map(() => '?').join(', ')
  const costMarks = depreciationAccounts.map(() => '?').join(', ')
  const isDepreciation = depreciationAccounts.length
    ? `(Tosite.tyyppi = ? OR Vienti.tosite IN (SELECT tosite FROM Vienti WHERE tili IN (${costMarks})))`
    : 'Tosite.tyyppi = ?'
  const rows = db.all<{ date: string; type: number; d: number; k: number; depreciation: number }>(
    `SELECT Vienti.pvm AS date, Tosite.tyyppi AS type,
            COALESCE(Vienti.debetsnt, 0) AS d, COALESCE(Vienti.kreditsnt, 0) AS k,
            ${isDepreciation} AS depreciation
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     WHERE ${postedOnly()} AND Vienti.tili IN (${marks}) AND Vienti.pvm <= ?`,
    [TYPE_DEPRECIATION, ...depreciationAccounts, ...accounts, ends],
  )
  const out = { ...NONE }
  for (const row of rows) {
    const d = asCents(row.d)
    const k = asCents(row.k)
    if (String(row.date) < starts || Number(row.type) === TYPE_OPENING) out.opening += d - k
    else if (Number(row.depreciation)) out.depreciation += k - d
    else {
      out.additions += d
      out.disposals += k
    }
  }
  return out
}

export type Form62Input = {
  starts: string
  ends: string
  inputs: TaxReturnInputs
  /** The accounts placed in a 6B field. */
  accountsIn: (field: number) => number[]
}

export function computeForm62(db: SqliteDb, input: Form62Input): Form62View {
  const typed = input.inputs.form62
  const depreciationAccounts = input.accountsIn(364)
  const sections: Form62Section[] = SECTIONS_62.map((section) => {
    const moved = movements(db, input.starts, input.ends, section.ledger.flatMap(input.accountsIn), depreciationAccounts)
    const fieldOf = (role: Role) => section.fields.find((field) => field.role === role)
    const pick = (role: Role, computed: number): number => {
      const field = fieldOf(role)
      if (!field) return 0
      return typed[field.code] ?? computed
    }
    const opening = pick('opening', moved.opening)
    const additions = pick('additions', moved.additions)
    const disposals = pick('disposals', moved.disposals)
    const covered = pick('covered', 0)
    const regular = pick('regular', moved.depreciation)
    const extra = pick('extra', 0)
    const closing = pick('closing', opening + additions - disposals - covered - regular - extra)
    const book = pick('book', moved.depreciation)
    const taken = regular + extra
    const bookClosing = moved.opening + moved.additions - moved.disposals - moved.depreciation
    const computedFor: Record<Role, number> = {
      opening: moved.opening,
      additions: moved.additions,
      disposals: moved.disposals,
      covered: 0,
      regular: moved.depreciation,
      extra: 0,
      closing: opening + additions - disposals - covered - regular - extra,
      book: moved.depreciation,
      increase: Math.max(taken - book, 0),
      decrease: Math.max(book - taken, 0),
      difference: section.ledger.length ? bookClosing - closing : 0,
      plain: 0,
    }
    const rows: Form62Row[] = section.fields.map((field) => {
      const own = typed[field.code]
      return {
        code: field.code,
        label: field.label,
        role: field.role,
        cents: own ?? computedFor[field.role],
        computed_cents: computedFor[field.role],
        typed: own != null,
      }
    })
    return { key: section.key, title: section.title, rows, has_values: rows.some((row) => row.cents !== 0) }
  })
  return { sections, used: sections.some((section) => section.has_values) }
}

/** The form's depreciation against the 6B's, and Vero's limits on regular depreciation. */
export function form62Checks(form: Form62View, values: Record<string, number>): CheckView[] {
  const sum = (roles: string[]) =>
    form.sections.flatMap((section) => section.rows).filter((row) => roles.includes(row.role)).reduce((total, row) => total + row.cents, 0)
  const taxGap = sum(['regular', 'extra']) - (values[365] ?? 0)
  const bookGap = sum(['book']) - (values[364] ?? 0)
  const checks: CheckView[] = [
    { key: 'form62_tax', state: taxGap ? 'crit' : 'ok', cents: taxGap },
    { key: 'form62_book', state: bookGap ? 'crit' : 'ok', cents: bookGap },
  ]
  const over = SECTIONS_62.flatMap((def) => {
    const limit = def.limit
    const section = form.sections.find((item) => item.key === def.key)
    if (!limit || !section) return []
    const at = (role: string) => section.rows.find((row) => row.role === role)?.cents ?? 0
    const base = at('opening') + at('additions') - at('disposals') - at('covered')
    const regular = section.rows.find((row) => row.role === 'regular')
    if (!regular || base <= limit.floorCents || regular.cents * 100 <= base * limit.percent) return []
    return [regular.code]
  })
  if (over.length) checks.push({ key: 'form62_limit', state: 'crit', count: over.length })
  return checks
}
