import { useCallback, useEffect, useRef } from 'react'

/**
 * Keep a scroll container pinned to the bottom as content streams in — but ONLY
 * while the reader is already at (or near) the bottom. Scrolling up to read pauses
 * the follow, so a streaming reply never yanks you back down mid-read; returning to
 * the bottom resumes it. This is the writing-app chat's behavior, lifted here so
 * every chat (document, skill authoring, skill test) shares exactly one of it.
 *
 * Pass the reactive values whose change should re-pin (the transcript, run status,
 * pending cards). `stick()` force-pins for the next update — call it when the user
 * sends, so their own message always scrolls into view.
 */
export function useStickToBottom(signals: unknown[]): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  stick: () => void
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
    // signals is the caller-supplied dependency list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, signals)

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    // within ~a line of the bottom counts as "at the bottom"
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  const stick = useCallback((): void => {
    pinned.current = true
  }, [])

  return { scrollRef, onScroll, stick }
}
