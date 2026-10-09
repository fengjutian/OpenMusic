/**
 * Design tokens. Single source of truth (technical spec §4).
 *
 * No component may hard-code a brand colour or an ad-hoc gap. Colours must be
 * resolved through `useTheme()` so that a future light theme is a data change,
 * not a code change.
 */

export const colors = {
  dark: {
    background: '#0F1012',
    surface: '#18191D',
    surfaceRaised: '#232429',
    textPrimary: '#F7F7F8',
    textSecondary: '#A7A8AE',
    textMuted: '#73757D',
    border: '#303139',
    brand: '#E83B45',
    onBrand: '#FFFFFF',
    success: '#39B980',
    warning: '#F5A524',
    error: '#F04444',
  },
  light: {
    background: '#F7F7F8',
    surface: '#FFFFFF',
    surfaceRaised: '#F0F0F2',
    textPrimary: '#141416',
    textSecondary: '#5A5C64',
    textMuted: '#8A8C94',
    border: '#E2E2E6',
    brand: '#D62F39',
    onBrand: '#FFFFFF',
    success: '#1F9D6B',
    warning: '#C77F0A',
    error: '#D32F2F',
  },
} as const;

export type ColorSchemeName = keyof typeof colors;
export type ThemeColors = (typeof colors)[ColorSchemeName];

export const spacing = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x6: 24,
  x8: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typeScale = {
  display: { fontSize: 24, lineHeight: 30 },
  section: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11, lineHeight: 16 },
} as const;

export type TypeToken = keyof typeof typeScale;

/**
 * Layout constants. Safe-area insets are runtime values, never baked in
 * (technical spec §7) — these are only the structural heights.
 */
export const layout = {
  bottomTabBarHeight: 56,
  miniPlayerHeight: 60,
  topBarHeight: 52,
  /** Minimum interactive target, product spec §6.2. */
  minTouchTarget: 44,
  /** Windows breakpoint below which the secondary column is hidden. */
  windowsCompactBreakpoint: 900,
  windowsMediumBreakpoint: 1280,
} as const;

export const motion = {
  pageTransitionMs: 200,
  pressFeedbackMs: 100,
  playerExpandMs: 320,
} as const;

export interface Theme {
  name: ColorSchemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typeScale: typeof typeScale;
  layout: typeof layout;
  motion: typeof motion;
}

export const themes: Record<ColorSchemeName, Theme> = {
  dark: {
    name: 'dark',
    colors: colors.dark,
    spacing,
    radius,
    typeScale,
    layout,
    motion,
  },
  light: {
    name: 'light',
    colors: colors.light,
    spacing,
    radius,
    typeScale,
    layout,
    motion,
  },
};