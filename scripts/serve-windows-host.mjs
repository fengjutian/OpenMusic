#!/usr/bin/env node
/**
 * Local HTTP server for the Windows WebView2 host.
 *
 * Serves the repo root so `windows/host/index.html` can fetch
 * `../dist/main.web.bundle` over `http://`. Opens Edge on the host URL.
 *
 * Usage:  node scripts/serve-windows-host.mjs [--no-open]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const PORT = Number(process.env.PORT ?? 4173);
const HOST = '127.0.0.1';
const shouldOpen = !process.argv.includes('--no-open');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/windows/host/index.html';
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const stats = await stat(filePath).catch(() => null);
    if (!stats || !stats.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${pathname}`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mime[ext] ?? 'application/octet-stream',
      // COOP/COEP so the Lynx Web runtime can spawn a SharedArrayBuffer
      // worker for animations and image decoders.
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (cause) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(`Server error: ${cause?.message ?? cause}`);
  }
});

server.on('listening', () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`OpenMusic Windows host serving at ${url}`);
  console.log(`(project root: ${root})`);
  if (shouldOpen) {
    const edge = process.env['EDGE_PATH'] ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const candidate = spawn(edge, [url], { detached: true, stdio: 'ignore' });
    candidate.on('error', () => {
      // Fallback: rely on the OS to handle the URL.
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    });
    candidate.unref();
  }
});

server.listen(PORT, HOST);