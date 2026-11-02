import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../i18n'
import { Pill } from '../../../shared/Pill'
import { formatEurInput, parseEurInput, sanitizeEurInput } from '../../../shared/money'
import {
  computeForm73,
  emptyDividend,
  fieldName,
  parseHoldingTable,
  saleResult,
  type DividendClassView,
  type DividendInput,
  type Form62Section,
  type Form73Input,
  type HoldingGroup,
  type HoldingGroupView,
  type HoldingInput,
  type SaleIdType,
  type SaleInput,
  type TaxReturnInputs,
  type TaxReturnView,
} from '../api'
import { EurField, YesNo } from './FactsTab'
import { CopyFigure } from './FiguresTab'
import { formatFigure } from './format'
import { anchorId, type Jump } from './jump'

/** An amount that can stay empty, so that "not typed" differs from a typed zero. */
function OptionalEur({ label, cents, placeholder, onChange }: { label: string; cents: number | null | undefined; placeholder?: string; onChange: (cents: number | null) => void }) {
  const [draft, setDraft] = useState(cents != null ? formatEurInput(cents) : '')
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const next = sanitizeEurInput(e.target.value)
          setDraft(next)
          onChange(next.trim() ? parseEurInput(next) : null)
        }}
      />
    </label>
  )
}

function asInput(row: HoldingGroupView['rows'][number]): HoldingInput {
  return {
    era: row.era,
    group: row.group,
    name: row.name,
    business_id: row.business_id,
    shares: row.shares,
    cost_cents: row.cost_cents,
    unit_value: row.unit_value,
    total_value_cents: row.total_value_cents,
  }
}

function HoldingFields({ row, source, onChange, onDelete }: { row: HoldingInput; source: string; onChange: (next: Partial<HoldingInput>) => void; onDelete?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="tax-return-attached-row">
      {source ? <p className="muted tax-return-attached-source">{t('taxReturn.attached.fromEra', { text: source })}</p> : null}
      <label className="tax-return-attached-wide">
        Yhtiön tai osuuskunnan nimi
        <input type="text" value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label>
        Y-tunnus
        <input type="text" value={row.business_id} onChange={(e) => onChange({ business_id: e.target.value })} />
      </label>
      <label>
        Osakkeiden lukumäärä
        <input type="text" inputMode="decimal" value={row.shares} onChange={(e) => onChange({ shares: e.target.value })} />
      </label>
      {row.era != null ? (
        <span className="tax-return-attached-figure">
          Tuloverotuksessa poistamaton hankintameno
          <CopyFigure cents={row.cost_cents} label="Tuloverotuksessa poistamaton hankintameno" />
        </span>
      ) : (
        <EurField label="Tuloverotuksessa poistamaton hankintameno" cents={row.cost_cents} onChange={(cost_cents) => onChange({ cost_cents })} />
      )}
      {onDelete ? (
        <button type="button" className="btn-link tax-return-attached-end" onClick={onDelete}>
          {t('common.delete')}
        </button>
      ) : (
        <span />
      )}
      <label>
        Vertailuarvo kappaleelta
        <input type="text" inputMode="decimal" value={row.unit_value} onChange={(e) => onChange({ unit_value: e.target.value })} />
      </label>
      <OptionalEur label="Vertailuarvo yhteensä" cents={row.total_value_cents} onChange={(total_value_cents) => onChange({ total_value_cents })} />
    </div>
  )
}

const EMPTY_SALE: SaleInput = {
  voucher: null,
  id_type: 1,
  name: '',
  id_code: '',
  apartment: '',
  acquired: '',
  sold: '',
  share_after: '0',
  price_cents: 0,
  cost_cents: 0,
  expenses_cents: 0,
}

