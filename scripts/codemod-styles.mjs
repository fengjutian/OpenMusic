/**
 * One-off codemod: expand Tailwind-style logical shorthands into real CSS
 * longhand, and rename props that Lynx does not type.
 *
 * `paddingHorizontal` / `paddingVertical` / `marginHorizontal` are not CSS —
 * they are a Tailwind convention that leaked into the first draft. Lynx types
 * them via `csstype`, so they must be expanded.
 *
 * Run: node scripts/codemod-styles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src'];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const SHORTHANDS = [
  ['paddingHorizontal', 'paddingLeft', 'paddingRight'],
  ['paddingVertical', 'paddingTop', 'paddingBottom'],
  ['marginHorizontal', 'marginLeft', 'marginRight'],
  ['marginVertical', 'marginTop', 'marginBottom'],
];

function expandShorthands(source) {
  return source.replace(
    /^(\s*)(paddingHorizontal|paddingVertical|marginHorizontal|marginVertical): ([^,\n]+),$/gm,
    (_match, indent, key, value) => {
      const [, first, second] = SHORTHANDS.find(([name]) => name === key);
      return `${indent}${first}: ${value},\n${indent}${second}: ${value},`;
    },
  );
}

function renameProps(source) {
  return source
    .replace(/(\s)testID=/g, '$1id=')
    .replace(/\sscrollbar=\{false\}/g, " 'scroll-bar-enable'={false}")
    .replace(/orientation="horizontal"/g, "'scroll-orientation'=\"horizontal\"");
}

let changed = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = renameProps(expandShorthands(before));
    if (before !== after) {
      fs.writeFileSync(file, after, 'utf8');
      changed += 1;
    }
  }
}

console.log(`codemod touched ${changed} files`);