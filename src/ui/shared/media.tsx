/**
 * Content components: artwork, cards, rows, shelves.
 *
 * Artwork is centralised so that placeholder / failure / fade-in / radius /
 * requested size behave identically everywhere (technical spec §10.1).
 */

import { useState } from '@lynx-js/react';
import type { ReactNode } from '@lynx-js/react';

import type { HomeItem, HomeShelf, Track } from '../../domain/models.js';
import { formatArtists, formatCount, formatDuration } from '../../domain/format.js';
import { useTheme } from './theme.js';
import { Icon, Pressable, Skeleton, Text } from './primitives.js';

export type ArtworkShape = 'square' | 'circle' | 'banner';

export interface ArtworkProps {
  src?: string;
  size: number;
  shape?: ArtworkShape;
  /** Fallback glyph shown while loading or after a failure. */
  fallbackIcon?: 'music' | 'folder' | 'lyrics';
  radiusOverride?: number;
  id?: string;
}

/**
 * Local-first artwork: object URLs / asset:// handles resolve through the
 * platform adapter, and any failure degrades to a tinted placeholder rather
 * than a broken-image box.
 */
export function Artwork({
  src,
  size,
  shape = 'square',
  fallbackIcon = 'music',
  radiusOverride,
  id,
}: ArtworkProps) {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'loaded' | 'failed'>(
    src ? 'idle' : 'failed',
  );

  const radius =
    radiusOverride ?? (shape === 'circle' ? size / 2 : shape === 'banner' ? theme.radius.md : theme.radius.sm);

  return (
    <view
      id={id}
      data-testid={id}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${radius}px`,
        backgroundColor: theme.colors.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {status !== 'loaded' ? (
        <Icon name={fallbackIcon} size={Math.round(size * 0.34)} color={theme.colors.textMuted} />
      ) : null}
      {src && status !== 'failed' ? (
        <image
          src={src}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: `${radius}px`,
            opacity: status === 'loaded' ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: '180ms',
          }}
          bindload={() => setStatus('loaded')}
          binderror={() => setStatus('failed')}
        />
      ) : null}
    </view>
  );
}

// ---------------------------------------------------------------------------
// Track row
// ---------------------------------------------------------------------------

export interface TrackRowProps {
  track: Track;
  index?: number;
  /** Currently playing — brand colour + equaliser bars (spec §7.4). */
  playing?: boolean;
  buffering?: boolean;
  liked?: boolean;
  likePending?: boolean;
  onPress?: () => void;
  onToggleLike?: () => void;
  onOpenMenu?: () => void;
  showArtwork?: boolean;
  id?: string;
}

export function TrackRow({
  track,
  index,
  playing = false,
  buffering = false,
  liked = false,
  likePending = false,
  onPress,
  onToggleLike,
  onOpenMenu,
  showArtwork = true,
  id,
}: TrackRowProps) {
  const theme = useTheme();
  const dim = !track.playable;

  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: `${theme.spacing.x4}px`,
        paddingRight: `${theme.spacing.x4}px`,
        paddingTop: `${theme.spacing.x2}px`,
        paddingBottom: `${theme.spacing.x2}px`,
        gap: `${theme.spacing.x3}px`,
        opacity: dim ? 0.45 : 1,
        minHeight: theme.layout.minTouchTarget + 8,
      }}
    >
      <Pressable
        accessibilityLabel={
          track.playable ? `播放 ${track.title}` : `${track.title}，${track.unavailableReason ?? '不可播放'}`
        }
        disabled={!track.playable}
        onPress={onPress}
        id={id ?? `track-row-${track.id}`}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: `${theme.spacing.x3}px` }}
      >
        {showArtwork ? (
          playing ? (
            <EqualizerBars buffering={buffering} />
          ) : index !== undefined ? (
            <view style={{ width: 44, alignItems: 'center' }}>
              <Text variant="caption" color={dim ? 'muted' : 'secondary'}>
                {index + 1}
              </Text>
            </view>
          ) : (
            <Artwork src={track.coverUrl} size={44} />
          )
        ) : null}

        <view style={{ flex: 1, gap: 2 }}>
          <Text
            variant="body"
            lines={1}
            color={playing ? 'brand' : dim ? 'muted' : 'primary'}
            weight={playing ? 'medium' : 'normal'}
          >
            {track.title}
          </Text>
          <Text variant="caption" color="secondary" lines={1}>
            {formatArtists(track.artists.map((a) => a.name))}
          </Text>
          {!track.playable && track.unavailableReason ? (
            <Text variant="label" color="muted" lines={1}>
              {track.unavailableReason}
            </Text>
          ) : null}
        </view>

        <Text variant="caption" color="muted">
          {track.playable ? formatDuration(track.durationMs) : '--:--'}
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel={liked ? `取消收藏 ${track.title}` : `收藏 ${track.title}`}
        loading={likePending}
        onPress={onToggleLike}
        hitSlop={`8px`}
        id={`like-${track.id}`}
        style={{ width: 44, alignItems: 'center' }}
      >
        <Icon name={liked ? 'heart-filled' : 'heart'} size={18} color={liked ? theme.colors.brand : theme.colors.textMuted} />
      </Pressable>

      <Pressable
        accessibilityLabel={`${track.title} 更多操作`}
        onPress={onOpenMenu}
        hitSlop={`8px`}
        id={`menu-${track.id}`}
        style={{ width: 44, alignItems: 'center' }}
      >
        <Icon name="more" size={18} color={theme.colors.textMuted} />
      </Pressable>
    </view>
  );
}

function EqualizerBars({ buffering }: { buffering: boolean }) {
  const theme = useTheme();
  return (
    <view
      accessibility-label="正在播放"
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 3,
      }}
    >
      {[10, 16, 12].map((h, i) => (
        <view
          key={i}
          style={{
            width: 3,
            height: `${buffering ? 6 : h}px`,
            borderRadius: 2,
            backgroundColor: theme.colors.brand,
          }}
        />
      ))}
    </view>
  );
}

// ---------------------------------------------------------------------------
// Cards & shelves
// ---------------------------------------------------------------------------

export interface MediaCardProps {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  shape?: ArtworkShape;
  cardWidth?: number;
  onPress?: () => void;
  id?: string;
}

export function MediaCard({
  title,
  subtitle,
  coverUrl,
  shape = 'square',
  cardWidth = 140,
  onPress,
  id,
}: MediaCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`打开 ${title}`}
      onPress={onPress}
      id={id}
      data-testid={id}
      style={{
        width: `${cardWidth}px`,
        // Leaves the next card peeking in, which is the scroll affordance
        // required by product spec §7.2.
        marginRight: `${theme.spacing.x3}px`,
        gap: `${theme.spacing.x2}px`,
      }}
    >
      <Artwork src={coverUrl} size={cardWidth} shape={shape} />
      <Text variant="caption" lines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="label" color="muted" lines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Renders a "查看全部" affordance only when a handler exists — never a
   *  dead entry (product spec §13). */
  showChevron?: boolean;
}

export function SectionHeader({ title, actionLabel, onAction, showChevron }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <view
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: `${theme.spacing.x4}px`,
        paddingRight: `${theme.spacing.x4}px`,
        paddingTop: `${theme.spacing.x2}px`,
        paddingBottom: `${theme.spacing.x2}px`,
      }}
    >
      <Text variant="section" weight="medium">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityLabel={`${title}，查看全部`} onPress={onAction} style={{ minWidth: 44 }}>
          <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text variant="caption" color="secondary">
              {actionLabel}
            </Text>
            <Icon name="chevron-right" size={14} color={theme.colors.textSecondary} />
          </view>
        </Pressable>
      ) : null}
      {!actionLabel && showChevron ? <Icon name="chevron-right" size={14} color={theme.colors.textMuted} /> : null}
    </view>
  );
}

export interface HorizontalShelfProps {
  shelf: HomeShelf;
  onOpenItem?: (item: HomeItem) => void;
  renderTrailing?: ReactNode;
}

export function HorizontalShelf({ shelf, onOpenItem }: HorizontalShelfProps) {
  const theme = useTheme();
  if (shelf.items.length === 0) return null;

  return (
    <view style={{ display: 'flex', flexDirection: 'column', gap: `${theme.spacing.x2}px` }}>
      <SectionHeader title={shelf.title} />
      <scroll-view
        scroll-orientation="horizontal"
        style={{ display: 'flex', flexDirection: 'row', paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px` }}
        scroll-bar-enable={false}
      >
        {shelf.items.map((item) => (
          <MediaCard
            key={`${shelf.id}:${item.id}`}
            title={item.title}
            subtitle={item.subtitle}
            coverUrl={item.coverUrl}
            onPress={() => onOpenItem?.(item)}
            id={`shelf-card-${shelf.id}-${item.id}`}
          />
        ))}
      </scroll-view>
    </view>
  );
}

