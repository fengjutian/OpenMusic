/**
 * Theme + platform context. Everything visual reads from here.
 */

import { createContext, useContext, useMemo } from '@lynx-js/react';
import type { ReactNode } from '@lynx-js/react';

import { sessionStore, navigationStore } from '../../application/stores.js';
import { useStoreSlice } from '../../application/store-hooks.js';
import { themes } from './tokens.js';
import type { Theme } from './tokens.js';

const ThemeContext = createContext<Theme>(themes.dark);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useStoreSlice(sessionStore, 'resolvedTheme');
  const theme = useMemo(() => themes[resolved], [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Platform layout strategy, resolved once at the shell. */
export type LayoutMode = 'mobile' | 'desktop' | 'desktop-compact';

export const PLATFORM: 'android' | 'windows' = __OPENMUSIC_PLATFORM__;

export function useLayoutMode(): LayoutMode {
  const width = useStoreSlice(sessionStore, 'windowSize').width;
  if (PLATFORM === 'windows') {
    return width < 900 ? 'desktop-compact' : 'desktop';
  }
  return 'mobile';
}

export { navigationStore };