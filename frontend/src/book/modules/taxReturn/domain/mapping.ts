/**
 * Which 6B field an account belongs to. In this order: the book's own choices, named standard accounts,
 * the account's type, then the standard chart's headings. A heading covers the accounts from its number
 * up to the next heading, compared as text the way Kitsas orders its chart (`17631` sits under `176`).
 * Tested against filed returns, see docs/TAX_RETURN.md.
 */

/** Sale accounts carry a net figure. Gains and losses come from the 71B rows. */
export const SALE = 'sale'

export type Target = number | typeof SALE

export type PlacementSource = 'override' | 'named' | 'type' | 'chart' | 'moved'

export type Placement = {
  /** `null`: no field, the owner has to choose one. */
  code: Target | null
  source: PlacementSource | null
  /** The cost is booked but not deducted (`DPZ`, tax-free dividends). */
  notInTax?: boolean
}

/** Income statement headings. `null` headings exist only in group accounts. */
export const PNL_CHART: Record<string, number | null> = {
  '3': 330,
  '360': 359,
  '363': 331,
  '365': 336,
  '4': 359,
  '445': 360,
  '5': 361,
  '60': 362,
  '63': 363,
  '68': 364,
  '695': 382,
  '699': 389,
  '70': 377,
  '7950': 368,
  '800': 377,
  '870': 376,
  '874': 377,
  '877': 384,
  '884': 374,
  '889': 377,
  '899': null,
  '900': 337,
  '903': null,
  '904': 337,
  '912': 342,
  '913': 332,
  '914': 345,
  '915': 339,
  '916': 340,
  '917': 341,
  '926': 345,
  '930': 382,
  '931': 388,
  '932': 382,
  '933': 388,
  '934': 382,
  '935': 389,
  '936': 346,
  '937': 389,
  '941': 346,
  '942': 328,
  '944': 387,
  '951': 386,
  '952': 387,
  '956': 392,
  '97': 364,
  '98': 394,
  '988': 436,
  '990': 378,
  '999': null,
}

/** Balance sheet headings. */
export const BALANCE_CHART: Record<string, number | null> = {
  '102': 400,
  '105': 401,
  '109': 404,
  '110': 402,
  '116': 403,
  '130': 409,
  '138': 404,
  '140': 405,
  '141': 406,
  '142': 405,
  '143': 407,
  '144': 405,
  '147': 408,
  '150': 411,
  '151': 412,
  '152': 413,
  '153': 414,
  '154': 417,
  '160': 419,
  '163': 420,
  '164': 421,
  '165': 422,
  '166': 423,
  '168': 425,
  '169': null,
  '170': 419,
  '173': 420,
  '174': 421,
  '175': 422,
  '176': 423,
  '180': 425,
  '186': 424,
  '190': 426,
  '191': 427,
  '200': 470,
  '202': 495,
  '2061': 496,
  '2071': 497,
  '210': 470,
  '2103': 495,
  '215': 470,
  '225': 474,
  '238': 459,
  '239': null,
  '240': 497,
  '25': 458,
  '26': 452,
  '260': 459,
  '261': 451,
  '262': 452,
  '265': 458,
  '266': 464,
  '267': 453,
  '269': 458,
  '270': 454,
  '271': 455,
  '272': 458,
  '275': 457,
  '28': 452,
  '280': 459,
  '281': 450,
  '2817': 451,
  '282': 452,
  '285': 458,
  '286': 465,
  '287': 453,
  '289': 458,
  '290': 454,
  '291': 455,
  '292': 458,
  '2941': 456,
  '2949': 458,
  '295': 457,
  '298': null,
}

/** Standard accounts whose heading or type would mislead. */
const NAMED_PNL: Record<number, Placement> = {
  9090: { code: 337, source: 'named', notInTax: true },
  9270: { code: 337, source: 'named', notInTax: true },
  9530: { code: 379, source: 'named' },
  9540: { code: 379, source: 'named' },
}

const TYPE_PNL: Record<string, Placement> = {
  CZ: { code: 358, source: 'type' },
  CLZ: { code: 358, source: 'type' },
  DZ: { code: 384, source: 'type' },
  DH: { code: 368, source: 'type' },
  DP: { code: 364, source: 'type' },
  DPZ: { code: 364, source: 'type', notInTax: true },
}

function sortedKeys(table: Record<string, number | null>): string[] {
  return Object.keys(table).sort()
}

const PNL_KEYS = sortedKeys(PNL_CHART)
const BALANCE_KEYS = sortedKeys(BALANCE_CHART)

function headingOf(account: number, keys: string[]): string | null {
  const text = String(account)
  let hit: string | null = null
  for (const key of keys) {
    if (key > text) break
    hit = key
  }
  return hit
}

export type Overrides = Record<string, Target>

export function placeIncomeStatement(account: number, type: string, overrides: Overrides = {}): Placement {
  const own = overrides[String(account)]
  if (own != null) return { code: own, source: 'override' }
  const named = NAMED_PNL[account]
  if (named) return named
  // Income taxes are direct taxes whatever their account type says.
  if (!String(account).startsWith('99')) {
    const byType = TYPE_PNL[type]
    if (byType) return byType
  }
  const heading = headingOf(account, PNL_KEYS)
  const code = heading == null ? null : (PNL_CHART[heading] ?? null)
  return { code, source: code == null ? null : 'chart' }
}

export function placeBalanceSheet(account: number, overrides: Overrides = {}): Placement {
  const own = overrides[String(account)]
  if (own != null) return { code: own, source: 'override' }
  const heading = headingOf(account, BALANCE_KEYS)
  const code = heading == null ? null : (BALANCE_CHART[heading] ?? null)
  return { code, source: code == null ? null : 'chart' }
}

/** A credit balance on a bank account is debt to the bank, not a negative asset. */
export const BANK_OVERDRAFT_CODE = 452

export function isBankAccount(account: number): boolean {
  return String(account).startsWith('19')
}

/** Long-term debts sit under `26` and `27`, short-term under `28` and `29`. */
export function debtTerm(account: number): 'long' | 'short' {
  const head = String(account).slice(0, 2)
  return head === '26' || head === '27' ? 'long' : 'short'
}
