import { useCallback, useMemo, useState } from '@lynx-js/react';

import { getServices } from '../../../app/services.js';
import { libraryActions, navigationActions } from '../../../application/stores.js';
import type { ArtistDetail, Playlist, Track } from '../../../domain/models.js';
import type { PlaybackContext } from '../../../domain/playback.js';
import { useTheme } from '../../shared/theme.js';
import { useAsyncResource } from '../../shared/hooks.js';
import { Icon, Pressable, Text, TrackListSkeleton } from '../../shared/primitives.js';
import { AsyncBoundary, EmptyState } from '../../shared/states.js';
import { Artwork, TrackRow } from '../../shared/media.jsx';
import { useCurrentTrackId, useLikeToggle, usePlayerIntents } from '../../shared/use-player';

export function DetailTopBar({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <view
      style={{
        height: `${theme.layout.topBarHeight}px`,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: `${theme.spacing.x2}px`,
        paddingRight: `${theme.spacing.x2}px`,
        gap: `${theme.spacing.x2}px`,
      }}
    >
      <Pressable
        accessibilityLabel="返回"
        onPress={() => navigationActions.pop()}
        id="detail-back"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="back" size={26} color={theme.colors.textPrimary} />
      </Pressable>
      <Text variant="body" lines={1} style={{ flex: 1 }}>
        {title}
      </Text>
    </view>
  );
}

function DetailHeader({
  title,
  subtitle,
  coverUrl,
  meta,
  onPlayAll,
  playAllDisabled,
}: {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  meta?: string;
  onPlayAll: () => void;
  playAllDisabled: boolean;
}) {
  const theme = useTheme();
  return (
    <view style={{ padding: `${theme.spacing.x4}px`, gap: `${theme.spacing.x3}px` }}>
      <view style={{ flexDirection: 'row', gap: `${theme.spacing.x4}px` }}>
        <Artwork src={coverUrl} size={112} />
        <view style={{ flex: 1, justifyContent: 'flex-end', gap: 2 }}>
          <Text variant="section" lines={2} weight="bold">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="secondary" lines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text variant="label" color="muted">
              {meta}
            </Text>
          ) : null}
        </view>
      </view>

      <Pressable
        accessibilityLabel="播放全部"
        disabled={playAllDisabled}
        onPress={onPlayAll}
        id="detail-play-all"
        style={{
          height: 44,
          borderRadius: `${theme.radius.pill}px`,
          backgroundColor: theme.colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="body" color="inverse" weight="medium">
          播放全部
        </Text>
      </Pressable>
    </view>
  );
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

export function PlaylistScreen({ id }: { id: string }) {
  const theme = useTheme();
  const services = getServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();
  const likeToggle = useLikeToggle();

  const resource = useAsyncResource<Playlist>(
    (signal) => services.repository.getPlaylist(id, { signal }),
    [id],
    { isEmpty: (data) => (data.tracks?.length ?? 0) === 0 },
  );

  const data = resource.state.status === 'success' ? resource.state.data : null;
  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  const context: PlaybackContext = useMemo(
    () => ({
      id: data?.id ?? id,
      kind: 'playlist',
      title: data?.title ?? '歌单',
    }),
    [data, id],
  );

  const playAll = useCallback(() => {
    void intents.playTrackList(context, tracks, 0);
  }, [context, intents, tracks]);

  return (
    <view style={{ flex: 1 }}>
      <DetailTopBar title={data?.title ?? '歌单'} />
      <AsyncBoundary
        loading={resource.state.status === 'loading'}
        error={resource.state.error}
        isEmpty={resource.state.status === 'empty'}
        skeleton={() => <TrackListSkeleton rows={6} />}
        empty={() => (
          <EmptyState
            title="这个歌单还没有歌曲"
            actionLabel="去发现页看看"
            onAction={() => navigationActions.switchTab('home')}
          />
        )}
        onRetry={resource.reload}
      >
        {data ? (
          <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
            <DetailHeader
              title={data.title}
              subtitle={data.description ?? data.creatorName}
              coverUrl={data.coverUrl}
              meta={`${tracks.length} 首`}
              onPlayAll={playAll}
              playAllDisabled={tracks.length === 0}
            />
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                playing={track.id === currentTrackId}
                liked={libraryActions.isLiked(track.id)}
                onPress={() => void intents.playTrackList(context, tracks, index)}
                onToggleLike={() => void likeToggle(track)}
                onOpenMenu={() => intents.enqueueNext(track)}
              />
            ))}
            <view style={{ height: `${theme.spacing.x8}px` }} />
          </scroll-view>
        ) : null}
      </AsyncBoundary>
    </view>
  );
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

