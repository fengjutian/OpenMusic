/**
 * `MiniPlayer` wired to the store.
 *
 * Kept separate from the presentational component so that a position tick only
 * re-renders the 60px strip, never the page behind it.
 */

import { getServices } from '../../../app/services.js';
import { MiniPlayer } from '../playback.jsx';
import { usePlayerIntents } from './intents.js';
import {
  usePlayerProgress,
  usePlayerStatus,
  usePlaybackTrack,
} from './snapshots.js';

export function ConnectedMiniPlayer({ onExpand }: { onExpand: () => void }) {
  const services = getServices();
  const status = usePlayerStatus();
  const progress = usePlayerProgress();
  const track = usePlaybackTrack();
  const intents = usePlayerIntents();

  if (!track) return null;

  return (
    <MiniPlayer
      track={track}
      status={status}
      positionMs={progress.positionMs}
      durationMs={progress.durationMs}
      onToggle={() => void intents.toggle()}
      onNext={() => void intents.next()}
      onExpand={onExpand}
      onRetry={() => {
        services.analytics.track('play_error', { reason: 'manual_retry' });
        void intents.retry();
      }}
    />
  );
}