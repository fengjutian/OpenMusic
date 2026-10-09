/**
 * Player hooks. One file per hook so a HMR edit only re-runs the affected
 * subscriber, and so the react-refresh/only-export-components rule can be
 * re-enabled in `eslint.config.mjs`.
 *
 * Re-exports the public surface below so existing call sites
 * `import { usePlayerIntents } from '.../use-player'` keep working.
 */

export { usePlayerIntents, useLikeToggle, useRestorePlayer, buildPlaybackContext } from './intents';
export {
  usePlayerSnapshot,
  usePlayerStatus,
  usePlayerProgress,
  usePlaybackTrack,
  useCurrentTrackId,
  usePlayerFull,
} from './snapshots';
export { ConnectedMiniPlayer } from './connected-mini-player';
export type { PlayerIntent, PlaybackContextSource } from './intents';
export type { PlayerProgress } from './snapshots';