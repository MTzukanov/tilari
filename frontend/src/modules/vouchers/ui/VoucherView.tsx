import { useEffect, useState } from 'react'
import { deleteVoucher, fetchVoucher, type VoucherDetail, type VoucherEntry } from '../../../api'
import { DELETABLE_TYPES } from '../../../book/vouchers'
import { AttachmentLink } from '../../../shared/AttachmentLink'
import { formatCents } from '../../../shared/money'
import { formatVoucherIdFromDetail } from '../../../shared/formatVoucherId'
import { TypeTag } from '../../../shared/TypeTag'
import { voucherStatusName, voucherTypeName } from '../../../shared/voucherTypes'
import { useI18n } from '../../../i18n'

function rowDescription(v: VoucherEntry): string {
  const partner = v.partner?.name
  if (partner && v.description && partner !== v.description) return `${partner} - ${v.description}`
  return partner || v.description || '-'
}

export function VoucherView({
  voucherId,
  highlightAccount,
  highlightEntryId,
  upLabel,
  editHref,
  onBack,
  onOpenAccount,
}: {
  voucherId: number
  highlightAccount?: number | null
  highlightEntryId?: number | null
  upLabel: string
  editHref: string
  onBack: () => void
  onOpenAccount?: (account: number) => void
}) {
  const { t } = useI18n()
  const [data, setData] = useState<VoucherDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetchVoucher(voucherId)
        if (cancelled) return
        setData(res)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [voucherId])

  useEffect(() => {
    if (!data || highlightEntryId == null) return
    const el = document.getElementById(`entry-${highlightEntryId}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [data, highlightEntryId])

  async function onDelete() {
    if (!data || !DELETABLE_TYPES.has(data.type)) return
    const msg =
      data.type === 9100 ? t('voucher.confirmDeleteVat') : t('voucher.confirmDelete')
    if (!window.confirm(msg)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteVoucher(data.id)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const canDelete = data && DELETABLE_TYPES.has(data.type) && data.status >= 50

  return (
    <div className="voucher">
      <button type="button" className="back-btn" onClick={onBack}>
        {upLabel}
      </button>

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingVouchers')}</p> : null}

      {data ? (
        <>
          <header className="voucher-head">
            <p className="voucher-id">{formatVoucherIdFromDetail(data)}</p>
            <h2>{data.title || voucherTypeName(data.type) || t('voucher.fallback')}</h2>
            <p className="lede voucher-meta">
              {data.date}
              {' · '}
              {voucherTypeName(data.type)}
              {' · '}
              {voucherStatusName(data.status)}
              {data.partner?.name ? ` · ${data.partner.name}` : ''}
              {' · '}
              <a href={editHref}>{t('voucher.edit')}</a>
              {canDelete ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="linkish danger"
                    disabled={deleting}
                    onClick={() => void onDelete()}
                  >
                    {deleting ? t('voucher.deleting') : t('voucher.delete')}
                  </button>
                </>
              ) : null}
            </p>
            {(data.invoice_date || data.due_date || data.reference) && (
              <p className="lede voucher-extra">
                {data.invoice_date ? t('voucher.invoiceDate', { date: data.invoice_date }) : ''}
                {data.invoice_date && data.due_date ? ' · ' : ''}
                {data.due_date ? t('voucher.due', { date: data.due_date }) : ''}
                {(data.invoice_date || data.due_date) && data.reference ? ' · ' : ''}
                {data.reference ? t('voucher.reference', { value: data.reference }) : ''}
              </p>
            )}
            {data.attachment_count > 0 ? (
              <p className="lede voucher-attachments">
                {t('voucher.attachments')}{' '}
                {data.attachments.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 ? ', ' : ''}
                    <AttachmentLink className="attachment-link" id={l.id}>
                      {l.name || l.role_name || `#${l.id}`}
                    </AttachmentLink>
                  </span>
                ))}
              </p>
            ) : null}
          </header>

          {data.entries.length === 0 ? (
            <p className="empty">{t('voucher.noLines')}</p>
          ) : (
            <table className="ledger-table voucher-table">
              <thead>
                <tr>
                  <th>{t('table.date')}</th>
                  <th>{t('table.account')}</th>
                  <th>{t('table.description')}</th>
                  <th className="amount">{t('table.debit')}</th>
                  <th className="amount">{t('table.credit')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((v) => {
                  const highlighted =
                    (highlightEntryId != null && v.id === highlightEntryId) ||
                    (highlightAccount != null &&
                      v.account === highlightAccount &&
                      highlightEntryId == null)
                  const fromClick = highlightEntryId != null && v.id === highlightEntryId
                  return (
                    <tr
                      key={v.id}
                      id={`entry-${v.id}`}
                      className={[
                        highlighted ? 'is-highlight' : '',
                        fromClick ? 'is-origin' : '',
                        onOpenAccount ? 'clickable' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      tabIndex={onOpenAccount ? 0 : undefined}
                      onClick={() => onOpenAccount?.(v.account)}
                      onKeyDown={(e) => {
                        if (!onOpenAccount) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenAccount(v.account)
                        }
                      }}
                    >
                      <td className="num">{v.date}</td>
                      <td>
                        <span className="num">{v.account}</span>{' '}
                        {v.account_name || <span className="muted">-</span>}
                        <TypeTag type={v.account_type} />
                      </td>
                      <td>{rowDescription(v)}</td>
                      <td className="amount">{formatCents(v.debit_cents, { emptyZero: true })}</td>
                      <td className="amount">{formatCents(v.credit_cents, { emptyZero: true })}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('table.rows', { n: data.count })}</td>
                  <td className="amount">{formatCents(data.debit_sum_cents)}</td>
                  <td className="amount">{formatCents(data.credit_sum_cents)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      ) : null}
    </div>
  )
}
