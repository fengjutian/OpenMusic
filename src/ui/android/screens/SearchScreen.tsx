import { useCallback, useEffect, useState } from '@lynx-js/react';
import type { ReactNode } from '@lynx-js/react';

import { getServices } from '../../../app/services.js';
import type { AppError } from '../../../domain/errors.js';
import type { SearchPayload } from '../../../domain/models.js';
import { SEARCH_DEBOUNCE_MS } from '../../../domain/search.js';
import { useTheme } from '../../shared/theme.js';
import { useAsyncResource, useDebouncedCallback } from '../../shared/hooks.js';
import { Pressable, Text } from '../../shared/primitives.js';
import { SearchField } from '../../shared/inputs.js';
import { EmptyState } from '../../shared/states.js';
import { Artwork, TrackRow } from '../../shared/media.jsx';
import { libraryActions, navigationActions } from '../../../application/stores.js';
import { useCurrentTrackId, useLikeToggle, usePlayerIntents } from '../../shared/use-player';
import type { PlaybackContext } from '../../../domain/playback.js';

const HISTORY_KEY = 'search.history.v1';

/** Stable reference for the "no query" branch; avoids re-running the effect. */
const EMPTY_PAYLOAD: SearchPayload = {
  query: '',
  tracks: [],
  artists: [],
  albums: [],
  playlists: [],
  hasResults: false,
  suggestions: [],
};

