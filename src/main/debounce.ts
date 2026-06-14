/**
 * Per-key debouncer. Multiple rapid calls under the same key collapse to one
 * trailing invocation. Extracted from the inline timer map that the IPC file
 * watcher used to carry, so the debounce policy lives in one tested place.
 */
export class Debouncer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly delayMs: number) {}

  /** Schedule `fn` for `key`, cancelling any pending call for the same key. */
  run(key: string, fn: () => void): void {
    clearTimeout(this.timers.get(key))
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        fn()
      }, this.delayMs)
    )
  }

  /** Cancel every pending call. */
  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }
}
