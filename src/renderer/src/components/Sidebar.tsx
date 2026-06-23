import { useStore } from '@/store'
import ChatPanel from '@/components/ChatPanel'
import HistoryPanel from '@/components/HistoryPanel'

export default function Sidebar({ docId }: { docId: string }): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)

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
        </nav>
        <div className="sidebar-body">
          {tab === 'chat' && <ChatPanel docId={docId} />}
          {tab === 'history' && <HistoryPanel />}
        </div>
      </div>
    </aside>
  )
}
