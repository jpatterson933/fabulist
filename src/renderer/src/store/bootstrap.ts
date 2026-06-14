import { useStore } from './index'
import { installErrorReporting } from '@/lib/errors'

/**
 * Wire the main→renderer event subscriptions, the flush-on-unload guard, and the
 * initial loads. Previously this lived loose at module scope in main.tsx; giving
 * it one named entry point keeps app lifecycle wiring in a single place.
 */
export function bootstrap(): void {
  // Route uncaught renderer errors + rejections into the reporting path
  // (forwarded to the terminal via the main-process diagnostics bridge).
  installErrorReporting()

  if (typeof window.fabulist === 'undefined') {
    console.error('[bootstrap] window.fabulist is undefined — the preload bridge did not load')
    return
  }

  const store = useStore.getState()

  window.fabulist.agent.onEvent((e) => useStore.getState().handleAgentEvent(e))
  window.fabulist.doc.onExternalChange((id, content) =>
    useStore.getState().handleExternalChange(id, content)
  )
  window.fabulist.comments.onChanged((id) => {
    if (useStore.getState().activeId === id) useStore.getState().reloadThreads()
  })

  window.addEventListener('beforeunload', () => {
    const { activeId } = useStore.getState()
    if (activeId) {
      void useStore.getState().flushWrite()
      void window.fabulist.doc.snapshot(activeId, 'Edited')
    }
  })

  void store.loadDocs()
  void store.loadModels()
}
