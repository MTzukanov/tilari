/** A rental object's kind guessed from its cost-centre name (setup default; the owner decides). */
import type { PropertyKind } from './types'

/** A letter group standing alone or before a number: "AP 205", "AH250", "AK B 30", "LH 3". */
function designator(letters: string): RegExp {
  return new RegExp(`(^|[^\\p{L}])${letters}(?=[^\\p{L}]|\\d|$)`, 'iu')
}

const RULES: [PropertyKind, RegExp[]][] = [
  ['commercial', [designator('lh'), /liiketila/iu]],
  ['garage', [/autotalli/iu]],
  ['parking', [designator('ap'), designator('ah'), designator('ak'), /autopaik|autohalli|autokatos|pysäköinti/iu]],
  ['storage', [/varasto/iu]],
]

export function kindFromName(name: string): PropertyKind {
  for (const [kind, patterns] of RULES) {
    if (patterns.some((p) => p.test(name))) return kind
  }
  return 'apartment'
}
