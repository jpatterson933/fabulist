import { useStore } from '@/store'
import { selectComments } from '@/store/selectors'
import { DEFAULT_SIDEBAR } from '@/store/skillStudioSlice'
import StudioChat from '@/studio/StudioChat'
import StudioComments from '@/studio/StudioComments'
import TestThread from '@/studio/TestThread'

/**
 * The Skill Studio sidebar — mirrors the writing app's tabbed sidebar, but with
 * Chat (the authoring agent) / Comments (highlight → note → into the chat) / Test
 * (the jailed sandbox run). Its left edge is a drag handle: pull it left to widen the
 * panel (it won't go narrower than the default); double-click to snap back.
 */
export default function StudioSidebar({ slug }: { slug: string }): React.JSX.Element {
  const tab = useStore((s) => s.studioTab)
  const setTab = useStore((s) => s.setStudioTab)
  const draft = useStore((s) => s.studioDraft)
  const setWidth = useStore((s) => s.setStudioSidebarWidth)
  const count = useStore(selectComments(slug)).length
  const badge = count + (draft ? 1 : 0)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    // start from the ACTUAL rendered width — the track flexes with the window, so it can be
    // wider than the stored value; measuring keeps the edge under the cursor (no jump)
    const aside = (e.currentTarget as HTMLElement).parentElement
    const startW = aside?.getBoundingClientRect().width ?? useStore.getState().studioSidebarWidth
    const onMove = (ev: MouseEvent): void => setWidth(startW + (startX - ev.clientX))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('is-col-resizing')
    }
    document.body.classList.add('is-col-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <aside className="sidebar">
      <div
        className="sidebar-resize"
        onMouseDown={startResize}
        onDoubleClick={() => setWidth(DEFAULT_SIDEBAR)}
        title="Drag to widen · double-click to reset"
      />
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
