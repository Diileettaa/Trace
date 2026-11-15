import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import DocsLibrary from './DocsLibrary'

class FilesErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void; onBack: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the failure contained to Files: a document preview must never remove Community navigation.
    console.error('Community files panel failed to render', error, info)
  }

  render() {
    if (this.state.error) return <section className="community-files-fallback" role="alert"><h2>Files could not be opened</h2><p>The shared-file page had a loading problem. Community, messages and schedule are still available.</p><div className="row"><button type="button" onClick={this.props.onRetry}>Try Files again</button><button type="button" onClick={this.props.onBack}>Back to Channels</button></div></section>
    return this.props.children
  }
}

/** Keeps the Community shell alive if a document preview or file response is malformed. */
export default function CommunityFilesPanel({ onBack }: { onBack: () => void }) {
  const [attempt, setAttempt] = useState(0)
  return <FilesErrorBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)} onBack={onBack}><DocsLibrary /></FilesErrorBoundary>
}
