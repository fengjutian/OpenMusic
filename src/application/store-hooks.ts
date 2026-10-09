/**
 * Typed store hooks. Thin wrappers so components never touch `useSyncExternalStore`
 * plumbing, and so a component can subscribe to exactly the slice it renders.
 */

import { useCallback, useRef, useSyncExternalStore } from '@lynx-js/react';
import type { Store } from './create-store.js';

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useStoreSlice<T extends object, K extends keyof T>(
  store: Store<T>,
  key: K,
): T[K] {
  const selector = useRef(store.getSlice(key)).current;
  return useSyncExternalStore(store.subscribe, selector, selector);
}

export function useStoreSelector<T extends object, S>(
  store: Store<T>,
  select: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const snapshot = useRef<{ value: S; initialised: boolean }>({ value: undefined as never, initialised: false });

  const getSnapshot = useCallback(() => {
    const next = select(store.getState());
    if (snapshot.current.initialised && isEqual(snapshot.current.value, next)) {
      return snapshot.current.value;
    }
    snapshot.current = { value: next, initialised: true };
    return next;
  }, [store, select, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function shallowArrayEqual<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}