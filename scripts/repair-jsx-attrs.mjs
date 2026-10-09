/**
 * Repairs the JSX attribute syntax produced by `codemod-styles.mjs`.
 * Hyphenated Lynx attributes are written bare: `scroll-bar-enable={false}`.
 */
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

let changed = 0;
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replaceAll("'scroll-bar-enable'={false}", 'scroll-bar-enable={false}')
    .replaceAll("'scroll-orientation'=\"horizontal\"", 'scroll-orientation="horizontal"');
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`repaired ${changed} files`);