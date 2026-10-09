#!/usr/bin/env node
/**
 * Prepare the Windows WebView2 host.
 *
 * Vendor `@lynx-js/web-core` AND `remote-web-worker` into
 * `windows/host/vendor/` so the host can run without depending on a CDN at
 * runtime. The CDN URL is referenced from `index.html` while we are still
 * verifying locally; once both bundles render correctly we switch the host
 * to the vendored copies for production.
 *
 * `remote-web-worker` is required by web-core whenever a template worker is
 * loaded from a different origin (typical CDN deployment). It polyfills
 * `Worker` to use a message-port based bridge so the same-origin policy
 * stops blocking.
 *
 * Usage:  node scripts/prepare-windows-host.mjs
 */
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const targets = [
  {
    pkg: '@lynx-js/web-core',
    src: path.join(root, 'node_modules', '@lynx-js', 'web-core', 'dist', 'client_prod', 'static'),
    // The runtime resolves dynamic chunks via `static/js/async/...` relative to
    // the host page, so the `static/` directory must sit directly under
    // `vendor/` (sibling of `index.html`).
    dst: path.join(root, 'windows', 'host', 'vendor', 'static'),
  },
  {
    pkg: 'remote-web-worker',
    src: path.join(root, 'node_modules', 'remote-web-worker', 'dist'),
    dst: path.join(root, 'windows', 'host', 'vendor', 'remote-web-worker'),
  },
];

for (const { pkg, src, dst } of targets) {
  if (!existsSync(src)) {
    console.error(`${pkg} not installed at ${src}; run \`npm ci\` first.`);
    process.exit(1);
  }
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`Vendored ${pkg} to ${path.relative(root, dst)}`);
}