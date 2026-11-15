/**
 * `testdb/tilari-properties.kitsas`: the invented rental-object book (`buildPropertyFixture`) with its
 * suggested links applied, so objects have investments, a sale and payback for e2e and manual checks.
 * Rebuild after changing the fixture: `npm run build:testdb:properties` (writes the file). Without
 * that, this test checks the committed file still opens with linked objects.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SqliteDb } from '../../sqlite'
import { applySetup, buildSetup, computePortfolio } from './domain/portfolio'
import type { SetupApplyInput } from './domain/types'
import { buildPropertyFixture, CC } from './testFixture'

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../testdb/tilari-properties.kitsas')
const TODAY = '2026-10-08'

async function buildBook(): Promise<Uint8Array> {
  const { db } = await buildPropertyFixture()
  const setup = buildSetup(db)
  const byCentre = new Map<number, { add_eras: number[]; add_docs: number[] }>()
  const entry = (id: number) => byCentre.get(id) ?? byCentre.set(id, { add_eras: [], add_docs: [] }).get(id)!
  for (const era of setup.eras) if (era.suggestion?.cost_centre_id != null) entry(era.suggestion.cost_centre_id).add_eras.push(era.eraid)
  for (const doc of setup.docs) if (doc.suggestion?.cost_centre_id != null) entry(doc.suggestion.cost_centre_id).add_docs.push(doc.voucher_id)
  const input: SetupApplyInput = {
    objects: [...[...byCentre].map(([id, v]) => ({ id, ...v })), { id: CC.office, excluded: true }],
  }
  applySetup(db, input, `${TODAY}T10:00:00Z`)
  db.vacuum()
  return db.export()
}

describe('testdb/tilari-properties.kitsas', () => {
  it.runIf(process.env.TILARI_WRITE_TESTDB === '1')('is rebuilt from the fixture', async () => {
    writeFileSync(FILE, await buildBook())
  })

  it('opens with linked objects: investments to recover, a sold one, every one charted', async () => {
    const db = await SqliteDb.fromBytes(new Uint8Array(readFileSync(FILE)))
    const p = computePortfolio(db, { today: TODAY })
    expect(p.undecided).toBe(0)
    expect(p.rows.some((r) => r.status === 'sold')).toBe(true)
    expect(p.totals.unrecovered_snt).toBeGreaterThan(0)
    const invested = p.chart.objects.filter((o) => o.unrecovered_snt.some((v) => v != null))
    expect(invested.length).toBeGreaterThan(3)
    expect(p.chart.total_unrecovered_snt.at(-1)).toBe(p.totals.unrecovered_snt)
  })
})
