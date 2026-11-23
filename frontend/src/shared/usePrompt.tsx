import { useCallback, useEffect, useRef, useState } from 'react'
import { PromptDialog } from './PromptDialog'

type Question = {
  key: number
  label: string
  value: string
  inputMode?: 'text' | 'numeric'
  answer: (text: string | null) => void
}

/**
 * `window.prompt` in the page: `ask(label, suggestion)` opens `PromptDialog` and resolves to the
 * text, or null when cancelled. Render `dialog` anywhere in the caller (it portals to the body).
 */
export function usePrompt() {
  const [question, setQuestion] = useState<Question | null>(null)
  const openRef = useRef<Question | null>(null)
  const seqRef = useRef(0)

  const ask = useCallback(
    (label: string, value = '', opts: { inputMode?: 'text' | 'numeric' } = {}) =>
      new Promise<string | null>((resolve) => {
        // A newer question replaces one still open, which answers null.
        openRef.current?.answer(null)
        seqRef.current += 1
        const next: Question = { key: seqRef.current, label, value, ...opts, answer: resolve }
        openRef.current = next
        setQuestion(next)
      }),
    [],
  )

  const done = useCallback((text: string | null) => {
    const open = openRef.current
    openRef.current = null
    // Closed first, so focus is back on the page when the caller goes on.
    setQuestion(null)
    open?.answer(text)
  }, [])

  // A question open when the page goes away answers null, so its caller does not wait forever.
  useEffect(
    () => () => {
      openRef.current?.answer(null)
      openRef.current = null
    },
    [],
  )

  // In a fragment of its own, so its key never meets a sibling's in the caller (BookViews' key={dbKey}).
  const dialog = (
    <>
      {question ? (
        <PromptDialog
          key={question.key}
          label={question.label}
          value={question.value}
          inputMode={question.inputMode}
          onDone={done}
        />
      ) : null}
    </>
  )

  return { ask, dialog }
}
