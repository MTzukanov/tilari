export type Locale = 'fi' | 'sv' | 'en' | 'de'

export type MessageDict = { [key: string]: string | MessageDict }

export type LocaleInfo = {
  id: Locale
  nativeName: string
  bcp47: string
  filled: boolean
}

export const LOCALES: LocaleInfo[] = [
  { id: 'fi', nativeName: 'Suomi', bcp47: 'fi-FI', filled: true },
  { id: 'sv', nativeName: 'Svenska', bcp47: 'sv-SE', filled: true },
  { id: 'en', nativeName: 'English', bcp47: 'en-GB', filled: true },
  { id: 'de', nativeName: 'Deutsch', bcp47: 'de-DE', filled: true },
]

export const DEFAULT_LOCALE: Locale = 'fi'
export const DEFAULT_FORMAT_LOCALE: Locale = 'fi'
export const STORAGE_KEY = 'tilari.locale'
export const FORMAT_STORAGE_KEY = 'tilari.formats'

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'fi' || value === 'sv' || value === 'en' || value === 'de'
}
