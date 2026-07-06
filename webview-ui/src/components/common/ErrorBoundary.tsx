import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OrgPulse] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-12">
          <span className="text-2xl" aria-hidden>⚠️</span>
          <p className="text-sm font-medium text-sf-text">Something went wrong rendering this tab.</p>
          <p className="text-xs text-sf-muted max-w-xs">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-2 px-3 py-1.5 text-xs rounded border border-sf-border text-sf-text-2 hover:text-sf-text transition-colors"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
