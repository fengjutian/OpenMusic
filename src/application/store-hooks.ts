/**
 * Typed store hooks. Thin wrappers so components never touch `useSyncExternalStore`
 * plumbing, and so a component can subscribe to exactly the slice it renders.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from '@lynx-js/react';
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
  const [value, setValue] = useState<S>(() => select(store.getState()));

  const selectRef = useRef(select);
  const isEqualRef = useRef(isEqual);
  useEffect(() => {
    selectRef.current = select;
    isEqualRef.current = isEqual;
  });

  useEffect(() => {
    // Re-sync once on mount in case the store changed between the first render
    // and subscription.
    setValue((prev) => {
      const next = selectRef.current(store.getState());
      return isEqualRef.current(prev, next) ? prev : next;
    });

    return store.subscribe(() => {
      setValue((prev) => {
        const next = selectRef.current(store.getState());
        return isEqualRef.current(prev, next) ? prev : next;
      });
    });
  }, [store]);

  return value;
}

export function shallowArrayEqual<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}