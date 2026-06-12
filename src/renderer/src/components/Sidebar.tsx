import { useStore } from '@/store'
import ChatPanel from '@/components/ChatPanel'
import CommentsPanel from '@/components/CommentsPanel'
import HistoryPanel from '@/components/HistoryPanel'

export default function Sidebar({ docId }: { docId: string }): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const openCount = useStore((s) => s.threads.filter((t) => t.status === 'open').length)

  return (
    <aside className="sidebar">
      <nav className="sidebar-tabs">
        <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}>
          Claude
        </button>
        <button className={tab === 'comments' ? 'is-active' : ''} onClick={() => setTab('comments')}>
          Comments{openCount > 0 && <span className="tab-badge">{openCount}</span>}
        </button>
        <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </nav>
      <div className="sidebar-body">
        {tab === 'chat' && <ChatPanel docId={docId} />}
        {tab === 'comments' && <CommentsPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </aside>
  )
}
