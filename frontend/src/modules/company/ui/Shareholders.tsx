import { useEffect, useState } from 'react'
import { fetchPartners } from '../../../api'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatBp, formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { SHAREHOLDER_KINDS, type CompanyOverview, type ShareholderInput, type ShareholderKind } from '../api'
import { errorText } from './format'
import type { SlotActions } from './Slot'

type Holding = { from: string; shares: string }
type Row = { key?: string; partner_id?: number; name: string; kind: ShareholderKind; resident: boolean; rate: string; holdings: Holding[] }

function rowsOf(overview: CompanyOverview): Row[] {
  return overview.shareholders.map((s) => ({
    key: s.key,
    partner_id: s.partner_id,
    name: s.name,
    kind: s.kind,
    resident: s.resident,
    rate: formatPercentInput(s.rate_bp),
    holdings: s.holdings.map((h) => ({ from: h.from, shares: String(h.shares) })),
  }))
}

/** What to send, or the first row's problem. A typed name known in `Kumppani` is that partner. */
function toInput(rows: Row[], partners: { id: number; name: string }[]): ShareholderInput[] | string {
  const out: ShareholderInput[] = []
  for (const row of rows) {
    const name = row.name.trim()
    if (!row.partner_id && !name) return 'company.shareholders.error.name'
    const rate = parsePercentInput(row.rate)
    if (rate != null && (Number.isNaN(rate) || rate < 0 || rate > 10000)) return 'company.shareholders.error.rate'
    const holdings = row.holdings.map((h) => ({ from: h.from, shares: Number(h.shares) }))
    if (!holdings.length || holdings.some((h) => !h.from || !Number.isSafeInteger(h.shares) || h.shares < 0)) return 'company.shareholders.error.holding'
    const known = row.partner_id ?? partners.find((p) => p.name === name)?.id
    out.push({
      ...(row.key ? { key: row.key } : {}),
      ...(known ? { partner_id: known } : { partner_name: name }),
      kind: row.kind,
      resident: row.resident,
      ...(rate != null ? { rate_bp: rate } : {}),
      holdings,
    })
  }
  return out
}

/** Who holds the shares, for splitting a dividend. Names stay in Kitsas's partner list. */
export function Shareholders({ overview, today, actions }: { overview: CompanyOverview; today: string; actions: SlotActions }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [partners, setPartners] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!rows) return
    let live = true
    fetchPartners()
      .then((r) => {
        if (live) setPartners(r.partners)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [rows])

  const kindText = (kind: ShareholderKind) => t(`company.shareholders.kind.${kind}`)
  const rateText = (bp: number | undefined, resident: boolean, kind: ShareholderKind) =>
    bp != null ? formatBp(bp) : !resident ? t('company.shareholders.rateMissing') : kind === 'company' ? formatBp(0) : t('company.shareholders.rateVero')

  async function save() {
    if (!rows) return
    const input = toInput(rows, partners)
    if (typeof input === 'string') {
      setError(t(input))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await actions.apply({ shareholders: input })
      setRows(null)
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((old) => old!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const updateHolding = (i: number, h: number, patch: Partial<Holding>) =>
    update(i, { holdings: rows![i].holdings.map((x, k) => (k === h ? { ...x, ...patch } : x)) })

  return (
    <section className="company-shareholders">
      <h3 className="section-label">{t('company.shareholders.title')}</h3>
      <p className="muted">{t('company.shareholders.lead')}</p>
      {!rows ? (
        <>
          {overview.shareholders.length ? (
            <div className="dividend-scroll">
              <table className="ledger-table zebra dense">
                <thead>
                  <tr>
                    <th>{t('company.shareholders.name')}</th>
                    <th>{t('company.shareholders.kindLabel')}</th>
                    <th className="num">{t('company.shareholders.sharesNow', { date: formatDate(overview.as_of) })}</th>
                    <th>{t('company.shareholders.rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.shareholders.map((s) => (
                    <tr key={s.key}>
                      <td>{s.name}</td>
                      <td>
                        {kindText(s.kind)}
                        {s.resident ? '' : `, ${t('company.shareholders.abroad')}`}
                      </td>
                      <td className="num">{s.shares}</td>
                      <td>{rateText(s.rate_bp, s.resident, s.kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t('company.shareholders.empty')}</p>
          )}
          {overview.read_only ? null : (
            <button type="button" className="btn-secondary" onClick={() => setRows(rowsOf(overview))}>
              {t('company.shareholders.edit')}
            </button>
          )}
        </>
      ) : (
        <div className="company-panel">
          <datalist id="company-partners">
            {partners.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          {rows.map((row, i) => (
            <fieldset key={row.key ?? `new-${i}`} className="company-shareholder">
              <div className="property-form-grid">
                <label>
                  {t('company.shareholders.name')}
                  {row.partner_id ? (
                    <input type="text" value={row.name} readOnly title={t('company.shareholders.nameInKitsas')} />
                  ) : (
                    <input type="text" list="company-partners" value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
                  )}
                </label>
                <label>
                  {t('company.shareholders.kindLabel')}
                  <select value={row.kind} onChange={(e) => update(i, { kind: e.target.value as ShareholderKind })}>
                    {SHAREHOLDER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {kindText(k)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="allocation-check">
                  <input type="checkbox" checked={row.resident} onChange={(e) => update(i, { resident: e.target.checked })} /> {t('company.shareholders.resident')}
                </label>
                <label>
                  {t('company.shareholders.rateOverride')}
                  <input type="text" inputMode="decimal" value={row.rate} placeholder={row.resident ? t('company.shareholders.rateVero') : ''} onChange={(e) => update(i, { rate: e.target.value })} />
                </label>
              </div>
              {row.holdings.map((h, k) => (
                <div key={k} className="property-form-row">
                  <label>
                    {t('company.shareholders.from')}
                    <input type="date" value={h.from} onChange={(e) => updateHolding(i, k, { from: e.target.value })} />
                  </label>
                  <label>
                    {t('company.shareholders.shares')}
                    <input type="number" min="0" step="1" value={h.shares} onChange={(e) => updateHolding(i, k, { shares: e.target.value })} />
                  </label>
                  {row.holdings.length > 1 ? (
                    <button type="button" className="btn-link" onClick={() => update(i, { holdings: row.holdings.filter((_, x) => x !== k) })}>
                      {t('company.shareholders.removeHolding')}
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="company-panel-actions">
                <button type="button" className="btn-link" onClick={() => update(i, { holdings: [...row.holdings, { from: today, shares: '' }] })}>
                  {t('company.shareholders.addHolding')}
                </button>
                <button type="button" className="btn-link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  {t('company.shareholders.remove')}
                </button>
              </div>
            </fieldset>
          ))}
          <p className="muted">{t('company.shareholders.ratesNote')}</p>
          {error ? <p className="error">{error}</p> : null}
          <div className="company-panel-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRows([...rows, { name: '', kind: 'person', resident: true, rate: '', holdings: [{ from: today, shares: '' }] }])}
            >
              {t('company.shareholders.add')}
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
              {t('company.shareholders.save')}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRows(null)}>
              {t('company.upload.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