function SaleFields({ row, onChange, onDelete }: { row: SaleInput; onChange: (next: Partial<SaleInput>) => void; onDelete: () => void }) {
  const { t } = useI18n()
  const result = saleResult(row)
  return (
    <div className="tax-return-attached-row">
      <label>
        Luovutetun kohteen tunnuksen tyyppi
        <select
          value={row.id_type}
          onChange={(e) => {
            const value = Number(e.target.value)
            onChange({ id_type: value === 2 || value === 3 ? (value as SaleIdType) : 1 })
          }}
        >
          <option value="1">Y-tunnus</option>
          <option value="2">Kiinteistötunnus</option>
          <option value="3">Maakoodi</option>
        </select>
      </label>
      <label className="tax-return-attached-wide">
        Luovutetun kohteen nimi
        <input type="text" value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label>
        Tunnus
        <input type="text" value={row.id_code} onChange={(e) => onChange({ id_code: e.target.value })} />
      </label>
      <label>
        Huoneiston numero
        <input type="text" value={row.apartment} onChange={(e) => onChange({ apartment: e.target.value })} />
      </label>
      <button type="button" className="btn-link tax-return-attached-end" onClick={onDelete}>
        {t('common.delete')}
      </button>
      <label>
        Hankinta-aika
        <input type="date" value={row.acquired} onChange={(e) => onChange({ acquired: e.target.value })} />
      </label>
      <label>
        Luovutusaika
        <input type="date" value={row.sold} onChange={(e) => onChange({ sold: e.target.value })} />
      </label>
      <label>
        Omistusosuus luovutuksen jälkeen (%)
        <input type="text" inputMode="decimal" value={row.share_after} onChange={(e) => onChange({ share_after: e.target.value })} />
      </label>
      <EurField label="Luovutushinta" cents={row.price_cents} onChange={(price_cents) => onChange({ price_cents })} />
      <EurField label="Verotuksessa poistamaton hankintameno" cents={row.cost_cents} onChange={(cost_cents) => onChange({ cost_cents })} />
      <EurField label="Voiton hankkimisesta aiheutuneet menot" cents={row.expenses_cents} onChange={(expenses_cents) => onChange({ expenses_cents })} />
      <span className="tax-return-attached-figure">
        <Pill tone={result < 0 ? 'warn' : 'ok'}>{t(result < 0 ? 'taxReturn.attached.loss' : 'taxReturn.attached.gain')}</Pill>
        <CopyFigure cents={Math.abs(result)} label={t(result < 0 ? 'taxReturn.attached.loss' : 'taxReturn.attached.gain')} />
      </span>
    </div>
  )
}

