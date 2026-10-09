/**
 * Windows shell (technical spec §23 / PRD §18): left navigation + main content
 * + a collapsible now-playing column, collapsing to two columns under 900px.
 *
 * Shared screens are reused verbatim — only composition and navigation differ.
 */

import { useEffect } from '@lynx-js/react';

import { useStoreSlice } from '../../application/store-hooks.js';
import {
  navigationActions,
  navigationStore,
  sessionStore,
} from '../../application/stores.js';
import type { BottomTabKey } from '../../application/stores.js';
import { useLayoutMode, useTheme } from '../shared/theme.js';
import { Icon, Pressable, Text } from '../shared/primitives.js';
import { ConnectedMiniPlayer, useRestorePlayer } from '../shared/use-player';
import { HomeScreen } from '../android/screens/HomeScreen.jsx';
import { SearchScreen } from '../android/screens/SearchScreen.jsx';
import { LibraryScreen } from '../android/screens/LibraryScreen.jsx';
import { ProfileScreen } from '../android/screens/ProfileScreen.jsx';
import {
  AlbumScreen,
  ArtistScreen,
  PlaylistScreen,
} from '../android/screens/DetailScreens.jsx';
import { NowPlayingOverlay } from '../android/overlays/NowPlayingOverlay.jsx';
import { QueueOverlay } from '../android/overlays/QueueOverlay.jsx';

const NAV_ITEMS: { key: BottomTabKey; label: string; icon: 'music' | 'search' | 'folder' | 'heart' }[] = [
  { key: 'home', label: '发现', icon: 'music' },
  { key: 'search', label: '搜索', icon: 'search' },
  { key: 'library', label: '音乐库', icon: 'folder' },
  { key: 'profile', label: '我的', icon: 'heart' },
];

/**
 * Keyboard shortcuts are registered once, at the shell, and dispatched by focus
 * context (PRD §18). Each page must never attach its own global listener.
 *
 * Note: Lynx exposes `onkeydown` with a limited key set. Until that surface is
 * verified on the desktop backend we do NOT bind Ctrl+K etc. to fake behaviour;
 * the shortcuts list below is the spec we intend to implement once verified.
 */
export const PENDING_SHORTCUTS = [
  { keys: 'Space', action: '播放 / 暂停' },
  { keys: 'Ctrl+K', action: '聚焦搜索' },
  { keys: 'Ctrl+L', action: '聚焦音乐库' },
  { keys: 'Ctrl+O', action: '导入' },
  { keys: 'Ctrl+,', action: '设置' },
] as const;

export function WindowsShell() {
  const theme = useTheme();
  const layoutMode = useLayoutMode();
  const stack = useStoreSlice(navigationStore, 'stack');
  const nowPlayingVisible = useStoreSlice(navigationStore, 'nowPlayingVisible');
  const queueVisible = useStoreSlice(navigationStore, 'queueVisible');
  const safeArea = useStoreSlice(sessionStore, 'safeArea');

  useRestorePlayer();

  const top = stack[stack.length - 1];
  const compact = layoutMode === 'desktop-compact';

  useEffect(() => {
    if (compact && queueVisible) navigationActions.closeQueue();
  }, [compact, queueVisible]);

  return (
    <view
      style={{
        display: 'flex',
        flex: 1,
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
      }}
    >
      <Sidebar />

      <view
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          flexDirection: 'column',
          paddingLeft: `${safeArea.left}px`,
        }}
      >
        <view style={{ display: 'flex', flex: 1, minHeight: 0 }}>{renderRoute(top)}</view>
        <ConnectedMiniPlayer onExpand={() => navigationActions.openNowPlaying()} />
      </view>

      {nowPlayingVisible ? (
        <NowPlayingOverlay onClose={() => navigationActions.closeNowPlaying()} />
      ) : null}
      {queueVisible ? <QueueOverlay onClose={() => navigationActions.closeQueue()} /> : null}
    </view>
  );
}

function Sidebar() {
  const theme = useTheme();
  const active = useStoreSlice(navigationStore, 'tab');

  return (
    <view
      id="windows-sidebar"
      style={{
        display: 'flex',
        width: 200,
        flexShrink: 0,
        flexDirection: 'column',
        backgroundColor: theme.colors.surface,
        paddingTop: `${theme.spacing.x6}px`,
        paddingLeft: `${theme.spacing.x3}px`,
        paddingRight: `${theme.spacing.x3}px`,
        gap: `${theme.spacing.x1}px`,
      }}
    >
      <view style={{ display: 'flex', flexDirection: 'column', paddingLeft: `${theme.spacing.x2}px`, paddingRight: `${theme.spacing.x2}px`, paddingBottom: `${theme.spacing.x4}px` }}>
        <Text variant="section" weight="bold">
          OpenMusic
        </Text>
        <Text variant="label" color="muted">
          本地优先音乐播放器
        </Text>
      </view>

      {NAV_ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityLabel={item.label}
            selected={selected}
            onPress={() => navigationActions.switchTab(item.key)}
            id={`sidebar-${item.key}`}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: `${theme.spacing.x3}px`,
              height: 44,
              paddingLeft: `${theme.spacing.x3}px`,
              paddingRight: `${theme.spacing.x3}px`,
              borderRadius: `${theme.radius.md}px`,
              backgroundColor: selected ? theme.colors.surfaceRaised : 'transparent',
            }}
          >
            <Icon
              name={item.icon}
              size={18}
              color={selected ? theme.colors.brand : theme.colors.textMuted}
            />
            <Text variant="body" color={selected ? 'primary' : 'secondary'}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </view>
  );
}

function renderRoute(entry: { key: string; id?: string }) {
  switch (entry.key) {
    case 'search':
      return <SearchScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'playlist':
      return entry.id ? <PlaylistScreen id={entry.id} /> : <HomeScreen />;
    case 'album':
      return entry.id ? <AlbumScreen id={entry.id} /> : <HomeScreen />;
    case 'artist':
      return entry.id ? <ArtistScreen id={entry.id} /> : <HomeScreen />;
    default:
      return <HomeScreen />;
  }
}
