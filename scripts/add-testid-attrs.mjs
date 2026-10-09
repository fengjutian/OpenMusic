/**
 * Mirrors the `id` prop onto `data-testid` for intrinsic elements.
 *
 * `@lynx-js/react/testing-library` resolves `queryByTestId` via
 * `data-testid` (see node_modules/@lynx-js/react/testing-library/dist/pure.js),
 * while Lynx itself identifies elements by `id`. Setting both keeps runtime
 * lookup and test lookup in sync with a single prop.
 *
 * Run: node scripts/add-testid-attrs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

let changed = 0;
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8');
  // Only add the mirror where an element already carries the id prop.
  const after = before.replace(/^(\s*)id=\{id\}$/gm, '$1id={id}\n$1data-testid={id}');
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`mirrored data-testid in ${changed} files`);