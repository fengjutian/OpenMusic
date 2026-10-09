import { useTheme } from './shared/theme.js';
import { Pressable, Text } from './shared/primitives.js';
import { sessionStore } from '../application/stores.js';
import { useStoreSlice } from '../application/store-hooks.js';

/**
 * Toast host. Always mounted so an action added from anywhere is reachable;
 * auto-dismiss timing is owned by `sessionActions.toast`.
 */
export function ToastHost() {
  const theme = useTheme();
  const toast = useStoreSlice(sessionStore, 'toast');

  if (!toast) return null;

  return (
    <view
      id="toast"
      style={{
        position: 'absolute',
        left: `${theme.spacing.x4}px`,
        right: `${theme.spacing.x4}px`,
        bottom: `${theme.spacing.x6}px`,
        paddingTop: `${theme.spacing.x3}px`,
        paddingBottom: `${theme.spacing.x3}px`,
        paddingLeft: `${theme.spacing.x4}px`,
        paddingRight: `${theme.spacing.x4}px`,
        borderRadius: `${theme.radius.md}px`,
        backgroundColor: theme.colors.surfaceRaised,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${theme.spacing.x3}px`,
        zIndex: 20,
      }}
    >
      <Text variant="caption" color="secondary" style={{ flex: 1 }} lines={2}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          accessibilityLabel={toast.action.label}
          onPress={() => {
            toast.action?.run();
          }}
          id="toast-action"
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="caption" color="brand" weight="medium">
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
    </view>
  );
}