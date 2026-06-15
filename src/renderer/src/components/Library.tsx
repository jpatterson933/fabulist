import { useState } from 'react'
import { useStore } from '@/store'
import { relativeTime } from '@/lib/format'
import WorkspaceSwitcher from '@/studio/WorkspaceSwitcher'

export default function Library(): React.JSX.Element {
  const docs = useStore((s) => s.docs)
  const activeId = useStore((s) => s.activeId)
  const openDoc = useStore((s) => s.openDoc)
  const createDoc = useStore((s) => s.createDoc)
  const cloneDoc = useStore((s) => s.cloneDoc)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setCreating(false)
    setTitle('')
    if (t) await createDoc(t)
  }

  return (
    <aside className="library">
      <div className="library-inner">
        <div className="library-lights" />
        <div className="library-brand">
          <WorkspaceSwitcher />
        </div>

        <div className="library-head">
        <span className="library-label">Documents</span>
        <button className="library-new" onClick={() => setCreating(true)} title="New document">
          +
        </button>
      </div>

      {creating && (
        <form
          className="library-create"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={title}
            placeholder="Title…"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void submit()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCreating(false)
                setTitle('')
              }
            }}
          />
        </form>
      )}

      <nav className="library-list">
        {docs.length === 0 && !creating && (
          <p className="library-empty">No documents yet. Start one with +</p>
        )}
        {docs.map((d) => (
          <div key={d.id} className={`library-item ${d.id === activeId ? 'is-active' : ''}`}>
            <button className="library-item-main" onClick={() => void openDoc(d.id)}>
              <span className="library-item-title">{d.title}</span>
              <span className="library-item-preview">{d.preview || 'Empty'}</span>
              <span className="library-item-meta">
                {relativeTime(d.updatedAt)} · {d.wordCount.toLocaleString()} words
              </span>
            </button>
            {confirmDelete === d.id ? (
              <div className="library-item-confirm">
                <button
                  className="danger"
                  onClick={() => {
                    setConfirmDelete(null)
                    void deleteDoc(d.id)
                  }}
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)}>Keep</button>
              </div>
            ) : (
              <>
                <button
                  className="library-item-clone"
                  title="Clone document — copies the current text into a new document"
                  onClick={() => void cloneDoc(d.id)}
                >
                  ⧉
                </button>
                <button
                  className="library-item-x"
                  title="Delete document"
                  onClick={() => setConfirmDelete(d.id)}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </nav>

        <footer className="library-foot">
          {activeId && (
            <button className="btn-ghost" onClick={() => window.fabulist.library.reveal(activeId)}>
              Reveal in Finder
            </button>
          )}
        </footer>
      </div>
    </aside>
  )
}
