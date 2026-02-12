import React from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

/**
 * Standardized loading state for document operations.
 * Displays a centered spinner with optional custom message.
 */
export function DocumentLoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" className="text-primary-400" />
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Standardized error state for document operations.
 * Displays an error message with optional retry and back actions.
 */
export function DocumentErrorState({
  error,
  onRetry,
  onBack,
  title = 'Something went wrong',
  backLabel = 'Back to Library'
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center p-8">
      <div className="p-4 rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="w-12 h-12" />
      </div>
      <h2 className="text-xl font-bold font-display text-white">{title}</h2>
      {error && (
        <p className="text-muted-foreground max-w-md">{error}</p>
      )}
      <div className="flex gap-2 mt-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
        {onBack && (
          <Button onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {backLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * PDF-specific error fallback component.
 */
export function PdfErrorFallback({ error, resetError }) {
  return (
    <div className="w-full max-w-2xl bg-destructive/10 border border-destructive/20 text-destructive-foreground px-4 py-4 rounded-xl text-sm space-y-2">
      <div className="font-semibold">Failed to render PDF.</div>
      {error?.message && (
        <div className="text-destructive-foreground/80 break-words">{error.message}</div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={resetError}
        className="mt-2"
      >
        Try again
      </Button>
    </div>
  );
}

/**
 * Empty state for when no content is available.
 */
export function DocumentEmptyState({
  title = 'No content available',
  description,
  icon: Icon,
  action
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center p-8">
      {Icon && (
        <div className="p-4 rounded-full bg-muted">
          <Icon className="w-10 h-10 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold font-display">{title}</h3>
      {description && (
        <p className="text-muted-foreground max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}