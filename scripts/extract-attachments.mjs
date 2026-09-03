#!/usr/bin/env node
/**
 * Extract Liite BLOBs out of a .kitsas file (classic → web layout).
 * Writes {out_dir}/{sha} and optionally NULLs Liite.data. Run against a *copy*.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DatabaseSync } from 'node:sqlite'

const SHA_RE = /^[0-9a-f]{64}$/

function extract(src, outDir, apply) {
  mkdirSync(outDir, { recursive: true })
  const db = new DatabaseSync(src)
  const rows = db.prepare('SELECT id, sha, data FROM Liite WHERE data IS NOT NULL').all()
  let n = 0
  const upd = db.prepare('UPDATE Liite SET sha = ?, data = NULL WHERE id = ?')
  for (const row of rows) {
    if (!row.data) continue
    const blob = Buffer.from(row.data)
    const sha =
      row.sha && SHA_RE.test(String(row.sha))
        ? String(row.sha)
        : createHash('sha256').update(blob).digest('hex')
    const dest = resolve(outDir, sha)
    if (!existsSync(dest)) writeFileSync(dest, blob)
    if (apply) upd.run(sha, row.id)
    n++
  }
  db.close()
  return n
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help || positionals.length < 2) {
  console.log('Usage: extract-attachments.mjs <kitsas> <out_dir> [--apply]')
  process.exit(values.help ? 0 : 1)
}

const n = extract(resolve(positionals[0]), resolve(positionals[1]), values.apply)
console.log(`extracted ${n} attachments into ${positionals[1]}`)
