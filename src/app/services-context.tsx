/**
 * `ServicesProvider` is the single composition root in the React tree.
 *
 * Why a context and not a module singleton:
 *   - `App.tsx` previously called `createServices()` on every render, and pages
 *     read from a cached `getServices()` singleton. That meant two `Services`
 *     bags coexisted per app session, with their own `PlayerCoordinator`,
 *     `MockMusicRepository` and `FakeAudioEngine`. Strict-mode renders and HMR
 *     could double-subscribe the engine and platform events (execution
 *     handbook §一阶段 1, item §1.1).
 *   - Owning the lifecycle inside React guarantees that exactly one `start()`
 * fires on mount and exactly one `dispose()` on unmount, regardless of how
 * many times the component re-renders.
 */

import type { ReactNode } from '@lynx-js/react';
import { createContext, useContext, useEffect, useRef } from '@lynx-js/react';

import type { Services } from './services.js';

const ServicesContext = createContext<Services | null>(null);

export interface ServicesProviderProps {
  services: Services;
  children: ReactNode;
}

/**
 * Provide a `Services` instance to the React tree. Calls `start()` exactly
 * once after mount and `dispose()` exactly once on unmount.
 */
export function ServicesProvider({ services, children }: ServicesProviderProps) {
  // Ref guards: Strict Mode mounts the effect twice in development. The body
  // is idempotent via `start()`/`dispose()` itself, and the ref prevents a
  // double-dispose tearing down a re-mounted instance.
  const disposedRef = useRef(false);

  useEffect(() => {
    services.start();
    return () => {
      if (disposedRef.current) return;
      disposedRef.current = true;
      services.dispose();
    };
  }, [services]);

  return (
    <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
  );
}

/**
 * Read the current `Services` from context. Throws when used outside a
 * `ServicesProvider` — silent fallbacks were the bug we are fixing.
 */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error(
      'useServices() called outside <ServicesProvider>. ' +
        'Wrap the app in ServicesProvider at the root.',
    );
  }
  return services;
}