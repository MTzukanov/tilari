import { useI18n } from '../../../i18n'
import { DueTile, DueTiles } from '../../../shared/DueTile'
import { Pill } from '../../../shared/Pill'
import type { DocumentSkip, Warning } from '../api'
import { SkipDocumentButton } from './FormParts'
import { dueTile, sortWarnings, warningText, warningTone } from './format'

/**
 * An object's warnings, the same on its page and in the portfolio's list: a reminder with a day is a
 * tile, with the whole sentence on hover; every other warning is a line led by a pill saying what it is.
 */
export function Warnings({
  warnings,
  asOf,
  onOpenDue,
  onSkip,
}: {
  warnings: Warning[]
  asOf: string
  /** Where a tile goes: the edit page from the object's page, the object from the portfolio. */
  onOpenDue: () => void
  /** Only where the owner may say a document does not exist ("Ohita"). */
  onSkip?: (skip: DocumentSkip) => Promise<unknown>
}) {
  const { t } = useI18n()
  const tiles = warnings.flatMap((w) => {
    const tile = dueTile(t, w, asOf)
    return tile ? [{ w, tile }] : []
  })
  const lines = sortWarnings(warnings.filter((w) => !dueTile(t, w, asOf)))
  return (
    <>
      {tiles.length ? (
        <DueTiles>
          {tiles.map(({ w, tile }, i) => (
            <DueTile key={`${w.code}-${i}`} {...tile} title={warningText(t, w)} onOpen={onOpenDue} />
          ))}
        </DueTiles>
      ) : null}
      {lines.length ? (
        <ul className="property-warning-lines">
          {lines.map((w, i) => {
            const { tone, word } = warningTone(w.code)
            return (
              <li key={`${w.code}-${i}`}>
                <Pill tone={tone}>{t(`properties.alerts.word.${word}`)}</Pill>
                <span>
                  {warningText(t, w)}
                  {w.skip && onSkip ? <SkipDocumentButton onSkip={() => onSkip(w.skip!)} /> : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
