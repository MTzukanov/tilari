/** Prove Node can open the golden DB via shared Ledger. */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ledger } from '../../frontend/src/book/ledger.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const bytes = readFileSync(resolve(root, 'testdb/tilari-test.kitsas'))
const ledger = new Ledger()
const meta = await ledger.openBytes(bytes, {
  sourceName: 'tilari-test.kitsas',
  dbPath: 'server:tilari-test.kitsas',
})
const bal = await ledger.fetchBalances('2024-12-31')
console.log(
  JSON.stringify({ meta: { name: meta.name, periods: meta.periods }, lines: bal.lines.length }, null, 2),
)
ledger.closeLedger()
