import { useCallback } from '@lynx-js/react';

import { useServices } from '../../../app/services-context.js';
import { sessionActions, sessionStore } from '../../../application/stores.js';
import type { ThemePreference } from '../../../domain/models.js';
import { useStoreSlice } from '../../../application/store-hooks.js';
import { useTheme } from '../../shared/theme.js';
import { Divider, Pressable, Text } from '../../shared/primitives.js';
import { SegmentedTabs } from '../../shared/inputs.js';

const APP_VERSION = '0.1.0';

export function ProfileScreen() {
  const theme = useTheme();
  const services = useServices();
  const resolvedTheme = useStoreSlice(sessionStore, 'resolvedTheme');
  const capabilities = services.bridge.capabilities();

  const setTheme = useCallback((value: string) => {
    const preference = value as ThemePreference;
    sessionActions.setTheme(preference);
    // `system` currently resolves to dark; the platform listener is not wired
    // up yet, so we do not pretend to follow the OS (see ADR-0001).
    void services.settings.set('session.theme', preference);
  }, [services]);

  return (
    <scroll-view style={{ flex: 1 }} scroll-bar-enable={false}>
      <view style={{ paddingLeft: `${theme.spacing.x4}px`, paddingRight: `${theme.spacing.x4}px`, paddingTop: `${theme.spacing.x2}px` }}>
        <Text variant="display" weight="bold">
          我的
        </Text>
      </view>

      <view style={{ padding: `${theme.spacing.x4}px`, gap: `${theme.spacing.x4}px` }}>
        <SettingsGroup title="外观">
          <view style={{ padding: `${theme.spacing.x4}px`, gap: `${theme.spacing.x2}px` }}>
            <Text variant="caption" color="secondary">
              深浅主题
            </Text>
            <SegmentedTabs
              options={[
                { value: 'dark', label: '深色' },
                { value: 'light', label: '浅色' },
                { value: 'system', label: '跟随系统' },
              ]}
              value={resolvedTheme === 'light' ? 'light' : 'dark'}
              onChange={setTheme}
              testIDPrefix="theme"
            />
            <Text variant="label" color="muted">
              浅色主题为 P1，当前仅提供深色与浅色两套已验证配色。
            </Text>
          </view>
        </SettingsGroup>

        <SettingsGroup title="播放">
          <Row label="播放模式" value="在播放页切换" />
          <Divider inset={theme.spacing.x4} />
          <Row label="后台播放" value={capabilities.native ? '由系统媒体会话接管' : '未接入原生能力'} />
        </SettingsGroup>

        <SettingsGroup title="本地音乐">
          <Row label="曲库来源" value="演示数据（Mock Repository）" />
          <Divider inset={theme.spacing.x4} />
          <Row label="扫描目录" value="尚未授权" />
          <Divider inset={theme.spacing.x4} />
          <DisabledRow label="导入文件夹" hint="需要原生文件系统选择器" />
          <Divider inset={theme.spacing.x4} />
          <DisabledRow label="导出与备份" hint="需要 SQLite 导出实现" />
        </SettingsGroup>

        <SettingsGroup title="关于">
          <Row label="版本" value={APP_VERSION} />
          <Divider inset={theme.spacing.x4} />
          <Row label="运行模式" value={services.usingMocks ? '演示数据' : '本地曲库'} />
        </SettingsGroup>

        <Text variant="label" color="muted" style={{ textAlign: 'center' }}>
          本应用不含任何第三方平台的商标或受版权保护素材。
        </Text>

        <view style={{ height: `${theme.spacing.x8}px` }} />
      </view>
    </scroll-view>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <view style={{ gap: `${theme.spacing.x2}px` }}>
      <Text variant="caption" color="secondary">
        {title}
      </Text>
      <view
        style={{
          borderRadius: `${theme.radius.lg}px`,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
        }}
      >
        {children}
      </view>
    </view>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <view
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: `${theme.spacing.x4}px`,
        paddingRight: `${theme.spacing.x4}px`,
        minHeight: 52,
      }}
    >
      <Text variant="body">{label}</Text>
      <Text variant="caption" color="muted" lines={1}>
        {value}
      </Text>
    </view>
  );
}

/**
 * A capability we do not have yet. Rendered as an explicit, non-tappable row so
 * the UI never offers a dead button (product spec §13).
 */
function DisabledRow({ label, hint }: { label: string; hint: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}，${hint}`}
      disabled
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: `${theme.spacing.x4}px`,
        paddingRight: `${theme.spacing.x4}px`,
        minHeight: 52,
      }}
    >
      <Text variant="body" color="muted">
        {label}
      </Text>
      <Text variant="caption" color="muted" lines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}