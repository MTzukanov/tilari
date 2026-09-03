/** UI font preference (localStorage). Only offers faces detected on this device. */

export const FONT_STORAGE_KEY = 'tilari.font'
export const FONT_CSS_VAR = '--tilari-font'
export const DEFAULT_FONT_ID = 'system-ui'

export type FontOption = {
  id: string
  /** Short label shown in the picker (face name). */
  label: string
  /** CSS font-family value applied to the document. */
  stack: string
  /** Face to probe; null = always offered (default / generics). */
  detect: string | null
}

/** Candidates — filtered at runtime to faces present on this machine. */
export const FONT_CANDIDATES: FontOption[] = [
  {
    id: DEFAULT_FONT_ID,
    label: 'System UI',
    stack: 'system-ui, sans-serif',
    detect: null,
  },
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif', detect: 'Arial' },
  { id: 'segoe', label: 'Segoe UI', stack: '"Segoe UI", Arial, sans-serif', detect: 'Segoe UI' },
  { id: 'ubuntu', label: 'Ubuntu', stack: 'Ubuntu, sans-serif', detect: 'Ubuntu' },
  {
    id: 'ubuntu-sans',
    label: 'Ubuntu Sans',
    stack: '"Ubuntu Sans", Ubuntu, sans-serif',
    detect: 'Ubuntu Sans',
  },
  {
    id: 'dejavu',
    label: 'DejaVu Sans',
    stack: '"DejaVu Sans", sans-serif',
    detect: 'DejaVu Sans',
  },
  {
    id: 'liberation',
    label: 'Liberation Sans',
    stack: '"Liberation Sans", Arial, sans-serif',
    detect: 'Liberation Sans',
  },
  { id: 'noto', label: 'Noto Sans', stack: '"Noto Sans", sans-serif', detect: 'Noto Sans' },
  { id: 'cantarell', label: 'Cantarell', stack: 'Cantarell, sans-serif', detect: 'Cantarell' },
  { id: 'roboto', label: 'Roboto', stack: 'Roboto, Arial, sans-serif', detect: 'Roboto' },
  {
    id: 'helvetica',
    label: 'Helvetica',
    stack: 'Helvetica, Arial, sans-serif',
    detect: 'Helvetica',
  },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif', detect: 'Verdana' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif', detect: 'Tahoma' },
  {
    id: 'trebuchet',
    label: 'Trebuchet MS',
    stack: '"Trebuchet MS", sans-serif',
    detect: 'Trebuchet MS',
  },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, serif', detect: 'Georgia' },
  {
    id: 'times',
    label: 'Times New Roman',
    stack: '"Times New Roman", Times, serif',
    detect: 'Times New Roman',
  },
  {
    id: 'courier',
    label: 'Courier New',
    stack: '"Courier New", Courier, monospace',
    detect: 'Courier New',
  },
  {
    id: 'consolas',
    label: 'Consolas',
    stack: 'Consolas, "Courier New", monospace',
    detect: 'Consolas',
  },
]

const byId = new Map(FONT_CANDIDATES.map((o) => [o.id, o]))

/** Canvas width probe — true when `family` renders differently from base faces. */
export function isFontInstalled(family: string): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const probe = 'mmmmmmmmmmlli Ww@ÅÄÖ'
  const size = '72px'
  const quoted = family.includes(' ') ? `"${family}"` : family
  for (const base of ['monospace', 'sans-serif', 'serif'] as const) {
    ctx.font = `${size} ${base}`
    const baseW = ctx.measureText(probe).width
    ctx.font = `${size} ${quoted}, ${base}`
    if (ctx.measureText(probe).width !== baseW) return true
  }
  return false
}

export function listAvailableFonts(): FontOption[] {
  return FONT_CANDIDATES.filter((o) => o.detect == null || isFontInstalled(o.detect))
}

export function loadFontId(): string {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY)
    if (!raw) return DEFAULT_FONT_ID
    // Migrate previous default id.
    if (raw === 'default') return DEFAULT_FONT_ID
    if (byId.has(raw)) return raw
  } catch {
    /* private mode */
  }
  return DEFAULT_FONT_ID
}

export function saveFontId(id: string): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, id)
  } catch {
    /* private mode */
  }
}

export function fontStackFor(id: string): string {
  return byId.get(id)?.stack ?? byId.get(DEFAULT_FONT_ID)!.stack
}

/** Apply CSS variable on :root. Call at startup and when the user changes font. */
export function applyFont(id: string = loadFontId()): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(FONT_CSS_VAR, fontStackFor(id))
}

export function setFont(id: string): void {
  const next = byId.has(id) ? id : DEFAULT_FONT_ID
  saveFontId(next)
  applyFont(next)
}
