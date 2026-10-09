/**
 * Player hooks. One file per hook so a HMR edit only re-runs the affected
 * subscriber, and so the react-refresh/only-export-components rule can be
 * re-enabled in `eslint.config.mjs`.
 *
 * Re-exports the public surface below so existing call sites
 * `import { usePlayerIntents } from '.../use-player'` keep working.
 */

export { usePlayerIntents, usePlayerFull, useLikeToggle, useRestorePlayer } from './use-player/intents.js';
export { usePlayerSnapshot, usePlayerStatus, usePlayerProgress, usePlaybackTrack, useCurrentTrackId } from './use-player/snapshots.js';
export { ConnectedMiniPlayer } from './use-player/connected-mini-player.jsx';
export type { PlayerIntent, PlaybackContextSource } from './use-player/intents.js';
export type { PlayerProgress } from './use-player/snapshots.js';
export { buildPlaybackContext } from './use-player/intents.js';