export function AlbumScreen({ id }: { id: string }) {
  const theme = useTheme();
  const services = getServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();
  const likeToggle = useLikeToggle();

  const resource = useAsyncResource(
    (signal) => services.repository.getAlbum(id, { signal }),
    [id],
    { isEmpty: (data) => data.tracks.length === 0 },
  );

  const data = resource.state.status === 'success' ? resource.state.data : null;
  const context: PlaybackContext = { id, kind: 'album', title: data?.title ?? '专辑' };

  return (
    <view style={{ flex: 1 }}>
      <DetailTopBar title={data?.title ?? '专辑'} />
      <AsyncBoundary
        loading={resource.state.status === 'loading'}
        error={resource.state.error}
        isEmpty={resource.state.status === 'empty'}
        skeleton={() => <TrackListSkeleton rows={6} />}
        empty={() => <EmptyState title="这张专辑还没有歌曲" />}
        onRetry={resource.reload}
      >
        {data ? (
          <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
            <DetailHeader
              title={data.title}
              subtitle={data.artist?.name}
              coverUrl={data.coverUrl}
              meta={data.year ? `${data.year} · ${data.tracks.length} 首` : undefined}
              onPlayAll={() => void intents.playTrackList(context, data.tracks, 0)}
              playAllDisabled={data.tracks.length === 0}
            />
            {data.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                playing={track.id === currentTrackId}
                liked={libraryActions.isLiked(track.id)}
                onPress={() => void intents.playTrackList(context, data.tracks, index)}
                onToggleLike={() => void likeToggle(track)}
              />
            ))}
            <view style={{ height: `${theme.spacing.x8}px` }} />
          </scroll-view>
        ) : null}
      </AsyncBoundary>
    </view>
  );
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

export function ArtistScreen({ id }: { id: string }) {
  const theme = useTheme();
  const services = getServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();
  const [expanded, setExpanded] = useState(false);

  const resource = useAsyncResource<ArtistDetail>(
    (signal) => services.repository.getArtist(id, { signal }),
    [id],
  );

  const data = resource.state.status === 'success' ? resource.state.data : null;
  const HOT_LIMIT = 5;
  const visibleTracks: Track[] = data
    ? expanded
      ? data.hotTracks
      : data.hotTracks.slice(0, HOT_LIMIT)
    : [];
  const context: PlaybackContext = { id, kind: 'artist', title: data?.name ?? '歌手' };

  return (
    <view style={{ flex: 1 }}>
      <DetailTopBar title={data?.name ?? '歌手'} />
      <AsyncBoundary
        loading={resource.state.status === 'loading'}
        error={resource.state.error}
        isEmpty={resource.state.status === 'empty'}
        skeleton={() => <TrackListSkeleton rows={5} />}
        empty={() => <EmptyState title="找不到这位歌手" />}
        onRetry={resource.reload}
      >
        {data ? (
          <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
            <view
              style={{
                alignItems: 'center',
                padding: `${theme.spacing.x6}px`,
                gap: `${theme.spacing.x2}px`,
              }}
            >
              <Artwork src={data.avatarUrl} size={112} shape="circle" fallbackIcon="folder" />
              <Text variant="section" weight="bold">
                {data.name}
              </Text>
              {data.bio ? (
                <Text variant="caption" color="secondary" lines={2} style={{ textAlign: 'center' }}>
                  {data.bio}
                </Text>
              ) : null}
            </view>

            <DetailHeader
              title="热门歌曲"
              meta={`共 ${data.hotTracks.length} 首`}
              onPlayAll={() => void intents.playTrackList(context, data.hotTracks, 0)}
              playAllDisabled={data.hotTracks.length === 0}
            />

            {visibleTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                playing={track.id === currentTrackId}
                onPress={() => void intents.playTrackList(context, data.hotTracks, index)}
              />
            ))}

            {data.hotTracks.length > HOT_LIMIT ? (
              <Pressable
                accessibilityLabel={expanded ? '收起热门歌曲' : '展开全部热门歌曲'}
                onPress={() => setExpanded(!expanded)}
                id="artist-expand"
                style={{ alignItems: 'center', paddingTop: `${theme.spacing.x3}px`, paddingBottom: `${theme.spacing.x3}px` }}
              >
                <Text variant="caption" color="secondary">
                  {expanded ? '收起' : `展开全部 ${data.hotTracks.length} 首`}
                </Text>
              </Pressable>
            ) : null}

            <view style={{ height: `${theme.spacing.x8}px` }} />
          </scroll-view>
        ) : null}
      </AsyncBoundary>
    </view>
  );
}