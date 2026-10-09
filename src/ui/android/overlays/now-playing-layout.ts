/**
 * Layout contract for the full-screen now-playing overlay.
 *
 * The overlay is reused by both platforms; the Windows sidebar and the Android
 * safe area make a single set of constants wrong. The shell that mounts the
 * overlay supplies the available size, and this module exposes the default
 * that the Android shell uses today.
 */

export interface NowPlayingLayout {
  /** Edge-to-edge artwork + lyric pane size, in px. */
  artworkSize: number;
  /** Width of the seek bar. See ADR-0002. */
  trackWidth: number;
}

export const DEFAULT_NOW_PLAYING_LAYOUT: NowPlayingLayout = {
  artworkSize: 320,
  trackWidth: 320,
};