import * as ToastPrimitive from '@radix-ui/react-toast'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  notify: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Accesses the toast context's `notify` function.
 * @returns The toast context value.
 * @throws {Error} If called outside a {@link ToastProvider}.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let idCounter = 0

/**
 * Provides toast notification state and renders the active toasts.
 * @param props - The subtree that can call {@link useToast}.
 * @returns The provider, wrapping `children` with the toast viewport.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  /**
   * Queues a new toast to be displayed.
   * @param toast - Title, optional description, and variant.
   * @returns Nothing; adds the toast to state.
   */
  const notify = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = ++idCounter
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  /**
   * Removes a toast from state.
   * @param id - Id of the toast to remove.
   * @returns Nothing; removes the toast from state.
   */
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ notify }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            duration={4500}
            onOpenChange={(open) => !open && dismiss(toast.id)}
            className={clsx(
              'rounded-lg border px-4 py-3 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2',
              toast.variant === 'success' && 'border-emerald-200 bg-white text-emerald-800',
              toast.variant === 'error' && 'border-red-200 bg-white text-red-800',
              toast.variant === 'info' && 'border-surface-border bg-white text-slate-800',
            )}
          >
            <ToastPrimitive.Title className="text-sm font-medium">{toast.title}</ToastPrimitive.Title>
            {toast.description && (
              <ToastPrimitive.Description className="mt-1 text-xs opacity-80">
                {toast.description}
              </ToastPrimitive.Description>
            )}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}