function Section62({ section, typed, onChange }: { section: Form62Section; typed: Record<string, number>; onChange: (code: number, cents: number | null) => void }) {
  const { t } = useI18n()
  return (
    <table className="tax-return-table tax-return-form62">
      <caption>{section.title}</caption>
      <tbody>
        {section.rows.map((row) => (
          <tr key={row.code}>
            <td>{row.label}</td>
            <td className="amount">
              <CopyFigure cents={row.cents} label={row.label} />
            </td>
            <td>
              <OptionalEur label="" cents={typed[row.code]} placeholder={t('taxReturn.attached.fromLedger')} onChange={(cents) => onChange(row.code, cents)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DividendFields({ row, onChange }: { row: DividendClassView; onChange: (next: Partial<DividendInput>) => void }) {
  return (
    <div className="tax-return-attached-row">
      <span className="tax-return-dividend-title">{row.title}</span>
      <EurField label="Osingot ja ylijäämät yhteensä" cents={row.cents} onChange={(cents) => onChange({ cents })} />
      {row.codes.listed != null ? (
        <label className="tax-return-toggle">
          <input type="checkbox" checked={row.listed} onChange={(e) => onChange({ listed: e.target.checked })} /> Jakajayhtiö on listattu
        </label>
      ) : (
        <span />
      )}
      {row.codes.ownership != null ? (
        <label>
          Omistusosuus (%)
          <input type="text" inputMode="decimal" value={row.ownership} onChange={(e) => onChange({ ownership: e.target.value })} />
        </label>
      ) : null}
    </div>
  )
}

/** Rows copied from a spreadsheet or read from a file replace the group's typed rows. */
function PasteRows({ onRows }: { onRows: (text: string) => { count: number; kept: number; skipped: number[] } }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ count: number; kept: number; skipped: number[] } | null>(null)
  return (
    <details className="tax-return-paste">
      <summary>{t('taxReturn.attached.pasteOpen')}</summary>
      <p className="muted">{t('taxReturn.attached.pasteLead')}</p>
      <textarea
        rows={6}
        value={text}
        aria-label={t('taxReturn.attached.pasteOpen')}
        onChange={(e) => {
          setText(e.target.value)
          setResult(null)
        }}
      />
      <p className="tax-return-paste-actions">
        <label>
          {t('taxReturn.attached.pasteFile')}
          <input
            type="file"
            accept=".tsv,.csv,.txt,text/plain,text/tab-separated-values,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              void file.text().then((content) => {
                setText(content)
                setResult(null)
              })
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="btn-secondary" disabled={!text.trim()} onClick={() => setResult(onRows(text))}>
          {t('taxReturn.attached.pasteReplace')}
        </button>
      </p>
      {result ? (
        <p className="muted" role="status">
          {t('taxReturn.attached.pasteResult', { count: result.count })}
          {result.kept ? ` ${t('taxReturn.attached.pasteKept', { count: result.kept })}` : ''}
          {result.skipped.length ? ` ${t('taxReturn.attached.pasteSkipped', { lines: result.skipped.join(', ') })}` : ''}
        </p>
      ) : null}
    </details>
  )
}

/** Forms 8A, 71B, 73 and 62: what the ledger gives, what the owner adds, and what is left to the cent. */
export function FormsTab({ view, onSave, onJump }: { view: TaxReturnView; onSave: (inputs: TaxReturnInputs) => Promise<void>; onJump: (jump: Jump) => void }) {
  const { t } = useI18n()
  const fromView = () => view.form8a.groups.flatMap((group) => group.rows.map(asInput))
  const salesFromView = (): SaleInput[] =>
    view.form71b.rows.map((row) => {
      const { result_cents: _result, ...input } = row
      return input
    })
  const [holdings, setHoldings] = useState<HoldingInput[]>(fromView)
  const [sales, setSales] = useState<SaleInput[]>(salesFromView)
  const [form62, setForm62] = useState<Record<string, number>>(view.inputs.form62)
  const [form73, setForm73] = useState<Form73Input>(view.inputs.form73)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAll62, setShowAll62] = useState(false)

  // A saved view replaces the draft, and the fields follow: their own text state starts from these values.
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    setHoldings(fromView())
    setSales(salesFromView())
    setForm62(view.inputs.form62)
    setForm73(view.inputs.form73)
    setDirty(false)
    setRevision((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const next = (): TaxReturnInputs => ({ ...view.inputs, holdings, sale_rows: sales, form62, form73 })

  // Leaving the tab keeps what was typed, so moving to the file does not lose it.
  const pending = useRef<TaxReturnInputs | null>(null)
  const save = useRef(onSave)
  save.current = onSave
  useEffect(() => {
    pending.current = dirty ? next() : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, holdings, sales, form62, form73])
  useEffect(
    () => () => {
      if (pending.current) void save.current(pending.current)
    },
    [],
  )

  const touch = () => {
    setDirty(true)
    setSaved(false)
  }
  const setHolding = (index: number, patch: Partial<HoldingInput>) => {
    setHoldings((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    touch()
  }
  const setSale = (index: number, patch: Partial<SaleInput>) => {
    setSales((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    touch()
  }
  const set62 = (code: number, cents: number | null) => {
    setForm62((old) => {
      const copy = { ...old }
      if (cents == null) delete copy[code]
      else copy[code] = cents
      return copy
    })
    touch()
  }

  const setDividend = (row: DividendClassView, patch: Partial<DividendInput>) => {
    setForm73((old) => ({ ...old, classes: { ...old.classes, [row.key]: { ...(old.classes[row.key] ?? emptyDividend()), ...patch } } }))
    touch()
  }
  const pasteRows = (group: HoldingGroup, text: string) => {
    const pasted = parseHoldingTable(text, group, holdings)
    if (pasted.rows.length) {
      setHoldings((rows) => [...rows.filter((row) => row.group !== group || row.era != null), ...pasted.rows])
      setRevision((n) => n + 1)
      touch()
    }
    return { count: pasted.rows.length, kept: pasted.kept_ids, skipped: pasted.skipped }
  }

  const groups = view.form8a.groups.filter((group) => group.rows.length || group.field_cents)
  const needs = (form: string) => view.forms.some((item) => item.form === form)
  const fixedSales = view.forms.some((item) => item.form === '71B' && !item.built)
  const showSales = needs('71B') || view.form71b.rows.length > 0 || view.form71b.suggestions.length > 0 || sales.length > 0
  const show62 = needs('62') || view.form62.used
  const sections62 = showAll62 ? view.form62.sections : view.form62.sections.filter((section) => section.has_values)
  const dividends = computeForm73(form73, view.form73.ledger_cents)
  // Form 73 is always here: dividends on an account placed elsewhere would otherwise hide it.
  const need73 = needs('73') || view.form73.typed || dividends.typed
  const allTaxFree = view.inputs.answers.all_dividends_tax_free === true

  const body73 = (
    <>
      <p className="muted">{t('taxReturn.attached.dividendsLead')}</p>
      <YesNo
        question="Onko yhtiö julkisesti noteerattu?"
        value={form73.company_listed}
        onChange={(company_listed) => {
          setForm73((old) => ({ ...old, company_listed }))
          touch()
        }}
      />
      {dividends.classes.map((row) => (
        <DividendFields key={`${row.key}-${revision}`} row={row} onChange={(patch) => setDividend(row, patch)} />
      ))}
      <p className="tax-return-attached-totals">
        <span>{t('taxReturn.attached.field', { field: 'Osingot ja ylijäämät yhteensä', amount: formatFigure(dividends.total_cents) })}</span>
        <span>{t('taxReturn.attached.field', { field: fieldName(337), amount: formatFigure(dividends.ledger_cents) })}</span>
        <span>{t('taxReturn.attached.field', { field: 'Verovapaa osuus yhteensä', amount: formatFigure(dividends.taxfree_cents) })}</span>
        <span>{t('taxReturn.attached.field', { field: 'Veronalainen osuus yhteensä', amount: formatFigure(dividends.taxable_cents) })}</span>
      </p>
      {dividends.total_cents !== dividends.ledger_cents ? (
        <p>
          <Pill tone="crit">{t('taxReturn.attached.dividendsLeft', { amount: formatFigure(dividends.ledger_cents - dividends.total_cents) })}</Pill>
        </p>
      ) : null}
    </>
  )

  return (
    <form
      className="tax-return-facts"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave(next()).then(() => setSaved(true))
      }}
    >
      <p className="muted">{t('taxReturn.attached.lead')}</p>
      {!groups.length && !showSales && !show62 && !need73 ? <p className="muted">{t('taxReturn.attached.none')}</p> : null}

      {show62 ? (
        <fieldset id={anchorId('form-62')} tabIndex={-1} className="tax-return-fieldset">
          <legend>{t('taxReturn.form.62', { form: '62' })}</legend>
          <p className="muted">{t('taxReturn.attached.depreciationLead')}</p>
          {sections62.map((section) => (
            <Section62 key={`${section.key}-${revision}`} section={section} typed={form62} onChange={set62} />
          ))}
          <label className="tax-return-toggle">
            <input type="checkbox" checked={showAll62} onChange={(e) => setShowAll62(e.target.checked)} /> {t('taxReturn.attached.showAll')}
          </label>
        </fieldset>
      ) : null}

      {need73 ? (
        <fieldset id={anchorId('form-73')} tabIndex={-1} className="tax-return-fieldset">
          <legend>{t('taxReturn.form.73', { form: '73' })}</legend>
          {body73}
        </fieldset>
      ) : (
        <details id={anchorId('form-73')} tabIndex={-1} className="tax-return-fieldset tax-return-optional">
          <summary>
            {t('taxReturn.form.73', { form: '73' })}: {t('taxReturn.attached.notNeeded')}
          </summary>
          {allTaxFree ? (
            <p className="muted">{t('taxReturn.attached.dividendsTaxFree')}</p>
          ) : (
            <p className="muted">
              {t('taxReturn.attached.dividendsNone', { field: fieldName(337) })}{' '}
              <button type="button" className="btn-link tax-return-jump" onClick={() => onJump({ tab: 'figures', to: 'confirm' })}>
                {t('taxReturn.attached.toFigures')}
              </button>
            </p>
          )}
          {body73}
        </details>
      )}

      {groups.length ? (
        <fieldset id={anchorId('form-8A')} tabIndex={-1} className="tax-return-fieldset">
          <legend>{t('taxReturn.form.8A', { form: '8A' })}</legend>
          {groups.map((group) => {
            const own = holdings.map((row, index) => ({ row, index })).filter(({ row }) => row.group === group.key)
            const typedGroup = group.key === 'financial'
            return (
              <section key={group.key} id={anchorId(`form-8A-${group.field}`)} tabIndex={-1}>
                <h4>{group.title}</h4>
                <p className="muted">{t(typedGroup ? 'taxReturn.attached.holdingsTyped' : 'taxReturn.attached.holdingsEra')}</p>
                {group.key === 'other' ? <p className="muted">{t('taxReturn.attached.housingValue')}</p> : null}
                {typedGroup ? <p className="muted">{t('taxReturn.attached.noFinnishId')}</p> : null}
                {own.map(({ row, index }) => (
                  <HoldingFields
                    key={`${row.era ?? 'typed'}-${index}-${revision}`}
                    row={row}
                    source={group.rows.find((item) => item.era != null && item.era === row.era)?.era_text ?? ''}
                    onChange={(patch) => setHolding(index, patch)}
                    onDelete={
                      row.era == null
                        ? () => {
                            setHoldings((rows) => rows.filter((_, i) => i !== index))
                            touch()
                          }
                        : undefined
                    }
                  />
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setHoldings((rows) => [...rows, { era: null, group: group.key, name: '', business_id: '', shares: '', cost_cents: 0, unit_value: '', total_value_cents: null }])
                    touch()
                  }}
                >
                  {t('taxReturn.attached.addRow')}
                </button>
                <PasteRows onRows={(text) => pasteRows(group.key, text)} />
                <p className="tax-return-attached-totals">
                  <span>{t('taxReturn.attached.field', { field: fieldName(group.field), amount: formatFigure(group.field_cents) })}</span>
                  <span>{t('taxReturn.attached.field', { field: 'Hankintamenot yhteensä', amount: formatFigure(group.cost_cents) })}</span>
                  <span>{t('taxReturn.attached.field', { field: 'Vertailuarvot yhteensä', amount: formatFigure(group.value_cents) })}</span>
                </p>
              </section>
            )
          })}
        </fieldset>
      ) : null}

      {showSales ? (
        <fieldset id={anchorId('form-71B')} tabIndex={-1} className="tax-return-fieldset">
          <legend>{t('taxReturn.form.71B', { form: '71B' })}</legend>
          <p className="muted">{t('taxReturn.attached.salesLead')}</p>
          {fixedSales ? <p className="muted">{t('taxReturn.attached.salesFixed')}</p> : null}
          {!view.form71b.saved && sales.length ? <p className="muted">{t('taxReturn.attached.salesSuggested')}</p> : null}
          {!sales.length ? <p className="muted">{t('taxReturn.attached.noSales')}</p> : null}
          {sales.map((row, index) => (
            <SaleFields
              key={`${row.voucher ?? 'typed'}-${index}-${revision}`}
              row={row}
              onChange={(patch) => setSale(index, patch)}
              onDelete={() => {
                setSales((rows) => rows.filter((_, i) => i !== index))
                touch()
              }}
            />
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSales((rows) => [...rows, { ...EMPTY_SALE }])
              touch()
            }}
          >
            {t('taxReturn.attached.addRow')}
          </button>
          {view.form71b.suggestions.length ? (
            <>
              <h4>{t('taxReturn.attached.suggestions')}</h4>
              <ul className="tax-return-check-list">
                {view.form71b.suggestions
                  .filter((suggestion) => !sales.some((row) => row.voucher === suggestion.voucher))
                  .map((suggestion) => (
                    <li key={suggestion.voucher}>
                      <span>
                        {suggestion.sold} {suggestion.name} {formatFigure(suggestion.price_cents)}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setSales((rows) => [...rows, suggestion])
                          touch()
                        }}
                      >
                        {t('taxReturn.attached.addRow')}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </fieldset>
      ) : null}

      <p className="tax-return-actions">
        <button type="submit" className="btn-primary" disabled={!dirty}>
          {t('common.save')}
        </button>
        {saved && !dirty ? <span className="muted">{t('taxReturn.fact.saved')}</span> : null}
      </p>
    </form>
  )
}
