import { Component, type ReactNode } from 'react'
import { errorMessage } from '@shared/errors'
import { useStore } from '@/store'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Top-level safety net: a render-time throw anywhere below here shows a fallback
 * (and reports through the same error path) instead of React unmounting the whole
 * tree to a blank screen — which is exactly what an unstable selector did before.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    useStore.getState().reportError(error, 'Something went wrong')
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="app-crash" role="alert">
        <h2>Something went wrong</h2>
        <p className="app-crash-detail">{errorMessage(this.state.error)}</p>
        <button className="btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
