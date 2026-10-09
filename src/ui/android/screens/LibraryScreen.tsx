import { useCallback, useState } from '@lynx-js/react';

import { getServices } from '../../../app/services.js';
import { libraryActions, navigationActions } from '../../../application/stores.js';
import type { LibraryPayload, Track } from '../../../domain/models.js';
import type { PlaybackContext } from '../../../domain/playback.js';
import { useTheme } from '../../shared/theme.js';
import { useAsyncResource } from '../../shared/hooks.js';
import { Pressable, Text, TrackListSkeleton } from '../../shared/primitives.js';
import { Chip, SegmentedTabs } from '../../shared/inputs.js';
import { AsyncBoundary, EmptyState } from '../../shared/states.js';
import { Artwork, TrackRow } from '../../shared/media.jsx';
import { useCurrentTrackId, useLikeToggle, usePlayerIntents } from '../../shared/use-player';

type Filter = 'all' | 'playlist' | 'album' | 'artist';
type Sort = 'recent' | 'added' | 'name';

export function LibraryScreen() {
  const theme = useTheme();
  const services = getServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();
  const likeToggle = useLikeToggle();

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');

  const resource = useAsyncResource<LibraryPayload>(
    (signal) => services.repository.getLibrary({ signal }),
    [],
  );

  const playLiked = useCallback(() => {
    const tracks = resource.state.data?.likedTracks ?? [];
    if (tracks.length === 0) return;
    const context: PlaybackContext = { id: 'pl_liked', kind: 'library', title: '喜欢的音乐' };
    void intents.playTrackList(context, tracks, 0);
  }, [intents, resource.state.data]);

  const data = resource.state.status === 'success' ? resource.state.data : null;
  const liked = data ? [...data.likedTracks].sort(bySort(sort)) : [];
  const isEmpty =
    !!data &&
    data.likedTracks.length === 0 &&
    data.playlists.length === 0 &&
    data.albums.length === 0 &&
    data.artists.length === 0;

  return (
    <view style={{ flex: 1 }}>
      <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px` }}>
        <Text variant="display" weight="bold">
          音乐库
        </Text>
      </view>

      <view style={{ paddingTop: `${theme.spacing.x3}px` }}>
        <scroll-view scroll-orientation="horizontal" style={{ flexDirection: 'row' }} scroll-bar-enable={false}>
          <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, flexDirection: 'row' }}>
            <Chip label="全部" selected={filter === 'all'} onPress={() => setFilter('all')} id="library-filter-all" />
            <Chip label="歌单" selected={filter === 'playlist'} onPress={() => setFilter('playlist')} id="library-filter-playlist" />
            <Chip label="专辑" selected={filter === 'album'} onPress={() => setFilter('album')} id="library-filter-album" />
            <Chip label="歌手" selected={filter === 'artist'} onPress={() => setFilter('artist')} id="library-filter-artist" />
          </view>
        </scroll-view>
      </view>

      <view style={{ padding: `${theme.spacing.x4}px` }}>
        <SegmentedTabs
          options={[
            { value: 'name', label: '名称' },
            { value: 'recent', label: '最近播放' },
            { value: 'added', label: '最近添加' },
          ]}
          value={sort}
          onChange={setSort}
          testIDPrefix="library-sort"
        />
      </view>

      <AsyncBoundary
        loading={resource.state.status === 'loading'}
        error={resource.state.error}
        isEmpty={isEmpty}
        skeleton={() => (
          <view style={{ paddingTop: `${theme.spacing.x2}px` }}>
            <TrackListSkeleton rows={6} />
          </view>
        )}
        empty={() => (
          <EmptyState
            title="音乐库还没有内容"
            hint="扫描本地音乐文件夹，或先去发现页听点什么"
            actionLabel="去扫描音乐"
            onAction={() => sessionScanHint()}
          />
        )}
        onRetry={resource.reload}
      >
        {data ? (
          <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
            {filter === 'all' || filter === 'playlist' ? (
              <view style={{ paddingBottom: `${theme.spacing.x2}px` }}>
                <Pressable
                  accessibilityLabel="播放喜欢的音乐"
                  disabled={liked.length === 0}
                  onPress={playLiked}
                  id="library-play-liked"
                  style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, minHeight: 72 }}
                >
                  <Artwork src={data.likedTracks[0]?.coverUrl} size={56} fallbackIcon="music" />
                  <view style={{ flex: 1, paddingLeft: `${theme.spacing.x3}px` }}>
                    <Text variant="body" weight="medium">
                      喜欢的音乐
                    </Text>
                    <Text variant="caption" color="secondary">
                      {liked.length > 0 ? `${liked.length} 首收藏` : '还没有收藏'}
                    </Text>
                  </view>
                  {liked.length > 0 ? (
                    <Text variant="caption" color="brand">
                      播放
                    </Text>
                  ) : null}
                </Pressable>
              </view>
            ) : null}

            {(filter === 'all' || filter === 'artist') && data.artists.length > 0 ? (
              <EntityRow
                title="歌手"
                entities={data.artists.map((a) => ({ id: a.id, title: a.name, coverUrl: a.avatarUrl, round: true }))}
                onOpen={(id) => navigationActions.push({ key: 'artist', id })}
                testIDPrefix="library-artist"
              />
            ) : null}

            {(filter === 'all' || filter === 'album') && data.albums.length > 0 ? (
              <EntityRow
                title="专辑"
                entities={data.albums.map((a) => ({ id: a.id, title: a.title, coverUrl: a.coverUrl, round: false }))}
                onOpen={(id) => navigationActions.push({ key: 'album', id })}
                testIDPrefix="library-album"
              />
            ) : null}

            {filter === 'playlist' ? (
              data.playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  accessibilityLabel={`打开歌单 ${playlist.title}`}
                  onPress={() => navigationActions.push({ key: 'playlist', id: playlist.id })}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, minHeight: 64, gap: `${theme.spacing.x3}px` }}
                >
                  <Artwork src={playlist.coverUrl} size={48} fallbackIcon="folder" />
                  <view style={{ flex: 1 }}>
                    <Text variant="body" lines={1}>
                      {playlist.title}
                    </Text>
                    <Text variant="label" color="muted" lines={1}>
                      {playlist.trackCount ?? 0} 首
                    </Text>
                  </view>
                </Pressable>
              ))
            ) : null}

            {(filter === 'all' || filter === 'playlist') && liked.length > 0 ? (
              <view style={{ paddingTop: `${theme.spacing.x2}px` }}>
                <Text variant="section" weight="medium" style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px`, paddingBottom: `${theme.spacing.x2}px` }}>
                  收藏的歌曲
                </Text>
                {liked.map((track: Track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    playing={track.id === currentTrackId}
                    liked={libraryActions.isLiked(track.id)}
                    onPress={() =>
                      void intents.playTrackList(
                        { id: 'pl_liked', kind: 'library', title: '喜欢的音乐' },
                        liked,
                        index,
                      )
                    }
                    onToggleLike={() => void likeToggle(track)}
                  />
                ))}
              </view>
            ) : null}

            <view style={{ height: `${theme.spacing.x8}px` }} />
          </scroll-view>
        ) : null}
      </AsyncBoundary>
    </view>
  );
}

