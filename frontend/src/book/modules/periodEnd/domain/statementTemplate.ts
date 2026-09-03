/**
 * Notes-to-the-accounts template DSL. A trimmed port of Kitsas
 * `TilinpaatosGeneraattori`: `#tag` sections with PMA size filters, `{{macro}}`
 * account substitutions and `@marker@` blocks.
 *
 * The template text lives in `Asetus.tppohja/fi` so books stay editable in
 * desktop Kitsas; `DEFAULT_TEMPLATE_FI` seeds it on first use.
 */

import { applyCaretSums, type MacroContext } from './statementMacros'

export type PmaSize = 'MIKRO' | 'PIEN' | 'ISO'

export type TemplateSection = {
  tag: string
  title: string
  /** Sizes this section is hidden for (Kitsas `-M`, `-P`, `-I` switches). */
  excludes: PmaSize[]
  optional: boolean
}

/** Default Oy template (fi). Mirrors the structure Kitsas ships for `yritys`. */
export const DEFAULT_TEMPLATE_FI = `## Raportit
#MIKRO
@tase/yleinen!TASE (TILINPÄÄTÖS)@
#PIEN
@tase/yleinen!TASE (TILINPÄÄTÖS)@
#ISO
@tase/yleinen!TASE (TILINPÄÄTÖS)@
##Tuloslaskelma
#mikrobrutto -I -P Mikroyrityksen lyhyt bruttotuloslaskelma
@tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@
#pienbrutto -I -M Pienyrityksen bruttotuloslaskelma
@tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@
#-mikrobrutto -pienbrutto
@tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@
<h2>Tilinpäätöksen liitetiedot</h2>
#MIKRO
<p>Tilinpäätöksen laatimisessa on noudatettu pien- ja mikroyrityksen tilinpäätöksessä esitettävistä tiedoista annetun asetuksen (PMA) mikroyrityssäännöstöä.</p>
#PIEN
<p>Tilinpäätöksen laatimisessa on noudatettu pien- ja mikroyrityksen tilinpäätöksessä esitettävistä tiedoista annetun asetuksen (PMA) pienyrityssäännöstöä.</p>
#ISO
<p>Yrityksestä on annettava täydet liitetiedot ja laadittava toimintakertomus.</p>
<p><em>Poista ennen tulostusta:</em> Liitetiedot sisältävät ainakin</p>
<ol><li>tilinpäätöksen esittämistapaa koskevat tiedot</li>
<li>tilinpäätöksen laatimisperusteet</li>
<li>tuloslaskelmaa koskevat liitetiedot</li>
<li>tasetta koskevat liitetiedot</li>
<li>liitetiedot käypään arvoon merkitsemisestä</li>
<li>tuloveroja koskevat tiedot</li>
<li>vakuudet, vastuusitoumukset ja taseen ulkopuoliset järjestelyt</li>
<li>tiedot tilintarkastajien palkkioista</li>
<li>lähipiiriliiketoimet</li>
<li>tiedot henkilöstöstä ja toimielinten jäsenistä</li>
<li>omistukset muissa yrityksissä</li>
<li>konserniin kuuluvaa kirjanpitovelvollista koskevat tiedot</li></ol>
<p><em>Poista ennen tulostusta:</em> Lisäksi liitetietona on annettava tiedot sidotuista rahastoista.</p>
## Liitetiedot
#laatimisperuste Tilinpäätöksessä käytetään valinnaisia laatimisperusteita
<h2>Tilinpäätöksen laatimisperiaatteet</h2>
<p>Pysyvien vastaavien hankintameno poistetaan suunnitelman mukaisin poistoin.</p>
#jalkeen Olennaiset tapahtumat tilikauden jälkeen
<h2>Olennaiset tapahtumat tilikauden jälkeen</h2>
<p>Tilikauden päättymisen jälkeen ei ole ollut olennaisia tapahtumia.</p>
#poik -ISO Poikkeukselliset erät
<h2>Poikkeukselliset erät</h2>
<p>Tähän tieto poikkeuksellisten tuottojen ja kulujen määrästä, jos erät ovat olennaisia.</p>
#tulovero Tuloverot
<h2>Tuloverot</h2>
@verolaskelma@
#pitkalaina Yli viiden vuoden kuluttua erääntyvät lainat
<h2>Pitkäaikaiset lainat</h2>
<p>Yli viiden vuoden kuluttua erääntyvät pitkäaikaiset velat yhteensä XXX euroa.</p>
#vastuut Esineoikeudelliset vakuudet
<h2>Annetut esineoikeudelliset vakuudet</h2>
<p>Yrityskiinnitykset ja muut annetut vakuudet yhteensä XXX euroa.</p>
#sitoumukset Taseen ulkopuoliset sitoumukset
<h2>Taseen ulkopuoliset sitoumukset</h2>
<p>Taseen ulkopuolisten sitoumusten yhteismäärä on XXX euroa.</p>
#intressi -MIKRO Liiketoimet intressitahojen kanssa
<h2>Liiketoimet intressitahojen kanssa</h2>
<p>Kuvaus liiketoimesta, liiketoimen arvo ja intressisuhteen luonne.</p>
#HENKILOSTO
<h2>Henkilöstön määrä</h2>
@henkilosto@Henkilöstöä keskimäärin
#oypaaoma Oman pääoman muutokset
<h2>Oman pääoman muutokset</h2>
<table width="100%">
  <tr><th width="50%"></th><th align="right" width="25%">{{kausi.loppupvm}}</th><th align="right" width="25%">{{edkausi.loppupvm}}</th></tr>
  <tr><td>Osakepääoma {{alkupvm}}</td><td align="right">{{s200}}</td><td align="right">{{S200}}</td></tr>
  <tr><td>Osakepääoman korotus</td><td align="right">{{d200}}</td><td align="right">{{D200}}</td></tr>
  <tr><td>Osakepääoma {{loppupvm}}</td><td align="right">{{e200}}</td><td align="right">{{E200}}</td></tr>
  <tr><td> </td><td> </td><td> </td></tr>
  <tr><td>Edellisten tilikausien voitto (tappio) {{alkupvm}}</td><td align="right">{{s2251..226}}</td><td align="right">{{S2251..226}}</td></tr>
  <tr><td>Osingonjako</td><td align="right">{{d2261}}</td><td align="right">{{D2261}}</td></tr>
  <tr><td>Edellisten tilikausien voitto (tappio) {{loppupvm}}</td><td align="right">{{e2251..226}}</td><td align="right">{{E2251..226}}</td></tr>
  <tr><td> </td><td> </td><td> </td></tr>
  <tr><td>Tilikauden voitto (tappio)</td><td align="right">{{e2371}}</td><td align="right">{{E2371}}</td></tr>
  <tr><td> </td><td> </td><td> </td></tr>
  <tr><td><b>Vapaa oma pääoma yhteensä</b></td><td align="right"><b>{{e206..238}}</b></td><td align="right"><b>{{E206..238}}</b></td></tr>
  <tr><td> </td><td> </td><td> </td></tr>
  <tr><td><b>OMA PÄÄOMA YHTEENSÄ</b></td><td align="right"><b>{{e20..238}}</b></td><td align="right"><b>{{E20..238}}</b></td></tr>
</table>
#jakokelpoinen Laskelma jakokelpoisesta omasta pääomasta
<h2>Laskelma jakokelpoisesta omasta pääomasta</h2>
<table width="100%">
  <tr><th width="50%"></th><th align="right" width="25%">{{kausi.loppupvm}}</th><th align="right" width="25%">{{edkausi.loppupvm}}</th></tr>
  <tr><td>Voitto edellisiltä tilikausilta</td><td align="right">{{e2251..226}}</td><td align="right">{{E2251..226}}</td></tr>
  <tr><td>Tilikauden voitto</td><td align="right">{{e2371}}</td><td align="right">{{E2371}}</td></tr>
  <tr><td><b>Yhteensä</b></td><td align="right"><b>^^^^</b></td><td align="right"><b>^^^^</b></td></tr>
</table>
#oykaytto Hallituksen ehdotus vapaan oman pääoman käytöstä
<h2>Hallituksen ehdotus jakokelpoisen vapaan oman pääoman käytöstä</h2>
<p>Jakokelpoinen vapaa oma pääoma on {{e2251..226 e2371 e206..208}}</p>
<p>Hallitus ehdottaa, että osinkoa jaetaan XX euroa per osake, eli yhteensä XXX euroa. Osinko on nostettavissa yhtiökokousta seuraavana päivänä.</p>
#allekirjoitus Tilinpäätöksen allekirjoitus
<h2>Tilinpäätöksen allekirjoitus</h2>
<p>{{kaupunki}} {{loppupvm}}</p>
<p>&nbsp;</p>
<p>_______________________________</p>
##Kirjanpito
#sahko Sähköinen kirjanpito ja arkistointi
<h2>Kirjanpitoaineisto</h2>
<p>Kirjanpito on järjestetty Tilari-ohjelmistolla. Tilinpäätös, tase-erittelyt, tilikartta, pää- ja päiväkirjat sekä tositteet on arkistoitu sähköiseksi arkistoksi.</p>
#-sahko
<h2>Kirjanpitoaineisto</h2>
<p>Selvitys kirjanpitoaineistosta ja sen säilyttämisestä</p>
`

