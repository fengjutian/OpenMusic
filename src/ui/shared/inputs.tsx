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
  id?: string;
}

/**
 * Lynx `<input>` is **uncontrolled**: `@lynx-js/types` `InputProps` exposes
 * `default-value` (first render only) plus `bindinput`, and no `value` setter.
 *
 * Consequences accepted rather than papered over:
 *  - keystrokes flow through `bindinput` instead of a re-render per character
 *  - a programmatic clear bumps `fieldKey`, remounting the element so the
 *    native text really is emptied
 *  - `confirm-type` replaces the DOM `type` attribute
 *
 * Evidence: `node_modules/@lynx-js/types/types/common/element/input.d.ts`.
 */

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = '搜索歌曲、歌手、专辑',
  id,
}: SearchFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);

  const clear = useCallback(() => {
    onChange('');
    setFieldKey((k) => k + 1);
  }, [onChange]);

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
        key={fieldKey}
        id={id ?? 'search-input'}
        default-value={value}
        placeholder={placeholder}
        placeholder-style={`color: ${theme.colors.textMuted}; font-size: 15px;`}
        style={{ flex: 1, height: 44, color: theme.colors.textPrimary, fontSize: 15 }}
        bindinput={(event) => onChange(event.detail.value ?? '')}
        bindconfirm={() => onSubmit?.()}
        bindfocus={() => setFocused(true)}
        bindblur={() => setFocused(false)}
        confirm-type="search"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel="清空搜索"
          onPress={clear}
          hitSlop={`8px`}
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

export function Chip({ label, selected = false, onPress, id }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      selected={selected}
      onPress={onPress}
      id={id}
      data-testid={id}
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
      <Text variant="caption" color={selected ? 'inverse' : 'secondary'} weight={selected ? 'medium' : 'normal'}>
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
            <Text variant="caption" weight={selected ? 'medium' : 'normal'} color={selected ? 'primary' : 'secondary'}>
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
  id,
}: ProgressBarProps) {
  const theme = useTheme();
  const [dragging, setDragging] = useState<number | null>(null);

  const ratio = durationMs > 0 ? Math.max(0, Math.min(1, (dragging ?? positionMs) / durationMs)) : 0;

  // `Touch.x` is documented as relative to the touched element, which is the
  // bar we attach to. Typed structurally so we bind to the background-thread
  // event shape rather than the main-thread worklet one.
  const ratioFromEvent = useCallback(
    (event: { touches?: ReadonlyArray<{ x?: number }> }) => {
      const x = event.touches?.[0]?.x ?? 0;
      return Math.max(0, Math.min(1, x / (trackWidth || 1)));
    },
    [trackWidth],
  );

  return (
    <view
      id={id}
      data-testid={id}
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