function bySort(sort: Sort): (a: Track, b: Track) => number {
  switch (sort) {
    case 'name':
      return (a, b) => a.title.localeCompare(b.title);
    case 'recent':
    case 'added':
      // Seed data has no timestamps; keep a stable, explainable order.
      return (a, b) => a.id.localeCompare(b.id);
  }
}

interface Entity {
  id: string;
  title: string;
  coverUrl?: string;
  round: boolean;
}

function EntityRow({
  title,
  entities,
  onOpen,
  testIDPrefix,
}: {
  title: string;
  entities: Entity[];
  onOpen: (id: string) => void;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  if (entities.length === 0) return null;
  return (
    <view style={{ paddingTop: `${theme.spacing.x2}px` }}>
      <Text variant="section" weight="medium" style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px`, paddingBottom: `${theme.spacing.x2}px` }}>
        {title}
      </Text>
      <scroll-view scroll-orientation="horizontal" style={{ flexDirection: 'row' }} scroll-bar-enable={false}>
        <view style={{ flexDirection: 'row', paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>
          {entities.map((entity) => (
            <Pressable
              key={entity.id}
              accessibilityLabel={`打开${title} ${entity.title}`}
              onPress={() => onOpen(entity.id)}
              id={`${testIDPrefix}-${entity.id}`}
              style={{ width: 92, marginRight: `${theme.spacing.x3}px` }}
            >
              <Artwork src={entity.coverUrl} size={92} shape={entity.round ? 'circle' : 'square'} fallbackIcon="folder" />
              <Text variant="label" color="secondary" lines={1} style={{ paddingTop: `${theme.spacing.x1}px` }}>
                {entity.title}
              </Text>
            </Pressable>
          ))}
        </view>
      </scroll-view>
    </view>
  );
}

/**
 * Scan entry point. The native scanner is not wired up yet, so this reports the
 * limitation instead of offering a button that silently does nothing
 * (product spec §13: no dead controls).
 */
function sessionScanHint(): void {
  getServices().analytics.track('content_click', { content_type: 'scan_unavailable' });
}