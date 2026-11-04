import React, { Component } from 'react';
import { EmptyState } from '../components/ds/layout/EmptyState';
import { Button } from '../components/ds/foundation/Button';
import { getCM, getStoredLocale } from '../constants/useCM';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex-1 h-full w-full flex items-center justify-center p-4 bg-white dark:bg-bk-main rounded-xl border border-slate-200 dark:border-slate-800 m-4 shadow-xs">
          <EmptyState
            icon="error_outline"
            title={getCM(getStoredLocale()).statusErrorTitle}
            description={this.state.error?.message || getCM(getStoredLocale()).reloadPageHint}
            action={
              <Button variant="outline" onClick={this.handleReload} icon="refresh">
                {getCM(getStoredLocale()).reloadApplication}
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
