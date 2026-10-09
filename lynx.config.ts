import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

/**
 * OpenMusic Lynx build config.
 *
 * `__OPENMUSIC_PLATFORM__` is injected at build time so the platform shell
 * (android / windows) is chosen by the bundler instead of by a runtime feature
 * probe. Rationale: the technical spec forbids inventing unverified native APIs,
 * and build-time selection is the only mechanism we can actually verify from CI.
 *
 * `environments.web` is added so the same ReactLynx tree compiles to a Web
 * bundle (`dist/main.web.bundle`). The Windows host reuses that bundle via
 * `<lynx-view>` in WebView2 / Edge (see `windows/host/index.html` and
 * `docs/adr/0001-windows-presentation-layer.md`). Production `npm run build`
 * now emits both `dist/main.lynx.bundle` (Android native) and
 * `dist/main.web.bundle` (Windows + Web preview).
 *
 * Override per build:  `OPENMUSIC_PLATFORM=android rspeedy build`
 */
const targetPlatform = process.env['OPENMUSIC_PLATFORM'] ?? 'android';

export default defineConfig({
  source: {
    define: {
      __OPENMUSIC_PLATFORM__: JSON.stringify(targetPlatform),
    },
  },
  environments: {
    lynx: {},
    web: {},
  },
  plugins: [
    // QR code is only meaningful when the native Lynx explorer is on the
    // receiving end; the web environment shares `pluginReactLynx` but
    // skips the QR code plugin.
    pluginReactLynx(),
    pluginTypeCheck(),
    ...(targetPlatform === 'lynx' ? [pluginQRCode({
      schema(url) {
        // `?fullscreen=true` opens the page in LynxExplorer in full screen mode.
        return `${url}?fullscreen=true`;
      },
    })] : []),
  ],
});