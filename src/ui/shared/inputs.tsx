/**
 * Input components. `Slider` is built from touch events on a plain view
 * because we cannot verify a native slider widget on every backend
 * (technical spec §8 / §11).
 */

import { useCallback, useState } from '@lynx-js/react';

import { useTheme } from './theme.js';
import { Icon, Pressable, Text } from './primitives.js';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = '搜索歌曲、歌手、专辑',
  autoFocus = false,
  testID,
}: SearchFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <view
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: `${theme.spacing.x2}px`,
        height: 44,
        paddingLeft: `${theme.spacing.x3}px`,
        paddingRight: `${theme.spacing.x3}px`,
        borderRadius: `${theme.radius.pill}px`,
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: focused ? theme.colors.brand : theme.colors.border,
      }}
    >
      <Icon name="search" size={16} color={theme.colors.textMuted} />
      <input
        id={testID ?? 'search-input'}
        value={value}
        placeholder={placeholder}
        placeholderStyle={`color: ${theme.colors.textMuted}; font-size: 15px;`}
        style={{ flex: 1, height: 44, color: theme.colors.textPrimary, fontSize: 15 }}
        bindinput={(e) => onChange(e.detail.value ?? '')}
        bindconfirm={() => onSubmit?.()}
        bindfocus={() => setFocused(true)}
        bindblur={() => setFocused(false)}
        autofocus={autoFocus}
        type="text"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel="清空搜索"
          onPress={() => onChange('')}
          hitSlop={8}
          id="search-clear"
          style={{ width: 32, alignItems: 'center' }}
        >
          <Icon name="close" size={14} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </view>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  id?: string;
}

export function Chip({ label, selected = false, onPress, testID }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      selected={selected}
      onPress={onPress}
      id={testID}
      style={{
        paddingLeft: `${theme.spacing.x3}px`,
        paddingRight: `${theme.spacing.x3}px`,
        height: 32,
        borderRadius: `${theme.radius.pill}px`,
        justifyContent: 'center',
        backgroundColor: selected ? theme.colors.brand : theme.colors.surfaceRaised,
        marginRight: `${theme.spacing.x2}px`,
      }}
    >
      <Text variant="caption" color={selected ? 'inverse' : 'secondary'} weight={selected ? 'medium' : 'regular'}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface SegmentedTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix?: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix = 'segment',
}: SegmentedTabsProps<T>) {
  const theme = useTheme();
  return (
    <view
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceRaised,
        borderRadius: `${theme.radius.md}px`,
        padding: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            selected={selected}
            onPress={() => onChange(option.value)}
            id={`${testIDPrefix}-${option.value}`}
            style={{
              flex: 1,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${theme.radius.sm}px`,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
            }}
          >
            <Text variant="caption" weight={selected ? 'medium' : 'regular'} color={selected ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </view>
  );
}

export interface ProgressBarProps {
  positionMs: number;
  durationMs: number;
  onSeek?: (positionMs: number) => void;
  height?: number;
  /**
   * Width of the track in px. Required for scrubbing.
   *
   * Why a prop and not a measurement: `@lynx-js/types` exposes no layout
   * measurement API, and `touches[0].x` is documented as relative to the
   * touched element, so the caller — which already knows its own layout — must
   * supply the width. See ADR-0002.
   */
  trackWidth: number;
  id?: string;
}

export function ProgressBar({
  positionMs,
  durationMs,
  onSeek,
  height = 3,
  trackWidth,
  testID,
}: ProgressBarProps) {
  const theme = useTheme();
  const [dragging, setDragging] = useState<number | null>(null);

  const ratio = durationMs > 0 ? Math.max(0, Math.min(1, (dragging ?? positionMs) / durationMs)) : 0;

  // `Touch.x` is relative to the touched element (verified against
  // @lynx-js/types `events.d.ts`), which is exactly the bar we attach to.
  const ratioFromEvent = useCallback((event: TouchEvent) => {
    const x = event.touches?.[0]?.x ?? 0;
    return Math.max(0, Math.min(1, x / (trackWidth || 1)));
  }, [trackWidth]);

  return (
    <view
      id={testID}
      style={{ width: `${trackWidth}px`, paddingTop: `${theme.spacing.x2}px`, paddingBottom: `${theme.spacing.x2}px` }}
      bindtouchstart={(event) => {
        if (!onSeek) return;
        setDragging(ratioFromEvent(event));
      }}
      bindtouchmove={(event) => {
        if (!onSeek) return;
        setDragging(ratioFromEvent(event));
      }}
      bindtouchend={(event) => {
        if (!onSeek) return;
        const ratioAtRelease = ratioFromEvent(event);
        setDragging(null);
        onSeek(ratioAtRelease * durationMs);
      }}
      bindtouchcancel={() => setDragging(null)}
    >
      <view
        style={{
          width: `${trackWidth}px`,
          height: `${height}px`,
          borderRadius: height,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <view
          style={{
            width: `${ratio * 100}%`,
            height: `${height}px`,
            backgroundColor: theme.colors.brand,
          }}
        />
      </view>
    </view>
  );
}