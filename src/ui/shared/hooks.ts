/**
 * Data-fetching hooks shared by every page.
 *
 * `useAsyncResource` is the single place that implements the spec §10.2 rules:
 * cancellation of superseded requests, and the loading / success / empty / error
 * distinction.
 */

import { useCallback, useEffect, useRef, useState } from '@lynx-js/react';

import { AppError, isCancellation } from '../../domain/errors.js';
import type { AppErrorKind } from '../../domain/errors.js';

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'empty'; data: T; error: null }
  | { status: 'error'; data: null; error: AppError };

export interface AsyncResource<T> {
  state: AsyncState<T>;
  reload: () => void;
}

export function useAsyncResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options?: { isEmpty?: (data: T) => boolean },
): AsyncResource<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const generation = ++generationRef.current;

    setState({ status: 'loading', data: null, error: null });

    fetcher(controller.signal)
      .then((data) => {
        // A stale response must never overwrite a newer one (spec §10.2).
        if (generation !== generationRef.current) return;
        const empty = options?.isEmpty?.(data) ?? false;
        setState({ status: empty ? 'empty' : 'success', data, error: null });
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current) return;
        if (isCancellation(error)) return;
        setState({ status: 'error', data: null, error: AppError.from(error) });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, reload };
}

export function errorKind(error: AppError): AppErrorKind {
  return error.kind;
}

/** Debounce that cancels the previous timer, used by the search field. */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return useCallback(
    (...args: A) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );
}