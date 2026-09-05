import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  variant?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
}

/**
 * A modal confirm/cancel dialog for destructive or otherwise consequential actions.
 * @param props - Open state, title/description text, button labels, and the confirm handler.
 * @returns The rendered dialog (portaled; renders nothing visible while closed).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = 'primary',
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-white p-5 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-slate-900">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-500">{description}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant={variant} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
