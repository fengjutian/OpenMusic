/**
 * Playback UI. Every control here is a thin intent dispatcher — none of them
 * talk to the audio engine (technical spec §6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from '@lynx-js/react';

import type { LyricLine, Track } from '../../domain/models.js';
import type { PlaybackMode } from '../../domain/models.js';
import { formatArtists, formatDuration } from '../../domain/format.js';
import { findLyricIndex, isSyncedLyrics, LYRIC_FOLLOW_PAUSE_MS } from '../../domain/lyrics.js';
import { useTheme } from './theme.js';
import { Artwork, TrackRow } from './media.jsx';
import { Icon, Pressable, Text } from './primitives.js';
import { EmptyState } from './states.js';
import { ProgressBar } from './inputs.jsx';

export interface MiniPlayerProps {
  track: Track | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';
  positionMs: number;
  durationMs: number;
  errorMessage?: string;
  onToggle: () => void;
  onNext: () => void;
  onExpand: () => void;
  onRetry?: () => void;
  id?: string;
}

/**
 * Persistent anchor above the tab bar. Renders nothing when there is no track,
 * so the layout collapses instead of leaving an empty strip.
 */
export function MiniPlayer({
  track,
  status,
  positionMs,
  durationMs,
  errorMessage,
  onToggle,
  onNext,
  onExpand,
  onRetry,
  id,
}: MiniPlayerProps) {
  const theme = useTheme();
  if (!track) return null;

  const buffering = status === 'loading' || status === 'buffering';
  const failed = status === 'error';

  return (
    <view
      id={id ?? 'mini-player'}
      style={{
        height: `${theme.layout.miniPlayerHeight}px`,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: `${theme.spacing.x3}px`,
        paddingRight: `${theme.spacing.x3}px`,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        gap: `${theme.spacing.x2}px`,
      }}
    >
      <Pressable
        accessibilityLabel={`展开全屏播放页：${track.title}`}
        onPress={onExpand}
        id="mini-player-expand"
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: `${theme.spacing.x2}px` }}
      >
        <Artwork src={track.coverUrl} size={40} />
        <view style={{ flex: 1 }}>
          <Text variant="caption" lines={1} color={failed ? 'error' : 'primary'}>
            {track.title}
          </Text>
          <Text variant="label" color="muted" lines={1}>
            {formatArtists(track.artists.map((a) => a.name))}
          </Text>
        </view>
      </Pressable>

      <ViewProgress positionMs={positionMs} durationMs={durationMs || track.durationMs} />

      {failed ? (
        <Pressable
          accessibilityLabel="重试播放"
          onPress={onRetry}
          hitSlop={`8px`}
          id="mini-player-retry"
          style={{ width: 44, alignItems: 'center' }}
        >
          <Icon name="retry" size={20} color={theme.colors.error} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={status === 'playing' ? '暂停' : '播放'}
          onPress={onToggle}
          disabled={buffering}
          id="mini-player-toggle"
          style={{ width: 44, alignItems: 'center' }}
        >
          {buffering ? (
            <Text variant="caption" color="muted">
              …
            </Text>
          ) : (
            <Icon
              name={status === 'playing' ? 'pause' : 'play'}
              size={20}
              color={theme.colors.textPrimary}
            />
          )}
        </Pressable>
      )}

      <Pressable
        accessibilityLabel="下一首"
        onPress={onNext}
        hitSlop={`8px`}
        id="mini-player-next"
        style={{ width: 44, alignItems: 'center' }}
      >
        <Icon name="next" size={18} color={theme.colors.textPrimary} />
      </Pressable>

      {failed && errorMessage ? null : null}
    </view>
  );
}

