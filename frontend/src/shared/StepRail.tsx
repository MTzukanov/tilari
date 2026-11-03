import { Pill } from './Pill'

export type StepTone = 'neutral' | 'ok' | 'warn' | 'crit'

export type RailStep = {
  label: string
  /** How it stands, as a pill in `tone`. */
  state: string
  tone: StepTone
  date?: string
}

/**
 * Steps that follow each other, joined by a line that turns green up to the last one done. A narrow
 * container lists them one under the other. The number in a dot gives way to a check or an exclamation mark.
 */
export function StepRail({ steps }: { steps: RailStep[] }) {
  return (
    <div className="step-rail-box">
      <ol className="step-rail">
        {steps.map((step, i) => (
          <li key={step.label} className={`step step-${step.tone}`}>
            <span className="step-dot" aria-hidden="true">
              {step.tone === 'ok' ? '✓' : step.tone === 'crit' ? '!' : i + 1}
            </span>
            <span className="step-label">{step.label}</span>
            <span className="step-meta">
              <Pill tone={step.tone}>{step.state}</Pill>
              {step.date ? <span className="num-text">{step.date}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
