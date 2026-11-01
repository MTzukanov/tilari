import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { TaxReturnDialog, type PeriodDocuments } from './TaxReturnDialog'

/** Opens a period's annual tax return data. Self-contained, so a page only places it. */
export function TaxReturnButton({ ends, documents }: { ends: string; documents: PeriodDocuments }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <p className="tax-return-open">
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
          {t('taxReturn.open')}
        </button>
      </p>
      {open ? <TaxReturnDialog ends={ends} documents={documents} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
