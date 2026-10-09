/**
 * Fixes the first-round type errors that need semantic (not mechanical) edits.
 * Run: node scripts/fix-types-round1.mjs — but most of these are done by hand
 * via the edit tool; this script only covers the repetitive prop renames.
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

const files = [
  'src/ui/shared/primitives.tsx',
  'src/ui/shared/media.tsx',
  'src/ui/shared/inputs.tsx',
  'src/ui/shared/playback.tsx',
];

let changed = 0;
for (const rel of files) {
  const before = fs.readFileSync(rel, 'utf8');
  // The prop declaration was renamed to `id`; destructuring must follow.
  const after = before
    .replace(/^(\s*)testID,$/gm, '$1id,')
    .replace(/^(\s*)testID =/, '$1id =');
  if (before !== after) {
    fs.writeFileSync(rel, after, 'utf8');
    changed += 1;
  }
}
console.log(`renamed destructured testID in ${changed} files`);
void walk;