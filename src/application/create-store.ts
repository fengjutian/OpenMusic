/**
 * Minimal observable store. Deliberately hand-rolled instead of pulling in a
 * state library: OpenMusic has four stores, and the only requirement is that
 * components subscribe to *slices* (spec §6 "为 Player 建立细粒度 selector，
 * 避免进度每秒变化导致整个应用重渲染").
 *
 * `useSyncExternalStore` is provided by @lynx-js/react via
 * @lynx-js/use-sync-external-store.
 */

export type Listener = () => void;

export interface Store<T> {
  getState(): T;
  setState(updater: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
  /** Stable snapshot identity for `useSyncExternalStore`. */
  getSlice: <K extends keyof T>(key: K) => () => T[K];
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => state,
    setState(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      let changed = false;
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(state[key], patch[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSlice:
      <K extends keyof T>(key: K) =>
      () =>
        state[key],
  };
}