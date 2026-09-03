import { LOCALES, type Locale } from './types'
import { setLocale, tIn } from './engine'
import { TilariMark } from '../shared/TilariMark'

function suggestedLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null
  const tag = (navigator.language || '').toLowerCase()
  if (tag.startsWith('fi')) return 'fi'
  if (tag.startsWith('sv')) return 'sv'
  if (tag.startsWith('de')) return 'de'
  if (tag.startsWith('en')) return 'en'
  return null
}

export function LanguagePicker() {
  const suggested = suggestedLocale()

  return (
    <div className="locale-dialog-backdrop">
      <section
        className="engine-dialog file-prompt locale-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locale-dialog-title"
      >
        <p className="locale-dialog-brand">
          <TilariMark />
          Tilari
        </p>
        <h1 id="locale-dialog-title" className="locale-dialog-titles">
          {LOCALES.map((item) => (
            <span key={item.id} lang={item.id}>
              {tIn(item.id, 'app.chooseLanguage')}
            </span>
          ))}
        </h1>
        <div className="locale-dialog-langs">
          {LOCALES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === suggested ? 'file-btn locale-dialog-lang' : 'file-btn-secondary locale-dialog-lang'
              }
              lang={item.id}
              aria-current={item.id === suggested ? 'true' : undefined}
              onClick={() => setLocale(item.id)}
            >
              {item.nativeName}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
