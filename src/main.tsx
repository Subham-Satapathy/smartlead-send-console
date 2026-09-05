import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { ToastProvider } from '@/components/Toast'
import { IS_MOCK } from '@/common/constants'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // api/index.ts already retries transient GET failures with backoff — avoid
      // compounding that with react-query's own default retry-of-3.
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

/**
 * Starts the mock backend (if enabled) and mounts the React app.
 * @returns A promise that resolves once the app has been rendered.
 */
async function bootstrap() {
  if (IS_MOCK) {
    const { startMockBackend } = await import('@/mocks/browser')
    await startMockBackend()
  }

  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

bootstrap()
