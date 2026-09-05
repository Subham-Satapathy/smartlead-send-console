import { useEffect, useState } from 'react'

/**
 * Forces a re-render on an interval so relative-time strings ("3s ago") stay live.
 * @param intervalMs - Re-render interval in milliseconds. Defaults to 1000.
 * @returns Nothing; the hook only triggers re-renders as a side effect.
 */
export function useTicker(intervalMs = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

/**
 * Returns a value that only updates after it has stayed unchanged for `delayMs`.
 * @param value - The value to debounce.
 * @param delayMs - Debounce delay in milliseconds. Defaults to 300.
 * @returns The debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

/**
 * Tracks whether the document tab is currently visible, so callers can pause
 * background polling when it isn't.
 * @returns `true` while the tab is visible, `false` while it's backgrounded.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

/**
 * Creates a minimal external store (useSyncExternalStore pattern) for small bits of client/UI state.
 * @param initial - The store's initial value.
 * @returns An object with `get`, `set`, and `subscribe` methods.
 */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    get: () => state,
    set: (next: T | ((prev: T) => T)) => {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      listeners.forEach((l) => l())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
