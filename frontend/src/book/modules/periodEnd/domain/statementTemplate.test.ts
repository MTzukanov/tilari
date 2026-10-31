import { describe, expect, it } from 'vitest'
import { extractAttachmentsFromDb } from '../../../attachments'
import { AttachmentStore } from '../../../blobStore'
import { renderReportMarkerHtml, parseReportMarkerLine } from '../../../chartReport'
import {
  buildStatementPrintHtml,
  generateStatementHtml,
  getStatement,
  saveStatement,
  startStatement,
} from './statement'
import { buildStatementScalars } from './statementMacros'
import { buildMacroContext } from './statementMacros'
import { parseSections, generateNotes, type GeneratorContext } from './statementTemplate'
import { loadGoldenDb } from '../../../golden'
import yritysChart from '../../../newBook/vendor/yritys.json'
import type { SqliteDb } from '../../../sqlite'

async function withGolden(fn: (db: SqliteDb) => void | Promise<void>) {
  const db = await loadGoldenDb()
  try {
    await fn(db)
  } finally {
    db.close()
  }
}

describe('statement notes', () => {
  it('uses the supplied today for {{pvm}}', async () => {
    await withGolden((db) => {
      const scalars = buildStatementScalars(db, '2024-01-01', '2024-12-31', {}, '2024-03-15')
      expect(scalars.pvm).toBe('15.3.2024')
    })
  })

  it('parses report markers with spaces in titles', () => {
    expect(
      parseReportMarkerLine(
        '@tase/yleinen!TASE (TILINPÄÄTÖS)@ @tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@',
      ),
    ).toEqual([
      '@tase/yleinen!TASE (TILINPÄÄTÖS)@',
      '@tulos/yleinen!TULOSLASKELMA (TILINPÄÄTÖS)@',
    ])
  })

  it('includes period dates and prior-year columns', async () => {
    await withGolden((db) => {
      const html = generateStatementHtml(db, '2025-12-31', {
        size: 'ISO',
        selected: ['oypaaoma', 'jakokelpoinen', 'oykaytto', 'HENKILOSTO'],
        headcount: 1,
        share_count: 1000,
      })
      expect(html).toContain('31.12.2025')
      expect(html).toContain('31.12.2024')
      expect(html).toContain('1.1.2025 - 31.12.2025')
      expect(html).not.toContain('@?')
      expect(html).not.toContain('{{')
      expect(html).not.toContain('XX euroa per osake')
      expect(html).toContain('Poista ennen tulostusta')
      expect(html).toContain('Liitetiedot sisältävät ainakin')
      const jakokelpoinen = buildMacroContext(db, '2025-01-01', '2025-12-31').evaluate(
        'e2251..226 e2371 e206..208',
      )
      const rawTotal = Math.round(jakokelpoinen * 0.08)
      const perShareThousandths = Math.round((rawTotal * 10) / 1000)
      const totalCents = Math.round((perShareThousandths * 1000) / 10)
      const totalEuros = (totalCents / 100).toLocaleString('fi-FI', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const perDecimals = perShareThousandths % 10 === 0 ? 2 : 3
      const perShareEuros = (perShareThousandths / 1000).toLocaleString('fi-FI', {
        minimumFractionDigits: perDecimals,
        maximumFractionDigits: perDecimals,
      })
      expect(html).toContain(`${perShareEuros} euroa per osake, eli yhteensä ${totalEuros} euroa`)
      expect(perShareEuros).not.toBe(totalEuros)
      expect(totalCents * 10).toBe(perShareThousandths * 1000)
    })
  })

  it('cleans internal section titles for the wizard', () => {
    const sections = parseSections(`#oykaytto -oyeiosinko Hallituksen ehdotus vapaan oman pääoman käytöstä
#oyeiosinko -oykaytto Ei osinkoa
#kaypa -MIKRO Käypään arvoon merkitseminen`, () => '')
    expect(sections.find((s) => s.tag === 'oykaytto')?.title).toBe(
      'Hallituksen ehdotus vapaan oman pääoman käytöstä',
    )
    expect(sections.find((s) => s.tag === 'oyeiosinko')?.title).toBe('Ei osinkoa')
    expect(sections.find((s) => s.tag === 'kaypa')?.title).toBe('Käypään arvoon merkitseminen')
  })

  it('leaves unknown scalars empty instead of formatting as euros', () => {
    const ctx: GeneratorContext = {
      size: 'ISO',
      selected: new Set(['laatija']),
      headcount: null,
      macros: {
        evaluate: () => 0,
        format: () => '0,00\u00a0€',
        anyNonZero: () => false,
      },
      scalars: { pvm: '28.8.2026', 'kayttaja.nimi': '' },
      setting: () => '',
      marker: () => '',
    }
    const html = generateNotes(
      `#laatija Laatija
<p>Tilinpäätöksen laati {{pvm}} {{kayttaja.nimi}}</p>`,
      ctx,
    ).html
    expect(html).toContain('Tilinpäätöksen laati 28.8.2026')
    expect(html).not.toContain('0,00')
  })

  it('renders chart reports for print markers', async () => {
    await withGolden((db) => {
      const html = renderReportMarkerHtml(
        db,
        '@tase/yleinen!TASE (TILINPÄÄTÖS)@',
        '2025-12-31',
      )
      expect(html).toContain('TASE (TILINPÄÄTÖS)')
      expect(html).toContain('31.12.2025')
      expect(html).toContain('31.12.2024')
      expect(html).toContain('VASTAAVAA')
    })
  })

  it('builds print document with tase, tulos and cleaned tables', async () => {
    await withGolden((db) => {
      startStatement(db, '2025-12-31', {
        size: 'ISO',
        selected: ['oypaaoma', 'jakokelpoinen', 'oykaytto', 'HENKILOSTO'],
        headcount: 1,
        share_count: 1000,
      })
      const print = buildStatementPrintHtml(db, '2025-12-31')
      expect(print).toContain('TASE (TILINPÄÄTÖS)')
      expect(print).toContain('TULOSLASKELMA (TILINPÄÄTÖS)')
      expect(print).toContain('TILINPÄÄTÖS')
      expect(print).toContain('HARJOITUS')
      expect(print).toContain('harjoittelutilassa')
      expect(print).not.toContain('Poista ennen tulostusta')
      expect(print).not.toContain('Ylikurssirahasto')
    })
  })
})

describe('statement on a lean book (Liite.data moved to the attachment store)', () => {
  const ENDS = '2025-12-31'
  const OPTS = { size: 'ISO', selected: [], headcount: 1, share_count: 1000 } as const

  function storedText(db: SqliteDb): string {
    const row = db.get<{ data: Uint8Array | null }>(
      'SELECT data FROM Liite WHERE tosite = 0 AND roolinimi = ?',
      [`TPTEKSTI_${ENDS}`],
    )
    return new TextDecoder().decode(row?.data ?? new Uint8Array())
  }

  it('reads back the saved notes', async () => {
    await withGolden(async (db) => {
      startStatement(db, ENDS, OPTS)
      saveStatement(db, ENDS, '<p>Muokattu teksti</p>')
      await extractAttachmentsFromDb(db, new AttachmentStore())
      expect(storedText(db)).toBe('')
      expect(getStatement(db, ENDS).html).toBe('<p>Muokattu teksti</p>')
    })
  })

  it('prints the saved notes, not a regenerated text', async () => {
    await withGolden(async (db) => {
      startStatement(db, ENDS, OPTS)
      saveStatement(db, ENDS, '<p>Muokattu teksti</p>')
      await extractAttachmentsFromDb(db, new AttachmentStore())
      const print = buildStatementPrintHtml(db, ENDS)
      expect(print).toContain('Muokattu teksti')
      expect(print).not.toContain('Liitetiedot sisältävät ainakin')
    })
  })

  it('keeps the report line when the notes are saved again', async () => {
    await withGolden(async (db) => {
      startStatement(db, ENDS, OPTS)
      const reportLine = storedText(db).split('\n')[0]
      expect(reportLine).toContain('@tase/')
      await extractAttachmentsFromDb(db, new AttachmentStore())
      saveStatement(db, ENDS, '<p>Toinen versio</p>')
      expect(storedText(db)).toBe(`${reportLine}\n<p>Toinen versio</p>`)
    })
  })

  it('has no text without the attachment row, like Kitsas', async () => {
    await withGolden((db) => {
      db.run("INSERT INTO Asetus (avain, arvo) VALUES (?, '@tase@\n<p>Vanha teksti</p>')", [
        `tilinpaatos/${ENDS}`,
      ])
      expect(getStatement(db, ENDS).html).toBe('')
    })
  })
})

describe('statement settings conditions', () => {
  const ENDS = '2025-12-31'
  const SHIPPED = yritysChart.asetukset['tppohja/fi']

  function useBook(db: SqliteDb, template: string, settings: Record<string, string> = {}) {
    const rows = { 'tppohja/fi': template, ...settings }
    for (const [key, value] of Object.entries(rows)) {
      db.run('INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES (?, ?)', [key, value])
    }
  }

  function notes(db: SqliteDb, selected: string[] = []): string {
    return generateStatementHtml(db, ENDS, {
      size: 'ISO',
      selected,
      headcount: 1,
      share_count: 1000,
    })
  }

  const prints = (db: SqliteDb, tag: string) => notes(db, [tag]) !== notes(db)
  const offered = (db: SqliteDb) => getStatement(db, ENDS).sections.map((s) => s.tag)

  describe('shipped template', () => {
    it('prints a limited company only its own sections', async () => {
      await withGolden((db) => {
        useBook(db, SHIPPED, { muoto: 'oy' })
        expect(prints(db, 'oypaaoma')).toBe(true)
        expect(prints(db, 'oykaytto')).toBe(true)
        expect(prints(db, 'tmipaaoma')).toBe(false)
        expect(prints(db, 'sahko')).toBe(true)
      })
    })

    it('prints a sole trader only its own sections', async () => {
      await withGolden((db) => {
        useBook(db, SHIPPED, { muoto: 'tmi' })
        expect(prints(db, 'tmipaaoma')).toBe(true)
        expect(prints(db, 'oypaaoma')).toBe(false)
        expect(prints(db, 'oykaytto')).toBe(false)
        expect(prints(db, 'sahko')).toBe(true)
      })
    })

    it('prints neither form-specific section for another form', async () => {
      await withGolden((db) => {
        useBook(db, SHIPPED, { muoto: 'ky' })
        expect(prints(db, 'tmipaaoma')).toBe(false)
        expect(prints(db, 'oypaaoma')).toBe(false)
        expect(prints(db, 'sahko')).toBe(true)
      })
    })

    it('offers only the sections of the book in the wizard', async () => {
      await withGolden((db) => {
        useBook(db, SHIPPED, { muoto: 'oy' })
        expect(offered(db)).toEqual(expect.arrayContaining(['oypaaoma', 'oykaytto', 'sahko']))
        expect(offered(db)).not.toContain('tmipaaoma')
      })
      await withGolden((db) => {
        useBook(db, SHIPPED, { muoto: 'tmi' })
        expect(offered(db)).toEqual(expect.arrayContaining(['tmipaaoma', 'sahko']))
        expect(offered(db)).not.toContain('oypaaoma')
        expect(offered(db)).not.toContain('oykaytto')
      })
    })

    it('treats a book with no legal form as a limited company', async () => {
      await withGolden((db) => {
        useBook(db, SHIPPED)
        expect(offered(db)).toContain('oypaaoma')
        expect(offered(db)).not.toContain('tmipaaoma')
        expect(prints(db, 'oypaaoma')).toBe(true)
      })
    })
  })

  it('holds a condition across headings until the next ? line', async () => {
    await withGolden((db) => {
      useBook(
        db,
        '?muoto=tmi\n##Otsikko\nEhdollinen teksti\n##Toinen otsikko\nMyös ehdollinen\n?\nAina',
        { muoto: 'oy' },
      )
      const html = notes(db)
      expect(html).not.toContain('Ehdollinen teksti')
      expect(html).not.toContain('Myös ehdollinen')
      expect(html).toContain('Aina')
    })
  })

  it('reads the setting the line names, not the legal form', async () => {
    const template = '?omaAsetus=oy\nEhdollinen teksti\n?\nAina'
    await withGolden((db) => {
      useBook(db, template, { muoto: 'oy' })
      expect(notes(db)).not.toContain('Ehdollinen teksti')
    })
    await withGolden((db) => {
      useBook(db, template, { muoto: 'tmi', omaAsetus: 'oy' })
      expect(notes(db)).toContain('Ehdollinen teksti')
      expect(notes(db)).toContain('Aina')
    })
  })

  it('applies conditions to the wizard sections the same way', () => {
    const template = '#ensin Ensin\n?omaAsetus=kylla\n#ehto Ehdollinen\n?\n#lopuksi Lopuksi'
    const tags = (value: string) =>
      parseSections(template, (key) => (key === 'omaAsetus' ? value : '')).map((s) => s.tag)
    expect(tags('kylla')).toEqual(['ensin', 'ehto', 'lopuksi'])
    expect(tags('ei')).toEqual(['ensin', 'lopuksi'])
  })
})