export function ShelfSkeleton() {
  const theme = useTheme();
  return (
    <view style={{ display: 'flex', flexDirection: 'column', gap: `${theme.spacing.x2}px`, paddingTop: `${theme.spacing.x2}px` }}>
      <Skeleton width={120} height={20} style={{ marginLeft: `${theme.spacing.x4}px` }} />
      <scroll-view scroll-orientation="horizontal" style={{ display: 'flex', flexDirection: 'row' }}>
        {[0, 1, 2].map((i) => (
          <view key={i} style={{ display: 'flex', flexDirection: 'column', marginRight: `${theme.spacing.x3}px` }}>
            <Skeleton width={140} height={140} radius={theme.radius.sm} />
            <Skeleton width={100} height={12} style={{ marginTop: theme.spacing.x2 }} />
          </view>
        ))}
      </scroll-view>
    </view>
  );
}

export function StatPill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <view
      style={{
        paddingLeft: `${theme.spacing.x2}px`,
        paddingRight: `${theme.spacing.x2}px`,
        paddingTop: 4,
        paddingBottom: 4,
        borderRadius: `${theme.radius.sm}px`,
        backgroundColor: theme.colors.surfaceRaised,
      }}
    >
      <Text variant="label" color="secondary">
        {label}
      </Text>
    </view>
  );
}

export function formatPlaylistCount(count: number | undefined): string {
  return count === undefined ? '' : `${formatCount(count)} 首`;
}
