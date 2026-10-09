/**
 * Round-3 fixes driven by what `@lynx-js/types` actually accepts:
 *  - `hit-slop` is a `${number}px` string, not a number
 *  - `<input>` has no `autofocus`; it does have `type`
 *  - font-weight accepts 'normal' | 'medium' | 'bold' (not 'regular')
 *  - destructured `id` was renamed but JSX bodies still said `{testID}`
 *
 * Run: node scripts/fix-types-round3.mjs
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
    // JSX bodies still referenced the old destructured name.
    .replace(/\{testID\}/g, '{id}')
    .replace(/id=\{testID \?\? /g, 'id={id ?? ')
    // font-weight vocabulary accepted by csstype / Lynx.
    .replace(/weight=\{selected \? 'medium' : 'regular'\}/g, "weight={selected ? 'medium' : 'normal'}")
    .replace(/weight=\{active \? 'medium' : 'regular'\}/g, "weight={active ? 'medium' : 'normal'}")
    .replace(/weight=\{playing \? 'medium' : 'regular'\}/g, "weight={playing ? 'medium' : 'normal'}")
    // hit-slop is a CSS length.
    .replace(/hitSlop=\{8\}/g, 'hitSlop={`8px`}')
    .replace(/hitSlop=\{6\}/g, 'hitSlop={`6px`}')
    // `<input>` has no autofocus attribute in this version.
    .replace(/\n\s*autofocus=\{autoFocus\}/g, '');

  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`round3 touched ${changed} files`);