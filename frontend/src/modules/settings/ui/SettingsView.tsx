import { useEffect, useState } from 'react'
import {
  fetchSettings,
  fetchAllocations,
  saveSettings,
  saveAllocation,
  type Allocation,
} from '../../../api'
import { formatDate } from '../../../shared/dates'
import { FormatSelect, LanguageSelect } from '../../../shared/LanguageSelect'
import { FontSelect } from '../../../shared/FontSelect'
import { useI18n } from '../../../i18n'
import { allocationTypeName } from '../../../shared/voucherTypes'
import { isPracticeValue } from '../../../book/clock'

const TEXT_FIELDS = ['Nimi', 'Ytunnus', 'Kaupunki'] as const
const DATE_FIELDS = ['AlvAlkaa', 'MaksuAlvAlkaa', 'MaksuAlvLoppuu'] as const

export function SettingsView() {
  const { t } = useI18n()
  const [company, setCompany] = useState<Record<string, string>>({})
  const [periods, setPeriods] = useState<{ starts: string; ends: string }[]>([])
  const [kps, setKps] = useState<Allocation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [newKp, setNewKp] = useState('')

  function reload() {
    fetchSettings()
      .then((d) => {
        setCompany(d.company)
        setPeriods(d.periods)
      })
      .catch((err: Error) => setError(err.message))
    fetchAllocations()
      .then((d) => setKps(d.allocations))
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    reload()
  }, [])

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { TilitPaatetty: _lock, ...patch } = company
      const res = await saveSettings(patch)
      setCompany(res.company)
      setOk(t('settings.saved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="ledger">
      <h2>{t('settings.title')}</h2>
      <LanguageSelect id="settings-locale" />
      <FormatSelect id="settings-formats" />
      <FontSelect id="settings-font" />
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="muted">{ok}</p> : null}
      <form className="editor editor-card" onSubmit={saveCompany}>
        <div className="form-grid">
          {TEXT_FIELDS.map((key) => (
            <label key={key}>
              {t(`settings.fields.${key}`)}
              <input
                type="text"
                value={company[key] || ''}
                onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
              />
            </label>
          ))}
          {DATE_FIELDS.map((key) => (
            <label key={key}>
              {t(`settings.fields.${key}`)}
              <input
                type="date"
                value={company[key] || ''}
                onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            {t('settings.fields.AlvKausi')}
            <select
              value={company.AlvKausi || '1'}
              onChange={(e) => setCompany({ ...company, AlvKausi: e.target.value })}
            >
              <option value="1">{t('settings.vatPeriod.month')}</option>
              <option value="3">{t('settings.vatPeriod.quarter')}</option>
              <option value="12">{t('settings.vatPeriod.year')}</option>
            </select>
          </label>
          <label className="span2 settings-practice">
            <span>{t('settings.fields.Harjoitus')}</span>
            <span className="settings-practice-row">
              <input
                type="checkbox"
                aria-label={t('settings.fields.Harjoitus')}
                checked={isPracticeValue(company.Harjoitus)}
                onChange={(e) => {
                  if (!e.target.checked && !window.confirm(t('settings.practiceOffWarning'))) {
                    return
                  }
                  setCompany({ ...company, Harjoitus: e.target.checked ? 'ON' : 'EI' })
                }}
              />
              <span className="muted field-hint">{t('settings.fields.HarjoitusHelp')}</span>
            </span>
          </label>
        </div>
        <button type="submit" className="btn-primary">
          {t('settings.save')}
        </button>
      </form>

      <h3 id="fiscalPeriods">{t('settings.financialYears')}</h3>
      <table className="ledger-table zebra">
        <thead>
          <tr>
            <th>{t('settings.year')}</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.starts}>
              <td>
                {formatDate(p.starts)} – {formatDate(p.ends)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        <a href="#/fiscal-periods">{t('settings.manageFiscalPeriods')}</a>
      </p>

      <h3>{t('settings.allocations')}</h3>
      <table className="ledger-table zebra">
        <thead>
          <tr>
            <th>{t('table.name')}</th>
            <th>{t('settings.kind')}</th>
          </tr>
        </thead>
        <tbody>
          {kps.map((k) => (
            <tr key={k.id}>
              <td>{k.id === 0 ? t('common.general') : k.name}</td>
              <td>{allocationTypeName(k.type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="filters"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await saveAllocation({ name: newKp, type: 1 })
            setNewKp('')
            reload()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <label>
          {t('settings.newCostCentre')}
          <input value={newKp} onChange={(e) => setNewKp(e.target.value)} required />
        </label>
        <button type="submit" className="btn-secondary">
          {t('settings.add')}
        </button>
      </form>

      <h3>{t('settings.storage.title')}</h3>
      <p className="muted">
        <a href="#/settings/storage">{t('settings.storage.link')}</a>
      </p>
    </div>
  )
}
