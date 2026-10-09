import { useEffect } from '@lynx-js/react';

import { AppShell } from '../ui/AppShell.js';
import { ThemeProvider, PLATFORM } from '../ui/shared/theme.js';
import { sessionActions } from '../application/stores.js';
import { getServices } from './services.js';

export function App() {
  const services = getServices();

  useEffect(() => {
    sessionActions.setSafeArea(services.bridge.safeAreaInsets());
    sessionActions.setWindowSize(services.bridge.windowSize());

    // Focus loss / media buttons are platform events, not page state.
    const offFocus = services.bridge.onAudioFocusChange((focused) => {
      if (!focused) services.player.handleFocusLost();
    });
    const offButton = services.bridge.onMediaButton((command) => {
      if (command === 'play') void services.player.play();
      if (command === 'pause') void services.player.pause();
      if (command === 'next') void services.player.next();
      if (command === 'previous') void services.player.previous();
    });

    services.analytics.track('app_open', { platform: PLATFORM, mock: services.usingMocks });

    return () => {
      offFocus();
      offButton();
    };
  }, []);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}