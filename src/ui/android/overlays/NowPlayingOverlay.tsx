import { useEffect, useState } from '@lynx-js/react';
import type { ReactNode } from '@lynx-js/react';

import { getServices } from '../../../app/services.js';
import { formatArtists } from '../../../domain/format.js';
import type { LyricLine } from '../../../domain/models.js';
import { useTheme } from '../../shared/theme.js';
import { useAsyncResource } from '../../shared/hooks.js';
import { Icon, Pressable, Text } from '../../shared/primitives.js';
import { Artwork } from '../../shared/media.jsx';
import {
  LyricsView,
  NowPlayingProgress,
  PlaybackControls,
} from '../../shared/playback.jsx';
import { usePlayerFull, usePlayerIntents } from '../../shared/use-player.js';
import { DEFAULT_NOW_PLAYING_LAYOUT } from './now-playing-layout.js';
import type { NowPlayingLayout } from './now-playing-layout.js';

type Pane = 'artwork' | 'lyrics';

/**
 * Artwork box and seek track are declared once because Lynx exposes no layout
 * measurement API — `@lynx-js/types` has no `measureLayout`/`onLayout`, so the
 * seek handler needs a width it can be told about. See ADR-0002.
 */
export const NOW_PLAYING_ARTWORK_SIZE = 320;
export const NOW_PLAYING_TRACK_WIDTH = 320;

export function NowPlayingOverlay({
  onClose,
  layout = DEFAULT_NOW_PLAYING_LAYOUT,
}: {
  onClose: () => void;
  layout?: NowPlayingLayout;
}) {
  const theme = useTheme();
  const services = getServices();
  const player = usePlayerFull();
  const intents = usePlayerIntents();
  const [pane, setPane] = useState<Pane>('artwork');

  const track = player.queue ? player.queue.tracks[player.queue.index] : undefined;

  useEffect(() => {
    services.analytics.track('player_expand', { context: player.queue?.context.kind ?? 'unknown' });
  }, [player.queue?.context.kind, services]);

  const trackWidth = layout.trackWidth;
  const trackHeight = layout.artworkSize;

  if (!track) {
    return (
      <OverlayFrame>
        <view style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" color="muted">
            当前没有正在播放的歌曲
          </Text>
        </view>
      </OverlayFrame>
    );
  }

  const duration = player.durationMs || track.durationMs;

  return (
    <OverlayFrame>
      <view
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: `${theme.spacing.x3}px`,
          paddingRight: `${theme.spacing.x3}px`,
          height: `${theme.layout.topBarHeight}px`,
        }}
      >
        <Pressable accessibilityLabel="收起播放页" onPress={onClose} id="now-playing-close" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-down" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="caption" color="secondary" lines={1} style={{ flex: 1, textAlign: 'center' }}>
          {player.queue?.context.title}
        </Text>
        <Pressable accessibilityLabel="播放队列" onPress={() => services.analytics.track('queue_open', {})} id="now-playing-queue" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="queue" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </view>

      {pane === 'artwork' ? (
        <view style={{ alignItems: 'center', paddingTop: `${theme.spacing.x4}px`, paddingBottom: `${theme.spacing.x4}px` }}>
          <Artwork src={track.coverUrl} size={trackHeight} />
        </view>
      ) : (
        <LyricsPane trackId={track.id} positionMs={player.positionMs} layout={layout} />
      )}

      <view style={{ paddingLeft: `${theme.spacing.x6}px`, paddingRight: `${theme.spacing.x6}px`, gap: 2 }}>
        <Text variant="section" lines={1} weight="bold">
          {track.title}
        </Text>
        <Text variant="caption" color="secondary" lines={1}>
          {formatArtists(track.artists.map((a) => a.name))}
        </Text>
      </view>

      <view style={{ alignItems: 'center', paddingTop: `${theme.spacing.x2}px` }}>
        <NowPlayingProgress
          positionMs={player.positionMs}
          durationMs={duration}
          trackWidth={trackWidth}
          onSeek={(ms) => void intents.seek(ms)}
        />
        <PlaybackControls
          status={player.status}
          mode={player.mode}
          onToggle={() => void intents.toggle()}
          onNext={() => void intents.next()}
          onPrevious={() => void intents.previous()}
          onCycleMode={() => void intents.cycleMode()}
          onOpenQueue={() => services.analytics.track('queue_open', {})}
          onRetry={() => void intents.retry()}
        />
        <Pressable
          accessibilityLabel={pane === 'lyrics' ? '返回封面' : '查看歌词'}
          onPress={() => setPane(pane === 'lyrics' ? 'artwork' : 'lyrics')}
          id="now-playing-toggle-lyrics"
          style={{
            paddingLeft: `${theme.spacing.x4}px`,
            paddingRight: `${theme.spacing.x4}px`,
            height: 36,
            borderRadius: `${theme.radius.pill}px`,
            backgroundColor: theme.colors.surfaceRaised,
            justifyContent: 'center',
          }}
        >
          <Text variant="caption" color="secondary">
            {pane === 'lyrics' ? '返回封面' : '歌词'}
          </Text>
        </Pressable>
      </view>

      {player.error ? (
        <view style={{ paddingLeft: `${theme.spacing.x6}px`, paddingRight: `${theme.spacing.x6}px`, paddingBottom: `${theme.spacing.x3}px` }}>
          <Text variant="caption" color="error" style={{ textAlign: 'center' }}>
            {player.error.userMessage}
          </Text>
        </view>
      ) : null}
    </OverlayFrame>
  );
}

function LyricsPane({
  trackId,
  positionMs,
  layout,
}: {
  trackId: string;
  positionMs: number;
  layout: NowPlayingLayout;
}) {
  const services = getServices();
  const resource = useAsyncResource<LyricLine[]>(
    (signal) => services.repository.getLyrics(trackId, { signal }),
    [trackId],
  );

  const lines = resource.state.status === 'success' ? resource.state.data : [];

  return (
    <view style={{ height: `${layout.artworkSize}px`, paddingLeft: `${24}px`, paddingRight: `${24}px` }}>
      <LyricsView
        lines={lines}
        positionMs={positionMs}
        loading={resource.state.status === 'loading'}
        hasLyrics={lines.length > 0}
      />
    </view>
  );
}

export function OverlayFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <view
      id="overlay-frame"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.background,
        zIndex: 10,
      }}
    >
      {children}
    </view>
  );
}