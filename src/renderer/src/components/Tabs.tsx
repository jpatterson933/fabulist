import { useState } from 'react'
import { useStore } from '@/store'

export default function Tabs(): React.JSX.Element {
  const docs = useStore((s) => s.docs)
  const openDocs = useStore((s) => s.openDocs)
  const activeDoc = useStore((s) => s.activeDoc)
  const setActiveDoc = useStore((s) => s.setActiveDoc)
  const closeTab = useStore((s) => s.closeTab)
  const createDoc = useStore((s) => s.createDoc)

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const titleFor = (file: string): string => docs.find((d) => d.file === file)?.title || file

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setAdding(false)
    setTitle('')
    if (t) await createDoc(t)
  }

  return (
    <div className="tabs-strip">
      {openDocs.map((file) => (
          <div
            key={file}
            className={`tab ${file === activeDoc ? 'is-active' : ''}`}
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

        {adding ? (
          <form
            className="tab-create"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <input
              autoFocus
              value={title}
              placeholder="Document title…"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void submit()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAdding(false)
                  setTitle('')
                }
              }}
            />
          </form>
        ) : (
          <button className="tab-add" title="New document" onClick={() => setAdding(true)}>
            +
          </button>
        )}
    </div>
  )
}
