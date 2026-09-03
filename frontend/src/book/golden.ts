import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SqliteDb } from './sqlite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const GOLDEN_PATH = path.join(repoRoot, 'testdb', 'tilari-test.kitsas')

/** Load the committed golden Kitsas book (`testdb/tilari-test.kitsas`). */
export async function loadGoldenDb(): Promise<SqliteDb> {
  return SqliteDb.fromBytes(readFileSync(GOLDEN_PATH))
}
