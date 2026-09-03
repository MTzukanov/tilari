import { useI18n } from '../../../i18n'

export function DeferredView({ module }: { module: 'billing' | 'workflow' }) {
  const { t } = useI18n()
  const title = module === 'billing' ? t('deferred.billing') : t('deferred.workflow')
  return (
    <div className="ledger">
      <h2>{title}</h2>
      <p>{t('deferred.notInVersion')}</p>
      <p className="muted">{t('deferred.salesHint')}</p>
    </div>
  )
}
