/**
 * Ambient globals injected by the build.
 *
 * This file must stay module-free (no top-level `import`/`export`), otherwise
 * `declare const` becomes module-scoped instead of global.
 */

/** Injected by `source.define` in `lynx.config.ts`. */
declare const __OPENMUSIC_PLATFORM__: 'android' | 'windows';