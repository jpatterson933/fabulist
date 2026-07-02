import { useEffect, useRef, useState } from 'react'
import type { CommandDef } from '@shared/harness'
import { useStore } from '@/store'

// the served port usually isn't bound the instant the process spawns — reload
// the preview a few times over the first seconds, then leave it alone
const PREVIEW_RETRIES_MS = [600, 1600, 3500, 7000]

/**
 * The tab for a studio command: status header with run/stop, the streaming
 * log, and — when the command declares a `preview` URL and is running — the
 * live page beside it. The exact command line is always visible; commands
 * only ever start from a user click.
 */
export default function CommandView({ command }: { command: CommandDef }): React.JSX.Element {
  const run = useStore((s) => s.commandRuns[command.id])
  const runCommand = useStore((s) => s.runCommand)
  const stopCommand = useStore((s) => s.stopCommand)
  const logRef = useRef<HTMLPreElement>(null)
  const running = run?.running ?? false
  const [previewRev, setPreviewRev] = useState(0)

  // retry the preview while the server warms up (cache-busted by rev)
  useEffect(() => {
    if (!running || !command.preview) return
    const timers = PREVIEW_RETRIES_MS.map((ms) => setTimeout(() => setPreviewRev((r) => r + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [running, run?.startedAt, command.preview])

  // keep the log pinned to the bottom unless the user scrolled up
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [run?.log])

  const status = running
    ? 'running'
    : run?.exitCode === undefined || run?.exitCode === null
      ? run
        ? 'stopped'
        : 'not started'
      : run.exitCode === 0
        ? 'finished'
        : `exited (${run.exitCode})`

  return (
    <div className="panel-view panel-view-full">
      <div className="panel-view-inner">
        <header className="panel-view-head command-head">
          <h1>{command.label}</h1>
          <code className="command-line" title="The command line, exactly as it will run">
            {command.run}
          </code>
          <span className={`command-status ${running ? 'is-running' : ''}`}>{status}</span>
          {running && command.preview && (
            <button
              className="btn-ghost btn-small"
              title={`Reload ${command.preview}`}
              onClick={() => setPreviewRev((r) => r + 1)}
            >
              ⟳
            </button>
          )}
          {running ? (
            <button className="btn-ghost btn-small" onClick={() => void stopCommand(command.id)}>
              Stop
            </button>
          ) : (
            <button className="btn-primary btn-small" onClick={() => void runCommand(command.id)}>
              Run
            </button>
          )}
        </header>
        <div className="command-body">
          <pre ref={logRef} className="command-log">
            {run?.log || (running ? '' : 'Not running. Press Run to start it.')}
          </pre>
          {command.preview && running && (
            <iframe
              key={previewRev}
              className="command-preview"
              src={command.preview}
              title={`${command.label} preview`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  )
}
