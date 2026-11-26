import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected display issue occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Infirmary UI recovered from render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.06)] text-center space-y-4">
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold text-slate-900 font-display tracking-tight">
                Display Interrupted
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                All student health records are safely saved. Click below to restore the infirmary workspace.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="h-9 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restore View
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
