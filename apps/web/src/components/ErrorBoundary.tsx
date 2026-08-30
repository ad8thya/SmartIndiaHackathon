/**
 * Panel isolation. Owned by M6.
 *
 * Five people own five panels. A crash in one of them must not take the command
 * centre down — during the demo, or during the four days before it. Every panel
 * is mounted inside one of these, and the fallback names the owner so the fix
 * goes to the right person.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** shown in the fallback, e.g. "DefectsPanel (M1)" */
  label: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] crashed`, error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-red-300">
          <AlertTriangle size={16} />
          {this.props.label} crashed
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          The rest of the command centre is unaffected. This panel is owned by one person —
          send them the error below.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-ink-900/80 p-2 font-mono text-[11px] text-red-200">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 inline-flex items-center gap-1.5 rounded border border-white/10 bg-ink-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-ink-600"
        >
          <RotateCcw size={13} /> Retry
        </button>
      </div>
    );
  }
}
