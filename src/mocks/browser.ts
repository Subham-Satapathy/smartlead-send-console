import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { tickSimulation } from './store'

export const worker = setupWorker(...handlers)

let simInterval: ReturnType<typeof setInterval> | undefined

/**
 * Starts the MSW mock service worker and the periodic live-data simulation tick.
 * @returns A promise that resolves once the worker has started.
 */
export async function startMockBackend() {
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
  if (!simInterval) {
    simInterval = setInterval(tickSimulation, 2_500)
  }
}
