import { useEffect, useState } from '@lynx-js/react';

import { AppShell } from '../ui/AppShell.js';
import { ThemeProvider, PLATFORM } from '../ui/shared/theme.js';
import { sessionActions } from '../application/stores.js';
import {
  createDemoServices,
  createProductionServices,
  type Services,
} from './services.js';
import { ServicesProvider } from './services-context.js';

/**
 * Single composition root. `useState` initialiser runs exactly once; every
 * subsequent render returns the cached `Services`. The previous version
 * called `createServices()` inline, which created a brand-new services bag
 * (and a brand-new `PlayerCoordinator` + `FakeAudioEngine`) on every render.
 */
function bootstrapServices(): Services {
  // Phase 2+: replace this branch with the native adapter wiring. For now
  // every boot is a demo build — the capability matrix records it.
  if (hasNativeShell()) {
    return createProductionServices(requireNativeAdapters());
  }
  return createDemoServices();
}

function hasNativeShell(): boolean {
  // The native modules are probed by `createPlatformBridge` in the demo path;
  // once a real shell answers, swap this for an explicit env / build flag.
  return false;
}

function requireNativeAdapters(): never {
  throw new Error(
    'createProductionServices path reached without native adapters — ' +
      'see docs/platform-capability-matrix.md §3.2 (Lynx runtime version).',
  );
}

export function App() {
  const [services] = useState<Services>(() => bootstrapServices());

  useEffect(() => {
    // One-shot platform metrics + analytics. Player subscriptions are owned
    // by `ServicesProvider` (and ultimately `PlayerCoordinator.start()`),
    // so this effect must not subscribe to anything else.
    sessionActions.setSafeArea(services.bridge.safeAreaInsets());
    sessionActions.setWindowSize(services.bridge.windowSize());
    services.analytics.track('app_open', {
      platform: PLATFORM,
      mock: services.usingMocks,
    });
  }, [services]);

  return (
    <ServicesProvider services={services}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </ServicesProvider>
  );
}