function ViewProgress({ positionMs, durationMs }: { positionMs: number; durationMs: number }) {
  const theme = useTheme();
  return (
    <view style={{ width: 64 }}>
      <view
        style={{
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <view
          style={{
            width: `${durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0}%`,
            height: 2,
            backgroundColor: theme.colors.brand,
          }}
        />
      </view>
    </view>
  );
}

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------

export interface PlaybackControlsProps {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';
  mode: PlaybackMode;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onCycleMode: () => void;
  onOpenQueue: () => void;
  onRetry?: () => void;
}

export function PlaybackControls({
  status,
  mode,
  onToggle,
  onNext,
  onPrevious,
  onCycleMode,
  onOpenQueue,
  onRetry,
}: PlaybackControlsProps) {
  const theme = useTheme();
  const busy = status === 'loading' || status === 'buffering';

  return (
    <view
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${theme.spacing.x4}px`,
        paddingTop: `${theme.spacing.x3}px`,
        paddingBottom: `${theme.spacing.x3}px`,
      }}
    >
      <Pressable accessibilityLabel="随机播放" selected={mode === 'shuffle'} onPress={onCycleMode} id="control-mode" style={{ width: 44, alignItems: 'center' }}>
        <Icon name="shuffle" size={18} color={mode === 'shuffle' ? theme.colors.brand : theme.colors.textSecondary} />
      </Pressable>

      <Pressable accessibilityLabel="上一首" onPress={onPrevious} id="control-previous" style={{ width: 44, alignItems: 'center' }}>
        <Icon name="previous" size={26} color={theme.colors.textPrimary} />
      </Pressable>

      {status === 'error' && onRetry ? (
        <Pressable
          accessibilityLabel="重试播放"
          onPress={onRetry}
          id="control-retry"
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brand,
          }}
        >
          <Icon name="retry" size={26} color={theme.colors.onBrand} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={status === 'playing' ? '暂停' : '播放'}
          disabled={busy}
          onPress={onToggle}
          id="control-toggle"
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brand,
          }}
        >
          {busy ? (
            <Text variant="section" color="inverse">
              …
            </Text>
          ) : (
            <Icon name={status === 'playing' ? 'pause' : 'play'} size={26} color={theme.colors.onBrand} />
          )}
        </Pressable>
      )}

      <Pressable accessibilityLabel="下一首" onPress={onNext} id="control-next" style={{ width: 44, alignItems: 'center' }}>
        <Icon name="next" size={26} color={theme.colors.textPrimary} />
      </Pressable>

      <Pressable
        accessibilityLabel={mode === 'repeat-one' ? '单曲循环' : '循环播放'}
        selected={mode !== 'sequential'}
        onPress={onCycleMode}
        id="control-repeat"
        style={{ width: 44, alignItems: 'center' }}
      >
        <Icon
          name={mode === 'repeat-one' ? 'repeat-one' : 'repeat'}
          size={18}
          color={mode !== 'sequential' ? theme.colors.brand : theme.colors.textSecondary}
        />
      </Pressable>

      <Pressable accessibilityLabel="播放队列" onPress={onOpenQueue} id="control-queue" style={{ width: 44, alignItems: 'center' }}>
        <Icon name="queue" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </view>
  );
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueListProps {
  contextTitle: string;
  tracks: Track[];
  /** Track id at the playhead; drives the brand-colour highlight. */
  currentTrackId: string | null;
  manualCount: number;
  onSelect: (index: number) => void;
  onRemove: (trackId: string) => void;
  onMove: (from: number, to: number) => void;
  onClearManual: () => void;
}

export function QueueList({
  contextTitle,
  tracks,
  currentTrackId,
  manualCount,
  onSelect,
  onRemove,
  onMove,
  onClearManual,
}: QueueListProps) {
  const theme = useTheme();
  return (
    <view style={{ gap: `${theme.spacing.x1}px` }}>
      <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingBottom: `${theme.spacing.x2}px` }}>
        <Text variant="caption" color="secondary">
          正在播放：{contextTitle}
        </Text>
      </view>

      {manualCount > 0 ? (
        <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingBottom: `${theme.spacing.x2}px` }}>
          <Pressable
            accessibilityLabel="清空手动添加的歌曲"
            onPress={onClearManual}
            id="queue-clear-manual"
            style={{ alignSelf: 'flex-start', paddingTop: 8, paddingBottom: 8 }}
          >
            <Text variant="caption" color="brand">
              清空手动添加（{manualCount}）
            </Text>
          </Pressable>
        </view>
      ) : null}

      {tracks.length === 0 ? (
        <EmptyState title="队列是空的" hint="从歌单或搜索结果里播放一首歌试试" compact />
      ) : (
        tracks.map((track, i) => (
          <view key={track.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <view style={{ flex: 1 }}>
              <TrackRow
                track={track}
                index={i}
                playing={track.id === currentTrackId}
                onPress={() => onSelect(i)}
                onOpenMenu={() => onRemove(track.id)}
                id={`queue-row-${track.id}`}
              />
            </view>
            {/* Drag-to-reorder is not guaranteed across backends, so the spec
                explicitly allows up/down as the first release (spec §7.9). */}
            <Pressable
              accessibilityLabel={`下移 ${track.title}`}
              disabled={i >= tracks.length - 1}
              onPress={() => onMove(i, i + 1)}
              hitSlop={`6px`}
              style={{ width: 40, alignItems: 'center' }}
            >
              <Icon name="chevron-down" size={16} color={theme.colors.textMuted} />
            </Pressable>
          </view>
        ))
      )}
    </view>
  );
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

export interface LyricsViewProps {
  lines: LyricLine[];
  positionMs: number;
  loading?: boolean;
  hasLyrics: boolean;
  showTranslation?: boolean;
}

/**
 * Auto-centring follows the active line, but yields to the user for 4s after
 * any manual scroll, and offers an explicit "回到当前歌词" affordance.
 */
export function LyricsView({
  lines,
  positionMs,
  loading = false,
  hasLyrics,
  showTranslation = true,
}: LyricsViewProps) {
  const theme = useTheme();
  const sorted = useMemo(
    () => lines.slice().sort((a, b) => a.startMs - b.startMs),
    [lines],
  );
  const activeIndex = findLyricIndex(sorted, positionMs);

  /**
   * Auto-follow yields to manual scrolling for 4s.
   *
   * Implemented as a boolean plus a timer rather than comparing `Date.now()`
   * during render: render must be pure, and a render-time clock read would
   * never re-evaluate on its own — the "回到当前歌词" button would stay
   * visible forever.
   */
  const [following, setFollowing] = useState(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const onUserScroll = useCallback(() => {
    setFollowing(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setFollowing(true);
      resumeTimerRef.current = null;
    }, LYRIC_FOLLOW_PAUSE_MS);
  }, []);

  if (loading) {
    return (
      <view style={{ padding: `${theme.spacing.x6}px` }}>
        <Text variant="caption" color="muted">
          歌词加载中…
        </Text>
      </view>
    );
  }

  if (!hasLyrics || sorted.length === 0) {
    return <EmptyState title="这首歌还没有歌词" hint="可以尝试从本地文件读取内嵌歌词" compact />;
  }

  // Unsynced lyrics render as plain text, never as a fake timeline.
  if (!isSyncedLyrics(sorted)) {
    return (
      <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
        <view style={{ padding: `${theme.spacing.x4}px`, gap: `${theme.spacing.x2}px` }}>
          {sorted.map((line, i) => (
            <Text key={i} variant="body" lines={2} color="secondary">
              {line.text}
            </Text>
          ))}
        </view>
      </scroll-view>
    );
  }

  return (
    <view style={{ flex: 1 }}>
      <scroll-view style={{ flex: 1 }} scroll-bar-enable={false} bindtouchmove={onUserScroll} bindscroll={onUserScroll}>
        <view style={{ paddingTop: `${theme.spacing.x8}px`, paddingBottom: `${theme.spacing.x8}px`, paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, gap: `${theme.spacing.x3}px` }}>
          {sorted.map((line, i) => {
            const active = following && i === activeIndex;
            return (
              <view key={`${line.startMs}-${i}`} style={{ gap: 2 }}>
                <Text
                  variant={active ? 'section' : 'body'}
                  weight={active ? 'medium' : 'normal'}
                  color={active ? 'primary' : 'muted'}
                  lines={2}
                >
                  {line.text}
                </Text>
                {showTranslation && line.translation ? (
                  <Text variant="caption" color="muted" lines={2}>
                    {line.translation}
                  </Text>
                ) : null}
              </view>
            );
          })}
        </view>
      </scroll-view>

      {!following ? (
        <Pressable
          accessibilityLabel="回到当前歌词"
          onPress={() => setFollowing(true)}
          id="lyrics-follow-button"
          style={{
            position: 'absolute',
            right: `${theme.spacing.x4}px`,
            bottom: `${theme.spacing.x4}px`,
            paddingLeft: `${theme.spacing.x3}px`,
            paddingRight: `${theme.spacing.x3}px`,
            height: 36,
            borderRadius: `${theme.radius.pill}px`,
            backgroundColor: theme.colors.surfaceRaised,
            justifyContent: 'center',
          }}
        >
          <Text variant="label" color="secondary">
            回到当前歌词
          </Text>
        </Pressable>
      ) : null}
    </view>
  );
}

export function NowPlayingProgress({
  positionMs,
  durationMs,
  trackWidth,
  onSeek,
}: {
  positionMs: number;
  durationMs: number;
  trackWidth: number;
  onSeek: (ms: number) => void;
}) {
  const theme = useTheme();
  return (
    <view style={{ paddingLeft: `${theme.spacing.x6}px`, paddingRight: `${theme.spacing.x6}px`, width: trackWidth + 48 }}>
      <ProgressBar
        positionMs={positionMs}
        durationMs={durationMs}
        trackWidth={trackWidth}
        onSeek={onSeek}
        id="now-playing-progress"
      />
      <view style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" color="muted">
          {formatDuration(positionMs)}
        </Text>
        <Text variant="label" color="muted">
          {formatDuration(durationMs)}
        </Text>
      </view>
    </view>
  );
}