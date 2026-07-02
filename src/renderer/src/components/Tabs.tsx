import { useStore } from '@/store'

export default function Tabs(): React.JSX.Element {
  const docs = useStore((s) => s.docs)
  const openDocs = useStore((s) => s.openDocs)
  const activeDoc = useStore((s) => s.activeDoc)
  const setActiveDoc = useStore((s) => s.setActiveDoc)
  const closeTab = useStore((s) => s.closeTab)
  const harness = useStore((s) => s.harness)
  const openPanels = useStore((s) => s.openPanels)
  const activePanel = useStore((s) => s.activePanel)
  const openPanel = useStore((s) => s.openPanel)
  const closePanel = useStore((s) => s.closePanel)
  const setNewDocOpen = useStore((s) => s.setNewDocOpen)

  const commandRuns = useStore((s) => s.commandRuns)

  // a tab slot is a harness panel — or a command's log tab ("command:<id>")
  const panelFor = (id: string): { title: string; hint: string; glyph: string; running?: boolean } | undefined => {
    if (id.startsWith('command:')) {
      const c = harness?.config.commands.find((x) => `command:${x.id}` === id)
      return c && { title: c.label, hint: c.run, glyph: '▸', running: commandRuns[c.id]?.running }
    }
    const p = harness?.config.panels.find((x) => x.id === id)
    return p && { title: p.title, hint: `${p.source} — view from fabulist.json`, glyph: '▦' }
  }

  const titleFor = (file: string): string => docs.find((d) => d.file === file)?.title || file

  return (
    <div className="tabs-strip">
      {openDocs.map((file) => (
          <div
            key={file}
            className={`tab ${file === activeDoc && !activePanel ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              // middle-click closes, like a browser
              if (e.button === 1) {
                e.preventDefault()
                void closeTab(file)
              }
            }}
          >
            <button className="tab-main" onClick={() => void setActiveDoc(file)} title={file}>
              {titleFor(file)}
            </button>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(file)
              }}
            >
              ×
            </button>
          </div>
        ))}

        {openPanels.map((id) => {
          const p = panelFor(id)
          if (!p) return null
          return (
            <div
              key={`panel:${id}`}
              className={`tab tab-panel ${id === activePanel ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closePanel(id)
                }
              }}
            >
              <button className="tab-main" onClick={() => openPanel(id)} title={p.hint}>
                <span className={`tab-panel-glyph ${p.running ? 'is-running' : ''}`} aria-hidden>
                  {p.running ? '●' : p.glyph}
                </span>
                {p.title}
              </button>
              <button
                className="tab-close"
                title="Close view"
                onClick={(e) => {
                  e.stopPropagation()
                  closePanel(id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        <button className="tab-add" title="New document" onClick={() => setNewDocOpen(true)}>
          +
        </button>
    </div>
  )
}
