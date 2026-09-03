import { useI18n } from '../i18n'

export function HelpView() {
  const { t } = useI18n()
  return (
    <div className="ledger">
      <h2>{t('help.title')}</h2>
      <p>{t('help.intro')}</p>
      <ul className="help-list">
        <li>{t('help.li1', { start: t('nav.start') })}</li>
        <li>{t('help.li2', { newVoucher: t('nav.new') })}</li>
        <li>
          {t('help.li3', { browse: t('nav.browse'), reportsHub: t('nav.reports') })}
        </li>
        <li>{t('help.li4')}</li>
      </ul>
      <p>
        <a href="https://github.com/MTzukanov/tilari/blob/main/docs/SCOPE.md" rel="noreferrer">
          {t('help.limitations')}
        </a>
      </p>
      <p>
        <a href="https://github.com/MTzukanov/tilari/discussions" rel="noreferrer">
          {t('help.discussions')}
        </a>
      </p>
    </div>
  )
}
