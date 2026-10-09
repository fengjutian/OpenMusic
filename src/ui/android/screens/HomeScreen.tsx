import { useCallback } from '@lynx-js/react';

import { useServices } from '../../../app/services-context.js';
import { navigationActions } from '../../../application/stores.js';
import { greetingFor } from '../../../domain/format.js';
import type { HomeItem, HomePayload, Track } from '../../../domain/models.js';
import type { PlaybackContext } from '../../../domain/playback.js';
import { useTheme } from '../../shared/theme.js';
import { useAsyncResource } from '../../shared/hooks.js';
import { Icon, Pressable, Text } from '../../shared/primitives.js';
import { AsyncBoundary, EmptyState } from '../../shared/states.js';
import { HorizontalShelf, ShelfSkeleton } from '../../shared/media.jsx';
import { useCurrentTrackId, usePlayerIntents } from '../../shared/use-player';

export function HomeScreen() {
  const theme = useTheme();
  const services = useServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();

  const resource = useAsyncResource<HomePayload>(
    (signal) => services.repository.getHome({ signal }),
    [],
    { isEmpty: (data) => data.shelves.length === 0 },
  );

  const openItem = useCallback(
    (item: HomeItem) => {
      services.analytics.track('content_click', { content_type: item.kind });
      switch (item.kind) {
        case 'track': {
          const shelf = resource.state.data?.shelves.find((s) =>
            s.items.some((i) => i.kind === 'track' && i.id === item.id),
          );
          const tracks: Track[] = (shelf?.items ?? [])
            .filter((i): i is Extract<HomeItem, { kind: 'track' }> => i.kind === 'track')
            .map((i) => i.track);
          const index = tracks.findIndex((t) => t.id === item.track.id);
          const context: PlaybackContext = {
            id: `shelf:${shelf?.id ?? 'unknown'}`,
            kind: 'library',
            title: shelf?.title ?? '发现',
          };
          void intents.playTrackList(context, tracks, Math.max(0, index));
          break;
        }
        case 'playlist':
          navigationActions.push({ key: 'playlist', id: item.id });
          break;
        case 'album':
          navigationActions.push({ key: 'album', id: item.id });
          break;
      }
    },
    [intents, resource.state.data, services],
  );

  const data = resource.state.status === 'success' ? resource.state.data : null;

  return (
    <AsyncBoundary
      loading={resource.state.status === 'loading'}
      error={resource.state.error}
      isEmpty={resource.state.status === 'empty'}
      skeleton={() => (
        <view style={{ paddingTop: `${theme.spacing.x4}px`, gap: `${theme.spacing.x4}px` }}>
          <ShelfSkeleton />
          <ShelfSkeleton />
        </view>
      )}
      empty={() => (
        <EmptyState
          title="本地曲库还是空的"
          hint="扫描一个音乐文件夹，这里就会出现内容"
          actionLabel="去音乐库导入"
          onAction={() => navigationActions.switchTab('library')}
        />
      )}
      onRetry={resource.reload}
    >
      {data ? (
        <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
          <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px` }}>
            <Text variant="display" weight="bold">
              {greetingFor(new Date().getHours())}
              {data.greetingName ? `，${data.greetingName}` : ''}
            </Text>
          </view>

          <view style={{ height: `${theme.spacing.x4}px` }} />

          <Pressable
            accessibilityLabel="打开搜索"
            onPress={() => navigationActions.switchTab('search')}
            id="home-search-entry"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: `${theme.spacing.x2}px`,
              marginLeft: `${theme.spacing.x4}px`,
              marginRight: `${theme.spacing.x4}px`,
              height: 44,
              paddingLeft: `${theme.spacing.x3}px`,
              paddingRight: `${theme.spacing.x3}px`,
              borderRadius: `${theme.radius.pill}px`,
              backgroundColor: theme.colors.surfaceRaised,
            }}
          >
            <Icon name="search" size={16} color={theme.colors.textMuted} />
            <Text variant="caption" color="muted">
              搜索歌曲、歌手、专辑
            </Text>
          </Pressable>

          <view style={{ height: `${theme.spacing.x4}px` }} />

          {data.continueListening ? (
            <HorizontalShelf shelf={data.continueListening} onOpenItem={openItem} />
          ) : null}

          {data.shelves.map((shelf) => (
            <view key={shelf.id} style={{ paddingTop: `${theme.spacing.x4}px` }}>
              <HorizontalShelf shelf={shelf} onOpenItem={openItem} />
            </view>
          ))}

          {currentTrackId ? (
            <Text
              variant="label"
              color="muted"
              style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x6}px` }}
            >
              正在播放
            </Text>
          ) : null}

          <view style={{ height: `${theme.spacing.x8}px` }} />
        </scroll-view>
      ) : null}
    </AsyncBoundary>
  );
}