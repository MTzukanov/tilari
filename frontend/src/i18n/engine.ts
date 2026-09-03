import fi from './locales/fi.json'
import sv from './locales/sv.json'
import en from './locales/en.json'
import de from './locales/de.json'
import {
  DEFAULT_FORMAT_LOCALE,
  DEFAULT_LOCALE,
  FORMAT_STORAGE_KEY,
  LOCALES,
  STORAGE_KEY,
  isLocale,
  type Locale,
  type MessageDict,
} from './types'

const catalogs: Record<Locale, MessageDict> = {
  fi: fi as MessageDict,
  sv: sv as MessageDict,
  en: en as MessageDict,
  de: de as MessageDict,
}

const fallback = catalogs.fi

let current: Locale = DEFAULT_LOCALE
let currentFormat: Locale = DEFAULT_FORMAT_LOCALE
let chosen = false
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((fn) => fn())
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore quota / private mode */
  }
}

function lookup(dict: MessageDict, key: string): string | undefined {
  const parts = key.split('.')
  let node: string | MessageDict | undefined = dict
  for (let i = 0; i < parts.length; i += 1) {
    if (node == null || typeof node === 'string') return undefined
    const rest = parts.slice(i).join('.')
    const direct = node[rest]
    if (typeof direct === 'string') return direct
    node = node[parts[i]]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  )
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(catalogs[current], key) ?? lookup(fallback, key)
  if (raw == null) return key
  return interpolate(raw, vars)
}

export function tIn(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(catalogs[locale], key) ?? lookup(fallback, key)
  if (raw == null) return key
  return interpolate(raw, vars)
}

export function getLocale(): Locale {
  return current
}

export function getFormatLocale(): Locale {
  return currentFormat
}

export function getBcp47(): string {
  return LOCALES.find((l) => l.id === currentFormat)?.bcp47 ?? 'fi-FI'
}

export function localeIsFilled(id: Locale = current): boolean {
  return LOCALES.find((l) => l.id === id)?.filled ?? false
}

export function isLocaleChosen(): boolean {
  return chosen
}

export function setLocale(next: Locale): void {
  if (chosen && next === current) return
  current = next
  chosen = true
  persist(STORAGE_KEY, next)
  if (typeof document !== 'undefined') document.documentElement.lang = next
  notify()
}

export function forgetLocale(): void {
  chosen = false
  current = DEFAULT_LOCALE
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = DEFAULT_LOCALE
  notify()
}

export function setFormatLocale(next: Locale): void {
  if (next === currentFormat) return
  currentFormat = next
  persist(FORMAT_STORAGE_KEY, next)
  notify()
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function loadStoredLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* ignore */
  }
  return null
}

export function loadStoredFormatLocale(): Locale {
  try {
    const saved = localStorage.getItem(FORMAT_STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* ignore */
  }
  return DEFAULT_FORMAT_LOCALE
}

export function initLocale(locale?: Locale, formatLocale: Locale = loadStoredFormatLocale()): void {
  const stored = loadStoredLocale()
  if (locale != null) {
    current = locale
    chosen = true
  } else if (stored) {
    current = stored
    chosen = true
  } else {
    current = DEFAULT_LOCALE
    chosen = false
  }
  currentFormat = formatLocale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = chosen ? current : DEFAULT_LOCALE
  }
}
