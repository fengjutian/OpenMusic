/**
 * Fixes relative import paths that were wrong in the first draft.
 * Run: node scripts/fix-imports.mjs
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

/** Rewrites every relative specifier so it points at an existing file. */
function resolveFrom(fromFile, specifier) {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.jsx$/, '.tsx'),
    base.replace(/\.tsx$/, '.ts'),
    base.replace(/\.jsx$/, '.ts'),
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

const SPECIFIER = /(from\s+|import\s+)(['"])(\.\.?\/[^'"]+)\2/g;

let broken = 0;
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(SPECIFIER, (match, head, quote, spec) => {
    if (resolveFrom(file, spec)) return match;
    broken += 1;
    console.log(`  ${file}: ${spec}`);
    return match;
  });
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}
console.log(`broken specifiers: ${broken}`);