import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

describe('legal files', () => {
  it('ships a full GPL-3 LICENSE and third-party notices', async () => {
    const license = readFileSync(resolve(repoRoot, 'LICENSE'), 'utf8')
    expect(license).toContain('Copyright (C) 2026 Michael Tzukanov')
    expect(license).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(license).toContain('Version 3, 29 June 2007')
    expect(license).toContain('Additional terms under GPL section 7')
    const notices = readFileSync(resolve(repoRoot, 'THIRD_PARTY.md'), 'utf8')
    expect(notices).toContain('Meta Platforms')
    expect(notices).toContain('sql.js')
    expect(notices).toContain('Hiroki Osame')
    expect(notices).toContain('Evan Wallace')
    expect(existsSync(resolve(repoRoot, 'scripts/copy-legal.sh'))).toBe(true)
  })
})
