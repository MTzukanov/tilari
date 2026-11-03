import { useEffect, useRef, useState } from 'react'
import { attachmentHref } from '../../../api'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { FilePill, Pill } from '../../../shared/Pill'
import { decodeTable, type RowFile } from '../api'

export type ReadResult = { count: number; kept: number; skipped: number[] }

/**
 * A file of form rows on a voucher of the period (`rowFiles.ts`). It is read at once when the form has nothing typed
 * yet (`auto`), or on the button, and its text goes the way of rows pasted by hand.
 */
export function RowFileRead({ file, auto, onText }: { file: RowFile; auto: boolean; onText: (text: string) => ReadResult }) {
  const { t } = useI18n()
  const [result, setResult] = useState<ReadResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const handler = useRef(onText)
  handler.current = onText

  const read = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(await attachmentHref(file.attachment_id))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult(handler.current(decodeTable(new Uint8Array(await res.arrayBuffer()))))
    } catch {
      setResult(null)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // Once per file: a later save gives the form rows, and the button stays for reading it again.
  const started = useRef<number | null>(null)
  useEffect(() => {
    if (!auto || started.current === file.attachment_id) return
    started.current = file.attachment_id
    void read()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, file.attachment_id])

  return (
    <div className="tax-return-row-file">
      <p className="tax-return-row-file-line">
        <span className="muted">{t('taxReturn.attached.rowFile', { voucher: file.voucher_title, date: formatDate(file.date) })}</span>
        <FilePill id={file.attachment_id} name={file.name} />
        {file.posted ? null : <Pill>{t('taxReturn.attached.rowFileDraft')}</Pill>}
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void read()}>
          {t('taxReturn.attached.rowFileRead')}
        </button>
      </p>
      {result ? (
        <p className="muted" role="status">
          {t('taxReturn.attached.pasteResult', { count: result.count })}
          {result.kept ? ` ${t('taxReturn.attached.pasteKept', { count: result.kept })}` : ''}
          {result.skipped.length ? ` ${t('taxReturn.attached.pasteSkipped', { lines: result.skipped.join(', ') })}` : ''}
        </p>
      ) : null}
      {failed ? <p role="alert">{t('taxReturn.attached.rowFileFailed')}</p> : null}
    </div>
  )
}
