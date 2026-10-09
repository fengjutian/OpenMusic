import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

/**
 * OpenMusic Lynx build config.
 *
 * `__OPENMUSIC_PLATFORM__` is injected at build time so that the platform shell
 * (android / windows) is chosen by the bundler instead of by a runtime feature
 * probe. Rationale: the technical spec forbids inventing unverified native APIs,
 * and build-time selection is the only mechanism we can actually verify from CI.
 *
 * Override per build:  `rspeedy build --platform windows`
 *                    `OPENMUSIC_PLATFORM=android rspeedy build`
 */
const targetPlatform = process.env['OPENMUSIC_PLATFORM'] ?? 'android';

export default defineConfig({
  source: {
    define: {
      __OPENMUSIC_PLATFORM__: JSON.stringify(targetPlatform),
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        // `?fullscreen=true` opens the page in LynxExplorer in full screen mode.
        return `${url}?fullscreen=true`;
      },
    }),
    pluginReactLynx(),
    pluginTypeCheck(),
  ],
});