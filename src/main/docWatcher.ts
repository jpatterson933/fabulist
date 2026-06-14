import { watch } from 'node:fs'
import { Debouncer } from './debounce'

export interface DocWatcher {
  close(): void
}

/**
 * Watch `dir` and invoke `onChange(filename)` — debounced per file — only for
 * the named files. The "is this our own echo / read the file / emit" policy
 * stays with the caller; this owns just the watch + debounce mechanics that
 * used to be tangled into IPC channel registration.
 */
export function watchFiles(
  dir: string,
  files: string[],
  onChange: (filename: string) => void,
  delayMs = 150
): DocWatcher {
  const debouncer = new Debouncer(delayMs)
  const watcher = watch(dir, (_event, filename) => {
    if (!filename || !files.includes(filename)) return
    debouncer.run(filename, () => onChange(filename))
  })
  return {
    close() {
      watcher.close()
      debouncer.clear()
    }
  }
}