export function SearchScreen() {
  const theme = useTheme();
  const services = getServices();
  const intents = usePlayerIntents();
  const currentTrackId = useCurrentTrackId();
  const likeToggle = useLikeToggle();

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const stored = await services.settings.get<string[]>(HISTORY_KEY, []);
      setHistory(stored);
    })();
  }, [services]);

  const runSearch = useCallback(
    async (raw: string, signal: AbortSignal): Promise<SearchPayload> => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setSuggestions([]);
        return EMPTY_PAYLOAD;
      }
      const payload = await services.repository.search(trimmed, 'all', undefined, { signal });
      setSuggestions(payload.hasResults ? [] : payload.suggestions);
      return payload;
    },
    [services],
  );

  const debouncedSearch = useDebouncedCallback(runSearch, SEARCH_DEBOUNCE_MS);
  const resource = useAsyncResource<SearchPayload>(
    (signal) => runSearch(submitted, signal),
    [submitted],
    { isEmpty: (data) => !data.hasResults },
  );

  const commitHistory = useCallback(
    async (value: string) => {
      const next = [value, ...history.filter((h) => h !== value)].slice(0, 20);
      setHistory(next);
      await services.settings.set(HISTORY_KEY, next);
    },
    [history, services],
  );

  const submit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setSubmitted(trimmed);
      void commitHistory(trimmed);
      // Analytics gets the length only, never the query itself.
      services.analytics.track('search_submit', { query: trimmed });
    },
    [commitHistory, services],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    void services.settings.set(HISTORY_KEY, []);
  }, [services]);

  const playFromResults = useCallback(
    (index: number, tracks: import('../../../domain/models.js').Track[]) => {
      const context: PlaybackContext = {
        id: `search:${submitted}`,
        kind: 'library',
        title: `搜索「${submitted}」`,
      };
      void intents.playTrackList(context, tracks, index);
    },
    [intents, submitted],
  );

  const showScaffold = submitted.length === 0;

  return (
    <view style={{ flex: 1 }}>
      <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px` }}>
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            // Live pass: only refreshes the "no results" suggestions, so it
            // owns a throwaway controller — the real request is driven by
            // `submitted` through useAsyncResource.
            debouncedSearch(value, new AbortController().signal);
          }}
          onSubmit={() => submit(query)}
          id="search-field"
        />
      </view>

      {showScaffold ? (
        <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
          {history.length > 0 ? (
            <view style={{ paddingTop: `${theme.spacing.x4}px` }}>
              <view style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>
                <Text variant="section" weight="medium">
                  最近搜索
                </Text>
                <Pressable accessibilityLabel="清空搜索历史" onPress={clearHistory} id="history-clear" hitSlop={`8px`}>
                  <Text variant="caption" color="muted">
                    清空
                  </Text>
                </Pressable>
              </view>
              <view style={{ flexDirection: 'row', flexWrap: 'wrap', padding: `${theme.spacing.x4}px`, gap: `${theme.spacing.x2}px` }}>
                {history.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityLabel={`搜索 ${item}`}
                    onPress={() => {
                      setQuery(item);
                      submit(item);
                    }}
                    id={`history-${item}`}
                    style={{
                      paddingLeft: `${theme.spacing.x3}px`,
                      paddingRight: `${theme.spacing.x3}px`,
                      height: 32,
                      borderRadius: `${theme.radius.pill}px`,
                      backgroundColor: theme.colors.surfaceRaised,
                      justifyContent: 'center',
                      marginRight: `${theme.spacing.x2}px`,
                      marginBottom: `${theme.spacing.x2}px`,
                    }}
                  >
                    <Text variant="caption" color="secondary">
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </view>
            </view>
          ) : (
            <EmptyState
              title="还没有搜索记录"
              hint="试试搜索歌名、歌手或专辑"
              compact
            />
          )}
        </scroll-view>
      ) : resource.state.status === 'loading' ? (
        <view style={{ paddingTop: `${theme.spacing.x4}px` }}>
          <Text variant="caption" color="muted" style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>
            搜索中…
          </Text>
        </view>
      ) : resource.state.status === 'error' ? (
        <ErrorWithRetry error={resource.state.error} onRetry={resource.reload} />
      ) : resource.state.status === 'empty' ? (
        <EmptyState
          title={`没有找到「${submitted}」`}
          hint={suggestions.length > 0 ? '要不要换个关键词试试' : undefined}
          actionLabel={suggestions[0] ? `搜索「${suggestions[0]}」` : undefined}
          onAction={suggestions[0] ? () => submit(suggestions[0]!) : undefined}
        />
      ) : resource.state.status === 'success' ? (
        <SearchResults
          payload={resource.state.data}
          currentTrackId={currentTrackId}
          onPlay={playFromResults}
          onToggleLike={likeToggle}
          onOpenPlaylist={(id) => navigationActions.push({ key: 'playlist', id })}
          onOpenAlbum={(id) => navigationActions.push({ key: 'album', id })}
          onOpenArtist={(id) => navigationActions.push({ key: 'artist', id })}
        />
      ) : null}
    </view>
  );
}

function ErrorWithRetry({
  error,
  onRetry,
}: {
  error: AppError | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <view style={{ padding: `${theme.spacing.x8}px`, alignItems: 'center', gap: `${theme.spacing.x3}px` }}>
      <Text variant="body" color="error" style={{ textAlign: 'center' }}>
        {error?.userMessage ?? '搜索失败'}
      </Text>
      <Pressable
        accessibilityLabel="重试搜索"
        onPress={onRetry}
        id="search-retry"
        style={{
          paddingLeft: `${theme.spacing.x6}px`,
          paddingRight: `${theme.spacing.x6}px`,
          height: 44,
          borderRadius: `${theme.radius.pill}px`,
          borderWidth: 1,
          borderColor: theme.colors.border,
          justifyContent: 'center',
        }}
      >
        <Text variant="body">重试</Text>
      </Pressable>
    </view>
  );
}

function SearchResults({
  payload,
  currentTrackId,
  onPlay,
  onToggleLike,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
}: {
  payload: import('../../../domain/models.js').SearchPayload;
  currentTrackId: string | null;
  onPlay: (index: number, tracks: import('../../../domain/models.js').Track[]) => void;
  onToggleLike: (track: import('../../../domain/models.js').Track) => void;
  onOpenPlaylist: (id: string) => void;
  onOpenAlbum: (id: string) => void;
  onOpenArtist: (id: string) => void;
}) {
  const theme = useTheme();
  const services = getServices();

  return (
    <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
      {payload.tracks.length > 0 ? (
        <view style={{ paddingTop: `${theme.spacing.x2}px` }}>
          <Text variant="caption" color="secondary" style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>
            单曲 · {payload.tracks.length}
          </Text>
          {payload.tracks.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i}
              playing={track.id === currentTrackId}
              liked={libraryActions.isLiked(track.id)}
              onPress={() => onPlay(i, payload.tracks)}
              onToggleLike={() => onToggleLike(track)}
              onOpenMenu={() => {
                services.analytics.track('search_result_click', { result_type: 'track' });
                onOpenAlbum(track.album?.id ?? '');
              }}
            />
          ))}
        </view>
      ) : null}

      {payload.artists.length > 0 ? (
        <ResultSection title={`歌手 · ${payload.artists.length}`}>
          {payload.artists.map((artist) => (
            <Pressable
              key={artist.id}
              accessibilityLabel={`查看歌手 ${artist.name}`}
              onPress={() => onOpenArtist(artist.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: `${theme.spacing.x3}px`, minHeight: 56 }}
            >
              <Artwork src={artist.avatarUrl} size={44} shape="circle" fallbackIcon="folder" />
              <Text variant="body" lines={1}>
                {artist.name}
              </Text>
            </Pressable>
          ))}
        </ResultSection>
      ) : null}

      {payload.albums.length > 0 ? (
        <ResultSection title={`专辑 · ${payload.albums.length}`}>
          {payload.albums.map((album) => (
            <Pressable
              key={album.id}
              accessibilityLabel={`查看专辑 ${album.title}`}
              onPress={() => onOpenAlbum(album.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: `${theme.spacing.x3}px`, minHeight: 56 }}
            >
              <Artwork src={album.coverUrl} size={44} />
              <view style={{ flex: 1 }}>
                <Text variant="body" lines={1}>
                  {album.title}
                </Text>
                <Text variant="label" color="muted">
                  {album.year ?? ''}
                </Text>
              </view>
            </Pressable>
          ))}
        </ResultSection>
      ) : null}

      {payload.playlists.length > 0 ? (
        <ResultSection title={`歌单 · ${payload.playlists.length}`}>
          {payload.playlists.map((playlist) => (
            <Pressable
              key={playlist.id}
              accessibilityLabel={`查看歌单 ${playlist.title}`}
              onPress={() => onOpenPlaylist(playlist.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: `${theme.spacing.x3}px`, minHeight: 56 }}
            >
              <Artwork src={playlist.coverUrl} size={44} fallbackIcon="folder" />
              <view style={{ flex: 1 }}>
                <Text variant="body" lines={1}>
                  {playlist.title}
                </Text>
                {playlist.creatorName ? (
                  <Text variant="label" color="muted" lines={1}>
                    {playlist.creatorName}
                  </Text>
                ) : null}
              </view>
            </Pressable>
          ))}
        </ResultSection>
      ) : null}

      <view style={{ height: theme.spacing.x8 }} />
    </scroll-view>
  );
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <view style={{ paddingTop: `${theme.spacing.x4}px`, gap: `${theme.spacing.x1}px` }}>
      <Text variant="caption" color="secondary" style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>
        {title}
      </Text>
      <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}>{children}</view>
    </view>
  );
}