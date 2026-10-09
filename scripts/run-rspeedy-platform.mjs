#!/usr/bin/env node
/**
 * Run Rspeedy with an explicit OpenMusic shell selection.
 *
 * Rspeedy 0.18 does not support the former `--platform` flag. Keeping the
 * selection in this Node wrapper makes the npm commands work consistently on
 * Windows and POSIX shells without relying on shell-specific env syntax.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [, , command, platform] = process.argv;

if (!['build', 'dev'].includes(command) || !['android', 'windows'].includes(platform)) {
  console.error('Usage: node scripts/run-rspeedy-platform.mjs <build|dev> <android|windows>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '..', 'node_modules', '@lynx-js', 'rspeedy', 'bin', 'rspeedy.js');
const child = spawn(process.execPath, [cli, command], {
  env: {
    ...process.env,
    OPENMUSIC_PLATFORM: platform,
  },
  stdio: 'inherit',
});

child.on('error', (cause) => {
  console.error(`Unable to start Rspeedy: ${cause.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
