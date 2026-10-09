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

/**
 * @deprecated Use `useStoreSlice` for the common case.
 *
 * This hook exists for callers that need a derived projection that
 * `useStoreSlice` cannot express cheaply (e.g. computing a list of liked
 * track objects from `likedTrackIds` joined with the catalog). The
 * implementation deliberately avoids writing to a ref during render, which
 * is why it is more involved than a one-liner.
 *
 * Replace with `useSyncExternalStore` plus a store that exposes
 * `subscribeWithSelector` once the player/coordinator refactor lands —
 * see the review note "useStoreSelector 抗 ref-during-render".
 */
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