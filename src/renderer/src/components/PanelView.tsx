import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { PanelDef, PanelViewKind } from '@shared/harness'
import { useStore } from '@/store'
import Markdown from '@/components/Markdown'
import { baseExtensions, codeLanguageExtensions } from '@/editor/extensions'

/**
 * Harness panels: views over project files, declared in fabulist.json and
 * opened as tabs. Each `view` kind is a row in PANEL_VIEWS — adding a kind
 * (cards, checklist, timeline…) is one component plus one entry here, plus
 * the enum value in the schema descriptor. Sources re-read (and asset views
 * re-mount) whenever the file list refreshes (agent edits and external changes
 * both trigger that).
 */

interface PanelViewProps {
  panel: PanelDef
  /** file text for textual views; null for asset views (image, web) */
  content: string | null
  /** fab-project:// URL of the source, cache-busted per refresh */
  sourceUrl: string
}

function MarkdownPanel({ content }: PanelViewProps): React.JSX.Element {
  return <Markdown text={content ?? ''} />
}

/** Read-only CodeMirror over the source, with by-extension highlighting. */
function CodePanel({ panel, content }: PanelViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || content === null) return
    let view: EditorView | null = null
    let cancelled = false
    void codeLanguageExtensions(panel.source).then((lang: Extension[]) => {
      if (cancelled || !hostRef.current) return
      view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: content,
          extensions: [...baseExtensions(), ...lang, EditorState.readOnly.of(true)]
        })
      })
    })
    return () => {
      cancelled = true
      view?.destroy()
    }
  }, [panel.source, content])

  return <div className="panel-code" ref={hostRef} />
}

function ImagePanel({ panel, sourceUrl }: PanelViewProps): React.JSX.Element {
  return <img className="panel-image" src={sourceUrl} alt={panel.title} />
}

function WebPanel({ panel, sourceUrl }: PanelViewProps): React.JSX.Element {
  // sandboxed but scriptable: the page runs as its project's own origin, so it
  // can load its relative assets and nothing outside the project folder
  return (
    <iframe
      className="panel-web"
      src={sourceUrl}
      title={panel.title}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
    />
  )
}

const PANEL_VIEWS: Record<PanelViewKind, (props: PanelViewProps) => React.JSX.Element> = {
  markdown: MarkdownPanel,
  code: CodePanel,
  image: ImagePanel,
  web: WebPanel
}

// asset views load their source by URL; textual views read it over IPC
const ASSET_VIEWS = new Set<PanelViewKind>(['image', 'web'])

export default function PanelView({ panel }: { panel: PanelDef }): React.JSX.Element {
  const projectId = useStore((s) => s.activeProjectId)
  const files = useStore((s) => s.files)
  const [content, setContent] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const isAsset = ASSET_VIEWS.has(panel.view)
  // bump the URL when the file list refreshes so iframe/img pick up edits
  const [rev, setRev] = useState(0)
  useEffect(() => setRev((r) => r + 1), [files])
  const sourceUrl = useMemo(
    () => `fab-project://${projectId}/${panel.source.split('/').map(encodeURIComponent).join('/')}?v=${rev}`,
    [projectId, panel.source, rev]
  )

  useEffect(() => {
    let cancelled = false
    if (!projectId || isAsset) return
    window.fabulist.file
      .read(projectId, panel.source)
      .then((c) => {
        if (!cancelled) {
          setContent(c)
          setMissing(false)
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, panel.source, isAsset, files])

  const View = PANEL_VIEWS[panel.view]
  const ready = isAsset || content !== null

  return (
    <div className={`panel-view ${panel.view === 'web' ? 'panel-view-full' : ''}`}>
      <div className="panel-view-inner">
        <header className="panel-view-head">
          <h1>{panel.title}</h1>
          <span className="panel-view-source">{panel.source}</span>
        </header>
        {missing ? (
          <p className="panel-view-missing">
            The source file <code>{panel.source}</code> doesn&rsquo;t exist yet. Ask the agent to
            create it, or add it yourself.
          </p>
        ) : !ready ? null : View ? (
          <View panel={panel} content={content} sourceUrl={sourceUrl} />
        ) : (
          <p className="panel-view-missing">
            This studio uses a panel view kind (<code>{panel.view}</code>) this version of
            Fabulist doesn&rsquo;t know. Update the app, or change the panel&rsquo;s{' '}
            <code>view</code> in fabulist.json.
          </p>
        )}
      </div>
    </div>
  )
}
