import { useTheme } from '../shared/theme.js';
import type { BottomTabKey } from '../../application/stores.js';
import { navigationActions, navigationStore } from '../../application/stores.js';
import { useStoreSlice } from '../../application/store-hooks.js';
import { Icon, Pressable, Text } from '../shared/primitives.js';
import type { IconName } from '../shared/primitives.js';

const TABS: { key: BottomTabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: '发现', icon: 'music' },
  { key: 'search', label: '搜索', icon: 'search' },
  { key: 'library', label: '音乐库', icon: 'folder' },
  { key: 'profile', label: '我的', icon: 'heart' },
];

export function BottomTabs({ bottomInset }: { bottomInset: number }) {
  const theme = useTheme();
  const active = useStoreSlice(navigationStore, 'tab');

  return (
    <view
      id="bottom-tabs"
      style={{
        flexDirection: 'row',
        height: `${theme.layout.bottomTabBarHeight}px`,
        paddingBottom: `${bottomInset}px`,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            selected={selected}
            onPress={() => navigationActions.switchTab(tab.key)}
            id={`tab-${tab.key}`}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: `${theme.layout.bottomTabBarHeight}px`,
            }}
          >
            <Icon
              name={tab.icon}
              size={20}
              color={selected ? theme.colors.brand : theme.colors.textMuted}
            />
            <Text variant="label" color={selected ? 'brand' : 'muted'} style={{ paddingTop: 2 }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </view>
  );
}