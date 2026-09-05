import { createStore } from '@/utils'

/**
 * Lets the operator dial network conditions up/down at runtime (see the
 * "Network conditions" control in the top bar) instead of hoping a demo
 * happens to hit a slow/failing request. Read by every mock handler.
 */
export interface ChaosSettings {
  /** Base one-way latency range, in ms, applied to every mocked request. */
  latencyMs: [number, number]
  /** Probability (0-1) an eligible GET fails with a 500. */
  readFailureRate: number
  /** Probability (0-1) an eligible mutation fails with a 500/409. */
  writeFailureRate: number
}

export const PRESETS: Record<string, ChaosSettings> = {
  clean: { latencyMs: [80, 250], readFailureRate: 0, writeFailureRate: 0 },
  normal: { latencyMs: [150, 700], readFailureRate: 0.03, writeFailureRate: 0.05 },
  degraded: { latencyMs: [900, 3500], readFailureRate: 0.18, writeFailureRate: 0.25 },
}

export const chaosStore = createStore<{ preset: keyof typeof PRESETS }>({ preset: 'normal' })

/**
 * Reads the currently active chaos preset's settings.
 * @returns The `ChaosSettings` for the preset currently selected in {@link chaosStore}.
 */
export function currentChaos(): ChaosSettings {
  return PRESETS[chaosStore.get().preset]
}

/**
 * Switches the active chaos preset.
 * @param preset - Key into {@link PRESETS} to activate.
 * @returns Nothing; updates {@link chaosStore}.
 */
export function setChaosPreset(preset: keyof typeof PRESETS) {
  chaosStore.set({ preset })
}

/**
 * Picks a random latency within the active preset's range.
 * @returns A latency in milliseconds.
 */
export function randomLatency(): number {
  const [min, max] = currentChaos().latencyMs
  return min + Math.random() * (max - min)
}

/**
 * Randomly decides whether a mocked request should fail, per the active preset's failure rate.
 * @param kind - Whether the request is a read (GET) or a write (mutation).
 * @returns `true` if the request should simulate a failure.
 */
export function shouldFail(kind: 'read' | 'write'): boolean {
  const rate = kind === 'read' ? currentChaos().readFailureRate : currentChaos().writeFailureRate
  return Math.random() < rate
}

/**
 * Resolves after `ms` milliseconds.
 * @param ms - Delay in milliseconds.
 * @returns A promise that resolves once the delay elapses.
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
