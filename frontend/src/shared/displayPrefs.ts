/** UI text scale + content width (localStorage). Applied as CSS vars on :root. */

export const DISPLAY_STORAGE_KEY = 'tilari.display'
export const TEXT_SCALE_CSS_VAR = '--tilari-text-scale'
export const CONTENT_MAX_CSS_VAR = '--tilari-content-max'

export const TEXT_SCALE_STEPS = [
  0.3, 0.4, 0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375,
] as const
export type TextScale = (typeof TEXT_SCALE_STEPS)[number]

export type ContentWidth = 'normal' | 'wide' | 'full'

export type DisplayPrefs = {
  textScale: TextScale
  contentWidth: ContentWidth
}

export const DEFAULT_DISPLAY: DisplayPrefs = {
  textScale: 1,
  contentWidth: 'normal',
}

const WIDTH_CSS: Record<ContentWidth, string> = {
  normal: '1200px',
  wide: '1600px',
  full: '100%',
}

function nearestScale(n: number): TextScale {
  let best: TextScale = 1
  let bestDist = Infinity
  for (const step of TEXT_SCALE_STEPS) {
    const d = Math.abs(step - n)
    if (d < bestDist) {
      best = step
      bestDist = d
    }
  }
  return best
}

export function loadDisplayPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DISPLAY }
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>
    const textScale =
      typeof parsed.textScale === 'number' ? nearestScale(parsed.textScale) : DEFAULT_DISPLAY.textScale
    const contentWidth =
      parsed.contentWidth === 'wide' || parsed.contentWidth === 'full' || parsed.contentWidth === 'normal'
        ? parsed.contentWidth
        : DEFAULT_DISPLAY.contentWidth
    return { textScale, contentWidth }
  } catch {
    return { ...DEFAULT_DISPLAY }
  }
}

export function saveDisplayPrefs(prefs: DisplayPrefs): void {
  try {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode */
  }
}

/** Apply CSS variables on :root. Call at startup and when prefs change. */
export function applyDisplayPrefs(prefs: DisplayPrefs = loadDisplayPrefs()): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty(TEXT_SCALE_CSS_VAR, String(prefs.textScale))
  root.style.setProperty(CONTENT_MAX_CSS_VAR, WIDTH_CSS[prefs.contentWidth])
  root.dataset.contentWidth = prefs.contentWidth
}

export function setDisplayPrefs(patch: Partial<DisplayPrefs>): DisplayPrefs {
  const next: DisplayPrefs = { ...loadDisplayPrefs(), ...patch }
  if (typeof next.textScale === 'number') next.textScale = nearestScale(next.textScale)
  if (next.contentWidth !== 'normal' && next.contentWidth !== 'wide' && next.contentWidth !== 'full') {
    next.contentWidth = DEFAULT_DISPLAY.contentWidth
  }
  saveDisplayPrefs(next)
  applyDisplayPrefs(next)
  return next
}

export function stepTextScale(current: TextScale, delta: -1 | 1): TextScale {
  const idx = TEXT_SCALE_STEPS.indexOf(current)
  const at = idx < 0 ? TEXT_SCALE_STEPS.indexOf(1) : idx
  const next = Math.max(0, Math.min(TEXT_SCALE_STEPS.length - 1, at + delta))
  return TEXT_SCALE_STEPS[next]
}

export function textScaleMin(): TextScale {
  return TEXT_SCALE_STEPS[0]
}

export function textScaleMax(): TextScale {
  return TEXT_SCALE_STEPS[TEXT_SCALE_STEPS.length - 1]
}

export function textScalePercent(scale: TextScale): number {
  return Math.round(scale * 100)
}
