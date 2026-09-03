import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  getFormatLocale,
  getLocale,
  isLocaleChosen,
  setFormatLocale,
  setLocale,
  subscribeLocale,
  t,
} from './engine'
import { LanguagePicker } from './LanguagePicker'
import { LOCALES, type Locale } from './types'

type I18nValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  formatLocale: Locale
  setFormatLocale: (next: Locale) => void
  t: typeof t
  locales: typeof LOCALES
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  const formatLocale = useSyncExternalStore(subscribeLocale, getFormatLocale, getFormatLocale)
  const chosen = useSyncExternalStore(subscribeLocale, isLocaleChosen, isLocaleChosen)
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, formatLocale, setFormatLocale, t, locales: LOCALES }),
    [locale, formatLocale],
  )
  return createElement(
    I18nContext.Provider,
    { value },
    chosen ? children : createElement(LanguagePicker),
  )
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
