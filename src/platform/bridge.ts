/**
 * Platform bridges.
 *
 * Technical spec §11: "需要平台能力时封装为 adapter，不让页面直接调用 Native 模块"
 * and §17: "任何关键能力未验证前不得编造 API".
 *
 * Reality check: the native modules referenced by `NativeAdapter` DO NOT EXIST
 * yet. They are declared here behind a single `try/catch` seam so that:
 *   1. the app runs today on the mock implementation, and
 *   2. when the Android/Windows hosts land, only these two files change.
 *
 * `capabilities()` reports what is actually wired up; the UI uses it to hide
 * features instead of offering dead controls (product spec §7.10).
 */

import type {
  AnalyticsPort,
  PlatformBridgePort,
  PlatformCapabilities,
  SafeAreaInsets,
  Unsubscribe,
  WindowSize,
} from '../domain/ports.js';

export interface NativeGlobal {
  openmusicAndroid?: {
    safeAreaInsets(): SafeAreaInsets;
    windowSize(): WindowSize;
    onAudioFocusChange(cb: (focused: boolean) => void): void;
    onMediaButton(cb: (command: string) => void): void;
    onAppStateChange(cb: (state: string) => void): void;
  };
  openmusicWindows?: {
    safeAreaInsets(): SafeAreaInsets;
    windowSize(): WindowSize;
    onAudioFocusChange(cb: (focused: boolean) => void): void;
    onMediaButton(cb: (command: string) => void): void;
    onAppStateChange(cb: (state: string) => void): void;
  };
}

function nativeGlobals(): NativeGlobal {
  return globalThis as unknown as NativeGlobal;
}

/** Fallbacks are deliberately conservative rather than guessing device metrics. */
const DEFAULT_ANDROID_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const DEFAULT_WINDOWS_SIZE: WindowSize = { width: 1280, height: 800 };

class BaseBridge implements PlatformBridgePort {
  readonly platform: 'android' | 'windows';

  constructor(platform: 'android' | 'windows') {
    this.platform = platform;
  }

  capabilities(): PlatformCapabilities {
    const native = this.nativeModule() !== undefined;
    return {
      platform: this.platform,
      native,
      systemMediaControls: native,
      safeArea: native,
      resizable: native && this.platform === 'windows',
      // The media scanner and metadata reader are declared as ports but have
      // no native implementation yet, so import is advertised as unavailable
      // and the UI keeps the entry hidden. See docs/platform-capability-matrix.md
      fileImport: false,
      systemNowPlaying: false,
    };
  }

  safeAreaInsets(): SafeAreaInsets {
    try {
      return this.nativeModule()?.safeAreaInsets() ?? DEFAULT_ANDROID_INSETS;
    } catch {
      return DEFAULT_ANDROID_INSETS;
    }
  }

  windowSize(): WindowSize {
    try {
      return this.nativeModule()?.windowSize() ?? DEFAULT_WINDOWS_SIZE;
    } catch {
      return DEFAULT_WINDOWS_SIZE;
    }
  }

  onAudioFocusChange(listener: (focused: boolean) => void): Unsubscribe {
    const mod = this.nativeModule();
    if (!mod) return () => undefined;
    try {
      mod.onAudioFocusChange(listener);
      return () => undefined;
    } catch {
      return () => undefined;
    }
  }

  onMediaButton(listener: (command: 'play' | 'pause' | 'next' | 'previous') => void): Unsubscribe {
    const mod = this.nativeModule();
    if (!mod) return () => undefined;
    try {
      mod.onMediaButton((command) => {
        if (
          command === 'play' ||
          command === 'pause' ||
          command === 'next' ||
          command === 'previous'
        ) {
          listener(command);
        }
      });
      return () => undefined;
    } catch {
      return () => undefined;
    }
  }

  onAppStateChange(listener: (state: 'active' | 'background') => void): Unsubscribe {
    const mod = this.nativeModule();
    if (!mod) return () => undefined;
    try {
      mod.onAppStateChange((state) => {
        listener(state === 'background' ? 'background' : 'active');
      });
      return () => undefined;
    } catch {
      return () => undefined;
    }
  }

  protected nativeModule(): NativeGlobal['openmusicAndroid'] {
    return undefined;
  }
}

class AndroidBridge extends BaseBridge {
  constructor() {
    super('android');
  }

  protected override nativeModule() {
    return nativeGlobals().openmusicAndroid;
  }
}

class WindowsBridge extends BaseBridge {
  constructor() {
    super('windows');
  }

  protected override nativeModule() {
    return nativeGlobals().openmusicWindows;
  }
}

export function createPlatformBridge(): PlatformBridgePort {
  return __OPENMUSIC_PLATFORM__ === 'windows' ? new WindowsBridge() : new AndroidBridge();
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

const EVENT_NAMES = new Set([
  'app_open',
  'home_impression',
  'content_click',
  'search_submit',
  'search_result_click',
  'play_request',
  'play_success',
  'play_error',
  'player_expand',
  'seek',
  'like_toggle',
  'queue_open',
  'queue_edit',
]);

/**
 * Privacy rule (product spec §11 / §25): free text typed outside the search box
 * is never logged. `search_submit` gets the query *length*, not the query.
 */
export class PrivacyFilteringAnalytics implements AnalyticsPort {
  private readonly sink: AnalyticsPort;
  private readonly anonymousSessionId: string;

  constructor(sink: AnalyticsPort, anonymousSessionId: string) {
    this.sink = sink;
    this.anonymousSessionId = anonymousSessionId;
  }

  track(event: string, props?: Record<string, string | number | boolean>): void {
    if (!EVENT_NAMES.has(event)) return;

    const safe: Record<string, string | number | boolean> = {
      session_id: this.anonymousSessionId,
      platform: __OPENMUSIC_PLATFORM__,
      ...(props ?? {}),
    };

    if ('query' in safe) {
      safe['query_length'] = String(safe['query']).length;
      delete safe['query'];
    }

    this.sink.track(event, safe);
  }
}

export class ConsoleAnalytics implements AnalyticsPort {
  track(event: string, props?: Record<string, string | number | boolean>): void {
    console.info(`[analytics] ${event}`, props ?? {});
  }
}