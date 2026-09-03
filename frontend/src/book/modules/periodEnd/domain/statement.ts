/**
 * Financial statements (tilinpäätös): notes to the accounts (liitetiedot),
 * HTML generation, and the print-ready document. Kitsas-compatible on disk —
 * the editable text lives in the `TPTEKSTI_{date}` attachment on voucher 0
 * with `Asetus.tilinpaatos/{date}` as backup, and an uploaded PDF (if any)
 * in `TP_{date}`.
 *
 * Tilari renders the final document as HTML and leaves PDF creation to the
 * browser print dialog, so no PDF library is bundled.
 */
import { getAccounts, getSettings } from '../../../access'
import { isPracticeValue, wallToday } from '../../../clock'
import { computeBalances } from '../../../balances'
import { PostingError } from '../../../errors'
import {
  getFiscalPeriodByEnd,
  requireFiscalPeriodByEnd,
  updateFiscalPeriodJson,
  type TaxCalculation,
} from '../../../fiscalPeriod'
import { isFiscalPeriodLocked } from './fiscalPeriodLock'
import { sha256hexSync } from '../../../sha256'
import type { SqliteDb } from '../../../sqlite'
import {
  DEFAULT_TEMPLATE_FI,
  generateNotes,
  parseSections,
  type PmaSize,
  type TemplateSection,
} from './statementTemplate'
import { renderReportMarkerHtml, parseReportMarkerLine } from '../../../chartReport'
import { buildMacroContext, buildStatementScalars } from './statementMacros'
import { processStatementTables } from './statementTables'
import { formatFiCents } from './yearEndBook'

const TEXT_ROLE = (ends: string) => `TPTEKSTI_${ends}`
const PDF_ROLE = (ends: string) => `TP_${ends}`
/** Kitsas: tppohja/fi — notes-to-the-accounts template. */
const TEMPLATE_KEY = 'tppohja/fi'
/** Kitsas: tilinpaatosvalinnat — PMA size and optional notes sections. */
const OPTIONS_KEY = 'tilinpaatosvalinnat'
/** Kitsas: osakemaara — share count used in the dividend proposal. */
const SHARE_COUNT_KEY = 'osakemaara'

