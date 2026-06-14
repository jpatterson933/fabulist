// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { makeFabulist } from '../../helpers/store'
import { useStore } from '@/store'
import ChatPanel from '@/components/ChatPanel'
import App from '@/App'
import ErrorBoundary from '@/components/ErrorBoundary'

// Render smoke-tests: these MOUNT components in a DOM. Node-env logic tests can't
// catch render-time failures — an unstable selector that loops, or a throw that
// blanks the screen. This is the harness that would have caught the ChatPanel
// "Maximum update depth exceeded" regression.

function stubBridge(overrides = {}): void {
  ;(window as unknown as { fabulist: unknown }).fabulist = makeFabulist(overrides)
}

afterEach(() => {
  cleanup()
})

describe('ChatPanel render smoke', () => {
  it('mounts without an infinite render loop when the doc has no chat yet', () => {
    stubBridge()
    useStore.setState({ activeId: 'd', chats: {}, permissions: [], agent: {} })
    // Before the selector fix this threw "Maximum update depth exceeded" on mount.
    expect(() => render(<ChatPanel docId="d" />)).not.toThrow()
  })

  it('renders an existing transcript', () => {
    stubBridge()
    useStore.setState({
      activeId: 'd',
      chats: { d: [{ id: 'm', role: 'assistant', text: 'hello there', at: 0 }] },
      permissions: [],
      agent: {}
    })
    const { getByText } = render(<ChatPanel docId="d" />)
    expect(getByText('hello there')).toBeTruthy()
  })
})

describe('App shell render smoke', () => {
  it('mounts the empty state without a document open', () => {
    stubBridge()
    useStore.setState({ docs: [], activeId: null, lastError: null })
    const { getByText } = render(<App />)
    expect(getByText(/little world/i)).toBeTruthy()
  })
})

describe('ErrorBoundary', () => {
  it('shows a fallback instead of letting a render throw blank the screen', () => {
    stubBridge()
    const Boom = (): never => {
      throw new Error('kaboom')
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(getByText('Something went wrong')).toBeTruthy()
    expect(getByText(/kaboom/)).toBeTruthy()
    spy.mockRestore()
  })
})
