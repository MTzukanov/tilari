/** Debounced OPFS persist. WasmBookService owns what to write. */
export class OpfsPersistScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private readonly debounceMs: number
  private readonly flush: () => Promise<void>

  constructor(debounceMs: number, flush: () => Promise<void>) {
    this.debounceMs = debounceMs
    this.flush = flush
  }

  schedule(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void this.flushNow()
      return
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flushNow()
    }, this.debounceMs)
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.inFlight) {
      await this.inFlight
      return
    }
    this.inFlight = this.flush().finally(() => {
      this.inFlight = null
    })
    await this.inFlight
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
