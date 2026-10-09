import { useTheme } from '../../shared/theme.js';
import { Icon, Pressable, Text } from '../../shared/primitives.js';
import { QueueList } from '../../shared/playback.jsx';
import { usePlayerFull, usePlayerIntents } from '../../shared/use-player';
import { OverlayFrame } from './NowPlayingOverlay.jsx';

export function QueueOverlay({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const player = usePlayerFull();
  const intents = usePlayerIntents();

  if (!player.queue) {
    return (
      <OverlayFrame>
        <view style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" color="muted">
            播放队列是空的
          </Text>
        </view>
      </OverlayFrame>
    );
  }

  const currentId = player.queue.tracks[player.queue.index]?.id ?? null;

  return (
    <OverlayFrame>
      <view
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: `${theme.spacing.x3}px`,
          paddingRight: `${theme.spacing.x3}px`,
          height: `${theme.layout.topBarHeight}px`,
        }}
      >
        <Text variant="body" weight="medium" style={{ flex: 1, paddingLeft: `${theme.spacing.x2}px` }}>
          播放队列
        </Text>
        <Pressable accessibilityLabel="关闭播放队列" onPress={onClose} id="queue-close" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </view>

      <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
        <QueueList
          contextTitle={player.queue.context.title}
          tracks={player.queue.tracks}
          currentTrackId={currentId}
          manualCount={player.queue.manualIds.length}
          onSelect={(i) => {
            void intents.playAtIndex(i);
            onClose();
          }}
          onRemove={(id) => intents.removeFromQueue(id)}
          onMove={(from, to) => intents.moveInQueue(from, to)}
          onClearManual={() => intents.clearManualItems()}
        />
      </scroll-view>
    </OverlayFrame>
  );
}