const SIZE_SWITCH: Record<string, PmaSize> = { '-M': 'MIKRO', '-P': 'PIEN', '-I': 'ISO' }
const REPORT_TAGS = new Set(['mikrobrutto', 'pienbrutto', 'yleinen'])
/** Template-only tags — not shown in the notes wizard. */
const WIZARD_HIDDEN_TAGS = new Set([
  ...REPORT_TAGS,
  'ISO',
  'MIKRO',
  'PIEN',
  'HENKILOSTO',
  'mikrobrutto',
  'pienbrutto',
])

function stripInternalTitleParts(parts: string[]): string {
  return parts
    .filter((p) => !(p.startsWith('-') && /^-[-\w]+$/.test(p)))
    .join(' ')
}

const REPORT_MARKER = /^@(.+?)(:\w*)?!(.+?)@$/
const SIMPLE_MARKER = /^@([a-zA-ZäöåÄÖÅ]+)@(.*)$/

const SECTION_TITLES: Record<string, string> = {
  oykaytto: 'Hallituksen ehdotus vapaan oman pääoman käytöstä',
  oyeiosinko: 'Ei osinkoa',
}

/** Sections the user can tick in the wizard (skips the size/always-on tags). */
export function parseSections(template: string): TemplateSection[] {
  const sections: TemplateSection[] = []
  for (const raw of template.split('\n')) {
    if (!raw.startsWith('#') || raw.startsWith('##')) continue
    const parts = raw.slice(1).trim().split(/\s+/)
    const tag = parts.shift() || ''
    if (!tag || tag.startsWith('-') || tag === tag.toUpperCase()) continue
    if (WIZARD_HIDDEN_TAGS.has(tag)) continue
    const excludes: PmaSize[] = []
    while (parts.length && SIZE_SWITCH[parts[0]]) excludes.push(SIZE_SWITCH[parts.shift() as string])
    const title = SECTION_TITLES[tag] || stripInternalTitleParts(parts)
    if (!title.trim()) continue
    sections.push({ tag, title, excludes, optional: true })
  }
  return sections
}

