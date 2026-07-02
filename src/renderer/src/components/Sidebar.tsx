import { useStore } from '@/store'
import ChatPanel from '@/components/ChatPanel'
import HistoryPanel from '@/components/HistoryPanel'

export default function Sidebar({ projectId }: { projectId: string }): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <nav className="sidebar-tabs">
          <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}>
            Claude
          </button>
          <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>
            History
          </button>
          <button
            className="sidebar-close"
            onClick={toggleSidebar}
            title="Close sidebar  ⌘⇧\"
            aria-label="Close sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </nav>
        <div className="sidebar-body">
          {tab === 'chat' && <ChatPanel projectId={projectId} />}
          {tab === 'history' && <HistoryPanel />}
        </div>
      </div>
    </aside>
  )
}
