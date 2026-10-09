/**
 * App shell entry. Chooses the platform composition once, at build time.
 *
 * Technical spec §23: the two platforms share semantics, data and player state,
 * but are allowed different layouts. Nothing below this file branches on
 * platform again.
 */

import { useTheme, PLATFORM } from './shared/theme.js';
import { AndroidShell } from './android/AndroidShell.jsx';
import { WindowsShell } from './windows/WindowsShell.jsx';
import { ToastHost } from './ToastHost.jsx';

export function AppShell() {
  const theme = useTheme();

  return (
    <view
      id={`app-shell-${PLATFORM}`}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      {PLATFORM === 'windows' ? <WindowsShell /> : <AndroidShell />}
      <ToastHost />
    </view>
  );
}