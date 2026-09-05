import { Navigate, Route, Routes } from 'react-router-dom'
import { TopBar } from '@/components/TopBar'
import { MailboxesPage } from '@/routes/MailboxesPage'
import { MailboxDetailPage } from '@/routes/MailboxDetailPage'
import { EmailsPage } from '@/routes/EmailsPage'
import { EmailDetailPage } from '@/routes/EmailDetailPage'
import { useEventStream } from '@/queries/useEventStream'

/**
 * The app shell: top bar plus the route table for mailboxes/emails list and detail pages.
 * @returns The rendered app.
 */
export function App() {
  // One app-wide push subscription, not one per screen — see
  // useEventStream's own comment for why this belongs at the root.
  useEventStream()

  return (
    <div className="min-h-screen bg-surface text-slate-700">
      <TopBar />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/mailboxes" replace />} />
          <Route path="/mailboxes" element={<MailboxesPage />} />
          <Route path="/mailboxes/:id" element={<MailboxDetailPage />} />
          <Route path="/emails" element={<EmailsPage />} />
          <Route path="/emails/:id" element={<EmailDetailPage />} />
          <Route path="*" element={<Navigate to="/mailboxes" replace />} />
        </Routes>
      </main>
    </div>
  )
}
