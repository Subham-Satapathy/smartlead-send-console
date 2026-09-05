import { ApiError } from '@/api'
import { Button } from './Button'

/**
 * Converts a caught error into a user-facing message.
 * @param error - The error thrown by a query or mutation.
 * @returns A human-readable message, tailored to the {@link ApiError} kind if applicable.
 */
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':
        return 'Could not reach the server. Check your connection and try again.'
      case 'timeout':
        return 'The request timed out. The server may be slow right now.'
      case 'server':
        return 'The server hit an error processing this request.'
      case 'parse':
        return 'The server returned data in an unexpected shape.'
      default:
        return error.message
    }
  }
  return 'Something went wrong.'
}

/**
 * An inline error panel with a human-readable message and a retry button.
 * @param props - The caught error and a retry callback.
 * @returns The rendered error panel.
 */
export function InlineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-red-700">{describe(error)}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
