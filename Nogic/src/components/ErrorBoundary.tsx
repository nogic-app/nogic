import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  remountKey: number;
}

// Catches render-time/lifecycle errors in a panel so a crashing tab never
// blanks the window. Shows a calm message + raw error + reload button that
// remounts (and resets) the children. Tokens per DESIGN.md.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, remountKey: 0 };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, remountKey: 0 };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] panel crashed:", error, errorInfo.componentStack);
  }

  handleReload = (): void => {
    this.setState((state) => ({ error: null, remountKey: state.remountKey + 1 }));
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <section
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-[var(--text-primary)]"
        >
          <p className="text-base font-medium">Something went wrong in this panel.</p>
          <details className="w-full text-meta text-[var(--text-secondary)]">
            <summary className="cursor-pointer underline underline-offset-4">
              Error details
            </summary>
            <pre className="mt-1 text-[12px] font-mono whitespace-pre-wrap">
              {`${this.state.error?.message ?? ""}\n${this.state.error?.stack ?? ""}`}
            </pre>
          </details>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent-subtle)]"
          >
            Reload panel
          </button>
        </section>
      );
    }
    return <div key={this.state.remountKey}>{this.props.children}</div>;
  }
}