export type StatementDoc = {
  ends: string
  starts: string
  /** Editable notes HTML (without the leading marker line). */
  html: string
  size: PmaSize
  selected: string[]
  headcount: number | null
  share_count: number | null
  sections: TemplateSection[]
  drafted_at: string | null
  confirmed_at: string | null
  has_pdf: boolean
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatFi(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.${y}`
}

function readAttachmentText(db: SqliteDb, role: string): { markers: string; html: string } | null {
  const row = db.get<{ data: Uint8Array | null }>(
    'SELECT data FROM Liite WHERE tosite = 0 AND roolinimi = ?',
    [role],
  )
  if (!row?.data) return null
  const bytes = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data as ArrayBuffer)
  const text = new TextDecoder().decode(bytes)
  const nl = text.indexOf('\n')
  if (nl < 0) return { markers: text.trim(), html: '' }
  return { markers: text.slice(0, nl).trim(), html: text.slice(nl + 1) }
}

function writeAttachment(
  db: SqliteDb,
  role: string,
  name: string,
  type: string,
  bytes: Uint8Array,
): void {
  const sha = sha256hexSync(bytes)
  const existing = db.get<{ id: number }>(
    'SELECT id FROM Liite WHERE tosite = 0 AND roolinimi = ?',
    [role],
  )
  if (existing) {
    db.run('UPDATE Liite SET nimi = ?, tyyppi = ?, sha = ?, data = ? WHERE id = ?', [
      name,
      type,
      sha,
      bytes,
      existing.id,
    ])
    return
  }
  db.run(
    'INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (0, ?, ?, ?, ?, ?)',
    [name, role, type, sha, bytes],
  )
}

export function getTemplate(db: SqliteDb): string {
  return getSettings(db, [TEMPLATE_KEY])[TEMPLATE_KEY] || DEFAULT_TEMPLATE_FI
}

function readOptions(db: SqliteDb): { size: PmaSize; selected: string[] } {
  const raw = getSettings(db, [OPTIONS_KEY])[OPTIONS_KEY] || ''
  const tags = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const size = (['MIKRO', 'PIEN', 'ISO'] as PmaSize[]).find((s) => tags.includes(s)) || 'ISO'
  return { size, selected: tags.filter((t) => !['MIKRO', 'PIEN', 'ISO'].includes(t)) }
}

function writeOptions(db: SqliteDb, size: PmaSize, selected: string[]): void {
  db.run(
    `INSERT INTO Asetus (avain, arvo) VALUES (?, ?)
     ON CONFLICT(avain) DO UPDATE SET arvo = excluded.arvo`,
    [OPTIONS_KEY, [size, ...selected].join(',')],
  )
}

/**
 * PMA size thresholds (kirjanpitolaki 1:4a–4b): a company is micro/small while
 * it stays under at least two of the three limits.
 */
export function pmaSize(balanceCents: number, turnoverCents: number, headcount: number): PmaSize {
  const under = (limits: [number, number, number]) => {
    let n = 0
    if (balanceCents <= limits[0]) n++
    if (turnoverCents <= limits[1]) n++
    if (headcount <= limits[2]) n++
    return n >= 2
  }
  if (under([35_000_000, 70_000_000, 10])) return 'MIKRO'
  if (under([600_000_000, 1_200_000_000, 50])) return 'PIEN'
  return 'ISO'
}

function headcountTableHtml(
  label: string,
  currentRange: string,
  priorRange: string,
  currentCount: number,
  priorCount: number | null,
): string {
  const priorCell =
    priorCount == null
      ? ''
      : `<td align="right">&nbsp;${priorCount}</td>`
  const priorHeader = priorRange
    ? `<th align="right" width="25%">&nbsp;${priorRange}</th>`
    : ''
  return `<table width="100%">
<tr><th width="50%"></th><th align="right" width="25%">${currentRange}</th>${priorHeader}</tr>
<tr><td>${label}</td><td align="right">${currentCount}</td>${priorCell}</tr>
</table>`
}

function reportMarkerKind(marker: string): 'tase' | 'tulos' | null {
  const lower = marker.toLowerCase()
  if (lower.includes('tase')) return 'tase'
  if (lower.includes('tulos')) return 'tulos'
  return null
}

/** Same formula as `#oykaytto` / jakokelpoinen in the Oy tilinpäätös template. */
const JAKOKELPOINEN_MACRO = 'e2251..226 e2371 e206..208'

function readShareCount(db: SqliteDb): number | null {
  const raw = getSettings(db, [SHARE_COUNT_KEY])[SHARE_COUNT_KEY]
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function writeShareCount(db: SqliteDb, count: number | null): void {
  if (count == null || count <= 0) return
  db.run(
    `INSERT INTO Asetus (avain, arvo) VALUES (?, ?)
     ON CONFLICT(avain) DO UPDATE SET arvo = excluded.arvo`,
    [SHARE_COUNT_KEY, String(count)],
  )
}

function formatOsinkoEuros(cents: number, decimals = 2): string {
  return (cents / 100).toLocaleString('fi-FI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Per-share thousandths of euro so perShare × shareCount equals total exactly. */
function exactDividendAmounts(rawTotalCents: number, shareCount: number): {
  totalCents: number
  perShareThousandths: number
} {
  const shares = shareCount > 0 ? shareCount : 1
  const perShareThousandths = Math.round((rawTotalCents * 10) / shares)
  const totalCents = Math.round((perShareThousandths * shares) / 10)
  return { totalCents, perShareThousandths }
}

function applyOsinkoProposal(html: string, distributableEquityCents: number, shareCount: number): string {
  const rawTotal = Math.round(distributableEquityCents * 0.08)
  const { totalCents, perShareThousandths } = exactDividendAmounts(rawTotal, shareCount)
  const perDecimals = perShareThousandths % 10 === 0 ? 2 : 3
  const perShareText = (perShareThousandths / 1000).toLocaleString('fi-FI', {
    minimumFractionDigits: perDecimals,
    maximumFractionDigits: perDecimals,
  })
  return html.replace(
    /XX euroa per osake, eli yhteensä XXX euroa/g,
    `${perShareText} euroa per osake, eli yhteensä ${formatOsinkoEuros(totalCents)} euroa`,
  )
}

function brandNotesHtml(html: string): string {
  return html.replace(/Kitsas-ohjelmistolla/g, 'Tilari-ohjelmistolla')
}

function finalizeNotesHtml(html: string, jakokelpoinenCents: number, shareCount: number): string {
  return processStatementTables(
    brandNotesHtml(applyOsinkoProposal(html, jakokelpoinenCents, shareCount)),
  )
}

const DEFAULT_ISO_REPORT_MARKERS =
  '@tase/yleinen!TASE (TILINPÄÄTÖS)@ @tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@'

function stripPrintDraftNotes(html: string): string {
  return html
    .replace(/<p><em>Poista ennen tulostusta:<\/em>[\s\S]*?<\/ol>\s*/gi, '')
    .replace(/<p><em>Poista ennen tulostusta:<\/em>[^<]*<\/p>\s*/gi, '')
}

function prepareNotesForPrint(
  db: SqliteDb,
  ends: string,
  html: string,
  doc: StatementDoc,
): string {
  const shareCount = doc.share_count ?? readShareCount(db) ?? 1
  const macros = buildMacroContext(db, requireFiscalPeriodByEnd(db, ends).starts, ends)
  const jakokelpoinen = macros.evaluate(JAKOKELPOINEN_MACRO)
  return stripPrintDraftNotes(finalizeNotesHtml(html, jakokelpoinen, shareCount))
}

function renderReportBlock(db: SqliteDb, marker: string, ends: string): string {
  if (marker.includes('!')) return renderReportMarkerHtml(db, marker, ends)
  const kind = reportMarkerKind(marker)
  if (kind === 'tase') return renderReportMarkerHtml(db, '@tase/yleinen!Tase@', ends)
  if (kind === 'tulos') return renderReportMarkerHtml(db, '@tulos/yleinen!Tuloslaskelma@', ends)
  return ''
}

function taxTableHtml(tax: TaxCalculation | null): string {
  if (!tax) return '<p>Tuloveroa ei ole laskettu.</p>'
  const row = (label: string, cents: number) =>
    `  <tr><td>${label}</td><td class="amt">${formatFiCents(cents)}&nbsp;€</td></tr>`
  return `<table class="tp-tax">
${row('Veronalainen tulo yhteensä', tax.tulo_cents)}
${row('Kokonaan vähennyskelpoiset kulut', tax.taysivahennys_cents)}
${row('Puoleksi vähennyskelpoiset kulut', tax.puolivahennys_cents)}
${row('Verotettava tulos', tax.tulos_cents)}
${row('Vähennettävä aiempi tappio', tax.tappio_cents)}
${row('Lopullinen verotettava tulos', tax.loppu_tulos_cents)}
${row('Tuloveron määrä', tax.vero_cents)}
${row('Maksetut ennakkoverot', tax.ennakko_cents)}
${row('Maksamaton tulovero', tax.jaaveroa_cents)}
</table>`
}

type ReportGroup = { heading: string | null; match: (account: number) => boolean }

function reportTableHtml(
  db: SqliteDb,
  date: string,
  groups: ReportGroup[],
  title: string,
): string {
  const balances = computeBalances(db, date).balances
  const accounts = getAccounts(db)
  const blocks: string[] = []

  for (const group of groups) {
    const rows: string[] = []
    let total = 0
    for (const acc of accounts) {
      const value = balances[String(acc.number)]
      if (!value || !group.match(acc.number)) continue
      total += value
      rows.push(
        `  <tr><td>${acc.number}</td><td>${escapeHtml(acc.name)}</td><td class="amt">${formatFiCents(value)}&nbsp;€</td></tr>`,
      )
    }
    if (!rows.length) continue
    const heading = group.heading
      ? `  <tr><th colspan="3">${escapeHtml(group.heading)}</th></tr>\n`
      : ''
    blocks.push(
      `${heading}${rows.join('\n')}\n  <tr class="sum"><td colspan="2">Yhteensä</td><td class="amt">${formatFiCents(total)}&nbsp;€</td></tr>`,
    )
  }
  if (!blocks.length) return ''
  return `<h2>${title}</h2>
<table class="tp-report">
${blocks.join('\n')}
</table>`
}

const BALANCE_SHEET_GROUPS: ReportGroup[] = [
  { heading: 'Vastaavaa', match: (n) => String(n).startsWith('1') },
  { heading: 'Vastattavaa', match: (n) => String(n) >= '2' && String(n) < '3' },
]

const INCOME_STATEMENT_GROUPS: ReportGroup[] = [{ heading: null, match: (n) => String(n) >= '3' }]

/** Build the notes HTML body from the template and the book's figures. */
export function generateStatementHtml(
  db: SqliteDb,
  ends: string,
  opts: {
    size: PmaSize
    selected: string[]
    headcount: number | null
    share_count?: number | null
    today?: string
  },
): string {
  return generateStatementDocument(db, ends, opts).html
}

function generateStatementDocument(
  db: SqliteDb,
  ends: string,
  opts: {
    size: PmaSize
    selected: string[]
    headcount: number | null
    share_count?: number | null
    today?: string
  },
): { html: string; reportLine: string } {
  const period = requireFiscalPeriodByEnd(db, ends)
  const company = getSettings(db, ['Nimi', 'Ytunnus', 'Kaupunki', 'Muoto', 'Kotipaikka'])
  const tax = period.json.verolaskelma ?? null
  const balances = computeBalances(db, ends).balances
  const profit = Object.entries(balances)
    .filter(([num]) => num >= '3')
    .reduce((s, [, v]) => s + v, 0)

  const previous = db.get<{ alkaa: string; loppuu: string }>(
    'SELECT alkaa, loppuu FROM Tilikausi WHERE loppuu < ? ORDER BY loppuu DESC LIMIT 1',
    [period.starts],
  )
  const priorPeriod = previous ? getFiscalPeriodByEnd(db, previous.loppuu) : undefined
  const macros = buildMacroContext(db, period.starts, ends)

  const report = (kind: 'tase' | 'tulos') =>
    kind === 'tase'
      ? reportTableHtml(db, ends, BALANCE_SHEET_GROUPS, 'Tase')
      : reportTableHtml(db, ends, INCOME_STATEMENT_GROUPS, 'Tuloslaskelma')

  const ctx = {
    size: opts.size,
    selected: new Set(opts.selected),
    headcount: opts.headcount,
    macros,
    muoto: (company.Muoto || 'oy').toLowerCase(),
    scalars: buildStatementScalars(
      db,
      period.starts,
      ends,
      {
        nimi: company.Nimi || '',
        ytunnus: company.Ytunnus || '',
        kaupunki: company.Kaupunki || '',
        kotipaikka: company.Kotipaikka || company.Kaupunki || '',
        tulos: `${formatFiCents(profit)}\u00a0€`,
        'kayttaja.nimi': '',
      },
      opts.today ?? wallToday(),
    ),
    marker: (name: string, suffix?: string) => {
      switch (name) {
        case 'tase':
          return report('tase')
        case 'tulos':
          return report('tulos')
        case 'verolaskelma':
          return taxTableHtml(tax)
        case 'henkilosto': {
          if (opts.headcount == null) return ''
          const scalars = buildStatementScalars(
            db,
            period.starts,
            ends,
            {},
            opts.today ?? wallToday(),
          )
          return headcountTableHtml(
            suffix?.trim() || 'Henkilöstöä keskimäärin',
            scalars.kausi,
            scalars.edkausi,
            opts.headcount,
            priorPeriod?.json.henkilosto ?? null,
          )
        }
        default:
          return ''
      }
    },
  }

  const generated = generateNotes(getTemplate(db), ctx)
  const jakokelpoinen = macros.evaluate(JAKOKELPOINEN_MACRO)
  const shareCount = opts.share_count ?? readShareCount(db) ?? 1
  return {
    html: finalizeNotesHtml(generated.html, jakokelpoinen, shareCount),
    reportLine: generated.reportLine,
  }
}

/** Current notes state for the editor. */
export function getStatement(db: SqliteDb, ends: string): StatementDoc {
  const period = requireFiscalPeriodByEnd(db, ends)
  const stored = readAttachmentText(db, TEXT_ROLE(ends))
  const options = readOptions(db)
  const html = stored?.html ?? ''
  return {
    ends,
    starts: period.starts,
    html,
    size: options.size,
    selected: options.selected,
    headcount: period.json.henkilosto ?? null,
    share_count: readShareCount(db),
    sections: parseSections(getTemplate(db)),
    drafted_at: period.json.tilinpaatos ?? null,
    confirmed_at: period.json.vahvistettu ?? null,
    has_pdf: Boolean(
      db.get<{ id: number }>('SELECT id FROM Liite WHERE tosite = 0 AND roolinimi = ?', [
        PDF_ROLE(ends),
      ]),
    ),
  }
}

/** Generate a fresh notes draft and persist the wizard choices. */
export function startStatement(
  db: SqliteDb,
  ends: string,
  opts: {
    size: PmaSize
    selected: string[]
    headcount: number | null
    share_count?: number | null
    today?: string
  },
): StatementDoc {
  const period = requireFiscalPeriodByEnd(db, ends)
  writeOptions(db, opts.size, opts.selected)
  if (opts.share_count != null && opts.share_count > 0) writeShareCount(db, opts.share_count)
  updateFiscalPeriodJson(db, period.starts, { henkilosto: opts.headcount ?? undefined })
  const generated = generateStatementDocument(db, ends, opts)
  return saveStatement(db, ends, generated.html, generated.reportLine)
}

export function saveStatement(
  db: SqliteDb,
  ends: string,
  html: string,
  reportLine?: string,
): StatementDoc {
  const period = requireFiscalPeriodByEnd(db, ends)
  const existing = readAttachmentText(db, TEXT_ROLE(ends))
  const markers = reportLine ?? existing?.markers ?? ''
  const text = markers ? `${markers}\n${html}` : `\n${html}`
  const bytes = new TextEncoder().encode(text)
  writeAttachment(db, TEXT_ROLE(ends), `tilinpaatos-${ends}.html`, 'text/html', bytes)
  db.run(
    `INSERT INTO Asetus (avain, arvo) VALUES (?, ?)
     ON CONFLICT(avain) DO UPDATE SET arvo = excluded.arvo`,
    [`tilinpaatos/${ends}`, text], // Kitsas backup key
  )
  updateFiscalPeriodJson(db, period.starts, { tilinpaatos: new Date().toISOString() })
  return getStatement(db, ends)
}

/** Store a PDF the user produced elsewhere (Kitsas desktop expects `TP_`). */
export function uploadStatementPdf(db: SqliteDb, ends: string, data: Uint8Array): void {
  requireFiscalPeriodByEnd(db, ends)
  writeAttachment(db, PDF_ROLE(ends), `tilinpaatos-${ends}.pdf`, 'application/pdf', data)
}

/** Mark the statement confirmed (Kitsas `Tilikausi.json.vahvistettu`). */
export function confirmStatement(db: SqliteDb, ends: string, date?: string): string {
  const period = requireFiscalPeriodByEnd(db, ends)
  const doc = getStatement(db, ends)
  if (!doc.drafted_at && !doc.has_pdf) {
    throw new PostingError('Laadi tilinpäätös ennen vahvistamista', 409)
  }
  if (!isFiscalPeriodLocked(db, ends)) {
    throw new PostingError('Lukitse kirjanpito ennen tilinpäätöksen vahvistamista', 409)
  }
  const confirmed = date || wallToday()
  updateFiscalPeriodJson(db, period.starts, { vahvistettu: confirmed })
  return confirmed
}

/** Remove tilinpäätös confirmation so the period can be edited again. */
export function unconfirmStatement(db: SqliteDb, ends: string): void {
  const period = requireFiscalPeriodByEnd(db, ends)
  updateFiscalPeriodJson(db, period.starts, { vahvistettu: undefined })
}

const PRINT_CSS = `
  @page { size: A4; margin: 25mm 10mm 10mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.45; margin: 0; }
  .tp-cover { text-align: center; padding: 6rem 0 4rem; page-break-after: always; }
  .tp-cover h1 { font-size: 2rem; letter-spacing: 0.08em; margin: 0 0 1rem; }
  .tp-cover .company { font-size: 1.4rem; font-weight: 600; }
  .tp-cover .period { margin-top: 0.75rem; font-size: 1.1rem; }
  .tp-cover .meta { margin-top: 3rem; font-size: 0.95rem; color: #444; }
  .tp-practice { color: #1f6b54; font-weight: 700; letter-spacing: 0.08em; margin-top: 1.25rem; }
  .tp-practice-note { color: #456; font-size: 0.9rem; margin-top: 2rem; }
  h2 { font-size: 1.15rem; margin: 1.75rem 0 0.5rem; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; page-break-inside: avoid; }
  td, th { padding: 0.25rem 0.4rem; text-align: left; vertical-align: top; }
  .tp-report td:first-child { width: 4.5rem; }
  td.amt, th.amt, .tp-report td:last-child, .tp-tax td:last-child {
    text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .tp-report tr.sum td { border-top: 1px solid #444; border-bottom: 3px double #444; font-weight: 600; }
  .tp-chart td.hdr, .tp-chart td.sum { font-weight: 600; }
  .tp-chart .amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tp-tax td { border-bottom: 1px solid #ddd; }
  @media screen { body { max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; } }
`

/**
 * Full print document: cover page plus notes. Opened in a new tab where
 * the browser's own Print dialog produces the PDF.
 */
export function buildStatementPrintHtml(db: SqliteDb, ends: string): string {
  const period = requireFiscalPeriodByEnd(db, ends)
  const doc = getStatement(db, ends)
  const company = getSettings(db, ['Nimi', 'Ytunnus', 'Kaupunki', 'Harjoitus'])
  const practice = isPracticeValue(company.Harjoitus)
  const stored = readAttachmentText(db, TEXT_ROLE(ends))
  const liiteBody = prepareNotesForPrint(
    db,
    ends,
    doc.html ||
      generateStatementHtml(db, ends, {
        size: doc.size,
        selected: doc.selected,
        headcount: doc.headcount,
        share_count: doc.share_count,
      }),
    doc,
  )

  const markerLine = stored?.markers?.trim() || DEFAULT_ISO_REPORT_MARKERS
  const reportBlocks: string[] = []
  for (const token of parseReportMarkerLine(markerLine)) {
    const block = renderReportBlock(db, token, ends)
    if (block) reportBlocks.push(block)
  }

  const body = [...reportBlocks, liiteBody].filter(Boolean).join('\n')

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8"/>
<title>Tilinpäätös ${escapeHtml(company.Nimi || '')} ${formatFi(ends)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<section class="tp-cover">
  <div class="company">${escapeHtml(company.Nimi || '')}</div>
  ${company.Ytunnus ? `<div>Y-tunnus ${escapeHtml(company.Ytunnus)}</div>` : ''}
  <h1>TILINPÄÄTÖS</h1>
  <div class="period">${formatFi(period.starts)} – ${formatFi(ends)}</div>
  <div class="meta">
    ${company.Kaupunki ? `${escapeHtml(company.Kaupunki)}<br/>` : ''}
    ${doc.confirmed_at ? `Vahvistettu ${formatFi(doc.confirmed_at)}` : 'Luonnos'}
    ${practice ? '<div class="tp-practice">HARJOITUS</div>' : ''}
  </div>
</section>
<main>
${body}
${practice ? '<p class="tp-practice-note">Kirjanpito on laadittu harjoittelutilassa.</p>' : ''}
</main>
</body>
</html>`
}