export type GeneratorContext = {
  size: PmaSize
  /** Optional `#tag` sections the user selected. */
  selected: Set<string>
  headcount: number | null
  macros: MacroContext
  scalars: Record<string, string>
  /** Company legal form for `?muoto=oy` conditionals (`oy`, `tmi`, …). */
  muoto?: string
  /** Expands `@tase@`, `@tulos@`, `@verolaskelma@`, `@henkilosto@`. */
  marker: (name: string, suffix?: string) => string
}

function parseTagLine(line: string): { tag: string; excludes: PmaSize[]; negated: boolean } {
  const parts = line.slice(1).trim().split(/\s+/)
  let tag = parts.shift() || ''
  let negated = false
  if (tag.startsWith('-')) {
    negated = true
    tag = tag.slice(1)
  }
  const excludes: PmaSize[] = []
  while (parts.length && SIZE_SWITCH[parts[0]]) excludes.push(SIZE_SWITCH[parts.shift() as string])
  return { tag, excludes, negated }
}

function sectionActive(line: string, ctx: GeneratorContext): boolean {
  const { tag, excludes, negated } = parseTagLine(line)
  if (tag === 'MIKRO' || tag === 'PIEN' || tag === 'ISO') return ctx.size === tag
  if (tag === 'HENKILOSTO') return ctx.headcount != null
  if (excludes.includes(ctx.size)) return false

  if (negated) {
    if (!tag) {
      const blocked = line
        .slice(1)
        .trim()
        .split(/\s+/)
        .filter((p) => p.startsWith('-'))
        .map((p) => p.slice(1))
      if (blocked.includes('mikrobrutto') && ctx.size === 'MIKRO') return false
      if (blocked.includes('pienbrutto') && ctx.size === 'PIEN') return false
      return ctx.size === 'ISO'
    }
    return !ctx.selected.has(tag)
  }

  if (REPORT_TAGS.has(tag)) {
    if (tag === 'mikrobrutto') return ctx.size === 'MIKRO'
    if (tag === 'pienbrutto') return ctx.size === 'PIEN'
    return ctx.size === 'ISO'
  }

  if (!tag) return true
  return ctx.selected.has(tag)
}

