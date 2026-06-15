import { useStore } from '@/store'
import { selectComments } from '@/store/selectors'
import StudioChat from '@/studio/StudioChat'
import StudioComments from '@/studio/StudioComments'
import TestThread from '@/studio/TestThread'

/**
 * The Skill Studio sidebar — mirrors the writing app's tabbed sidebar, but with
 * Chat (the authoring agent) / Comments (highlight → note → into the chat) / Test
 * (the jailed sandbox run).
 */
export default function StudioSidebar({ slug }: { slug: string }): React.JSX.Element {
  const tab = useStore((s) => s.studioTab)
  const setTab = useStore((s) => s.setStudioTab)
  const draft = useStore((s) => s.studioDraft)
  const count = useStore(selectComments(slug)).length
  const badge = count + (draft ? 1 : 0)

  return (
    <aside className="sidebar">
      <nav className="sidebar-tabs">
        <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}>
          Chat
        </button>
        <button className={tab === 'comments' ? 'is-active' : ''} onClick={() => setTab('comments')}>
          Comments{badge > 0 && <span className="tab-badge">{badge}</span>}
        </button>
        <button className={tab === 'test' ? 'is-active' : ''} onClick={() => setTab('test')}>
          Test
        </button>
      </nav>
      <div className="sidebar-body">
        {tab === 'chat' && <StudioChat slug={slug} />}
        {tab === 'comments' && <StudioComments slug={slug} />}
        {tab === 'test' && <TestThread slug={slug} />}
      </div>
    </aside>
  )
}
