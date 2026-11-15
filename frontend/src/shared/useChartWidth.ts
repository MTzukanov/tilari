import { useLayoutEffect, useRef, useState } from 'react'

const MIN_WIDTH = 280

/**
 * The width a hand-drawn SVG chart lays itself out at: its box's CSS width, at most `max`. A chart
 * drawn at a fixed 680 and shrunk to a phone shrinks its text with it; drawn at the box's width the
 * text keeps its size and the chart gets fewer labels instead. Without a box (tests) it is `max`.
 */
export function useChartWidth(max: number) {
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(max)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.round(Math.min(max, Math.max(MIN_WIDTH, w))))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [max])
  return { ref, width }
}

/** Every how many points a label fits, `gap` px apart at least. */
export function labelEvery(count: number, plotWidth: number, gap: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / gap))))
}
