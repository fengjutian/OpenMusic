/**
 * Android shell (technical spec §23): bottom tabs + persistent mini player +
 * full-screen overlays.
 *
 * Shared components receive behaviour through props; this file owns navigation
 * and composition only.
 */

import { useStoreSlice } from '../../application/store-hooks.js';
import {
  navigationActions,
  navigationStore,
  sessionStore,
} from '../../application/stores.js';
import { useTheme } from '../shared/theme.js';
import { ConnectedMiniPlayer, useRestorePlayer } from '../shared/use-player.jsx';
import { BottomTabs } from './BottomTabs.jsx';
import { NowPlayingOverlay } from './overlays/NowPlayingOverlay.jsx';
import { QueueOverlay } from './overlays/QueueOverlay.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { ProfileScreen } from './screens/ProfileScreen.jsx';
import {
  AlbumScreen,
  ArtistScreen,
  PlaylistScreen,
} from './screens/DetailScreens.jsx';

export function AndroidShell() {
  const theme = useTheme();
  const stack = useStoreSlice(navigationStore, 'stack');
  const nowPlayingVisible = useStoreSlice(navigationStore, 'nowPlayingVisible');
  const queueVisible = useStoreSlice(navigationStore, 'queueVisible');
  const safeArea = useStoreSlice(sessionStore, 'safeArea');

  useRestorePlayer();

  const top = stack[stack.length - 1];

  return (
    <view style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <view style={{ flex: 1, paddingTop: `${safeArea.top}px` }}>{renderRoute(top)}</view>

      <ConnectedMiniPlayer onExpand={() => navigationActions.openNowPlaying()} />

      <BottomTabs bottomInset={safeArea.bottom} />

      {nowPlayingVisible ? (
        <NowPlayingOverlay onClose={() => navigationActions.closeNowPlaying()} />
      ) : null}

      {queueVisible ? <QueueOverlay onClose={() => navigationActions.closeQueue()} /> : null}
    </view>
  );
}

function renderRoute(entry: { key: string; id?: string }) {
  switch (entry.key) {
    case 'home':
      return <HomeScreen />;
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