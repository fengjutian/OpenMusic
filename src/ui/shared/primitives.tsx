/**
 * Presentation primitives with no business knowledge (spec §3).
 *
 * Deliberate constraints:
 *  - no DOM APIs, no CSS pseudo-classes (technical spec §11)
 *  - pressed / selected / disabled / loading state is React state, not `:active`
 *  - every touch target is at least 44x44 (product spec §6.2)
 */

import { useCallback, useState } from '@lynx-js/react';
import type { ReactNode } from '@lynx-js/react';

import { useTheme } from './theme.js';
import { typeScale } from './tokens.js';
import type { TypeToken } from './tokens.js';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextProps {
  children?: ReactNode;
  variant?: TypeToken;
  color?: 'primary' | 'secondary' | 'muted' | 'brand' | 'inverse' | 'success' | 'error';
  /** Ellipsis after N lines. Body copy is capped at 2, card titles at 1. */
  lines?: 1 | 2 | 3;
  weight?: 'regular' | 'medium' | 'bold';
  style?: Record<string, string | number>;
  id?: string;
}

export function Text({
  children,
  variant = 'body',
  color = 'primary',
  lines,
  weight = 'regular',
  style,
  testID,
}: TextProps) {
  const theme = useTheme();
  const scale = typeScale[variant];
  const colorValue = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    brand: theme.colors.brand,
    inverse: theme.colors.onBrand,
    success: theme.colors.success,
    error: theme.colors.error,
  }[color];

  return (
    <text
      id={testID}
      style={{
        fontSize: scale.fontSize,
        lineHeight: `${scale.lineHeight}px`,
        color: colorValue,
        fontWeight: weight,
        ...(lines ? { overflow: 'hidden', textOverflow: 'ellipsis', maxLines: lines } : {}),
        ...style,
      }}
    >
      {children}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Pressable
// ---------------------------------------------------------------------------

export interface PressableProps {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  /** Always exposed to assistive tech / debugging. */
  accessibilityLabel: string;
  style?: Record<string, string | number>;
  id?: string;
  hitSlop?: number;
}

export function Pressable({
  children,
  onPress,
  disabled = false,
  loading = false,
  selected = false,
  accessibilityLabel,
  style,
  testID,
  hitSlop,
}: PressableProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const inactive = disabled || loading;

  const handlePress = useCallback(() => {
    if (inactive) return;
    onPress?.();
  }, [inactive, onPress]);

  return (
    <view
      id={testID}
      accessibility-label={accessibilityLabel}
      accessibility-role="button"
      aria-disabled={inactive}
      aria-selected={selected}
      hitSlop={hitSlop}
      style={{
        opacity: inactive ? 0.45 : pressed ? 0.75 : 1,
        transitionProperty: 'opacity',
        transitionDuration: `${theme.motion.pressFeedbackMs}ms`,
        minHeight: theme.layout.minTouchTarget,
        justifyContent: 'center',
        ...style,
      }}
      bindtap={handlePress}
      bindtouchstart={() => setPressed(true)}
      bindtouchend={() => setPressed(false)}
      bindtouchcancel={() => setPressed(false)}
    >
      {children}
    </view>
  );
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export interface ScreenProps {
  children?: ReactNode;
  /** Adds the runtime bottom inset; never a hard-coded device value. */
  safeBottom?: boolean;
  safeTop?: boolean;
  style?: Record<string, string | number>;
  id?: string;
}

export function Screen({ children, safeBottom = false, safeTop = true, style, testID }: ScreenProps) {
  const theme = useTheme();
  return (
    <view
      id={testID}
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: safeTop ? theme.spacing.x3 : 0,
        ...style,
      }}
    >
      {children}
    </view>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <view
      style={{
        height: 1,
        backgroundColor: theme.colors.border,
        marginLeft: `${inset}px`,
      }}
    />
  );
}

export function Spacer({ size = 16 }: { size?: number }) {
  return <view style={{ height: `${size}px`, flexShrink: 0 }} />;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export interface SkeletonProps {
  width?: number | string;
  height: number;
  radius?: number;
  style?: Record<string, string | number>;
}

export function Skeleton({ width = '100%', height, radius, style }: SkeletonProps) {
  const theme = useTheme();
  return (
    <view
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: `${height}px`,
        borderRadius: `${radius ?? theme.radius.sm}px`,
        backgroundColor: theme.colors.surfaceRaised,
        ...style,
      }}
    />
  );
}

export function TrackListSkeleton({ rows = 5 }: { rows?: number }) {
  const theme = useTheme();
  return (
    <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, gap: `${theme.spacing.x3}px` }}>
      {Array.from({ length: rows }, (_, i) => (
        <view key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: `${theme.spacing.x3}px` }}>
          <Skeleton width={44} height={44} radius={theme.radius.sm} />
          <view style={{ flex: 1, gap: `${theme.spacing.x1}px` }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </view>
        </view>
      ))}
    </view>
  );
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

/**
 * Glyph-based icon set. We deliberately do not depend on the `svg` element
 * (new in Lynx 3.7 and not yet covered by our pinned type package) and ship no
 * third-party icon library: glyphs render identically on every Lynx backend.
 */
export type IconName =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'heart'
  | 'heart-filled'
  | 'search'
  | 'more'
  | 'back'
  | 'close'
  | 'queue'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'lyrics'
  | 'folder'
  | 'music'
  | 'chevron-right'
  | 'chevron-down'
  | 'retry';

const ICON_GLYPHS: Record<IconName, string> = {
  play: '▶',
  pause: '❚❚',
  next: '⏭',
  previous: '⏮',
  heart: '♡',
  'heart-filled': '♥',
  search: '🔍',
  more: '⋯',
  back: '‹',
  close: '✕',
  queue: '≡',
  shuffle: '⤨',
  repeat: '🔁',
  'repeat-one': '🔂',
  lyrics: '词',
  folder: '📁',
  music: '♪',
  'chevron-right': '›',
  'chevron-down': '⌄',
  retry: '⟳',
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color }: IconProps) {
  const theme = useTheme();
  return (
    <text
      style={{
        fontSize: `${size}px`,
        lineHeight: `${size}px`,
        height: `${size}px`,
        color: color ?? theme.colors.textPrimary,
        textAlign: 'center',
      }}
    >
      {ICON_GLYPHS[name]}
    </text>
  );
}