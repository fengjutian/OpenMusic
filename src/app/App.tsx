import { useEffect } from '@lynx-js/react';

import { AppShell } from '../ui/AppShell.js';
import { ThemeProvider, PLATFORM } from '../ui/shared/theme.js';
import { sessionActions } from '../application/stores.js';
import { createServices } from './services.js';

export function App() {
  const services = createServices();

  useEffect(() => {
    // Platform event subscriptions (focus, media buttons) are owned by the
    // PlayerCoordinator itself, wired in `createServices`. This effect only
    // syncs the one-shot window metrics and fires the app_open event.
    sessionActions.setSafeArea(services.bridge.safeAreaInsets());
    sessionActions.setWindowSize(services.bridge.windowSize());
    services.analytics.track('app_open', { platform: PLATFORM, mock: services.usingMocks });
  }, [services]);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}