function settingCondition(line: string, ctx: GeneratorContext): boolean {
  const match = line.slice(1).match(/^(\w+)=(.+)$/)
  if (!match) return true
  return (ctx.muoto || '').toLowerCase() === match[2].toLowerCase()
}

function isAccountMacro(key: string): boolean {
  return /^-?[edsEDS]\d/.test(key.replace(/\s+/g, ''))
}

function expandMacros(line: string, ctx: GeneratorContext): string {
  return line.replace(/\{\{([^}]+)\}\}/g, (_all, key: string) => {
    const macro = key.trim()
    if (macro === 'tulos') return ctx.scalars.tulos ?? ctx.macros.format('e2371')
    if (macro in ctx.scalars) return ctx.scalars[macro] ?? ''
    if (isAccountMacro(macro)) return ctx.macros.format(macro)
    return ''
  })
}

export type NotesResult = {
  /** HTML body (without the leading report-marker line). */
  html: string
  /** Kitsas line 1: `@tase/...!...@ @tulos/...!...@` markers for print. */
  reportLine: string
}

/** Render the template into notes HTML plus optional report markers. */
export function generateNotes(template: string, ctx: GeneratorContext): NotesResult {
  const out: string[] = []
  const reportMarkers: string[] = []
  let active = true
  let settingOk = true
  let atCondition = true
  let atBuffer: string[] = []
  let inAtBlock = false

  const flushAtBlock = () => {
    if (atCondition && atBuffer.length) out.push(...atBuffer)
    atBuffer = []
    inAtBlock = false
    atCondition = true
  }

  for (const raw of template.split('\n')) {
    const line = raw.trimEnd()

    if (line.startsWith('##')) {
      active = true
      settingOk = true
      flushAtBlock()
      continue
    }

    if (line.startsWith('#')) {
      flushAtBlock()
      active = sectionActive(line, ctx)
      continue
    }

    if (line.startsWith('?')) {
      settingOk = settingCondition(line, ctx)
      continue
    }

    if (line.startsWith('@?')) {
      if (inAtBlock) {
        flushAtBlock()
      } else {
        inAtBlock = true
        atCondition = ctx.macros.anyNonZero(line.slice(2).trim())
        atBuffer = []
      }
      continue
    }

    if (!active || !settingOk) continue

    if (inAtBlock) {
      if (!line.trim()) continue
      atBuffer.push(expandMacros(line, ctx))
      continue
    }

    if (!line.trim()) continue

    const report = line.match(REPORT_MARKER)
    if (report) {
      reportMarkers.push(line.trim())
      continue
    }

    const marker = line.match(SIMPLE_MARKER)
    if (marker) {
      const expanded = ctx.marker(marker[1], marker[2] || undefined)
      if (expanded) out.push(expanded)
      continue
    }

    out.push(expandMacros(line, ctx))
  }

  flushAtBlock()
  return {
    html: applyCaretSums(out.join('\n')),
    reportLine: reportMarkers.join(' '),
  }
}

/** @deprecated Use `generateNotes` — kept for callers that only need HTML. */
export function generateNotesHtml(template: string, ctx: GeneratorContext): string {
  return generateNotes(template, ctx).html
}
