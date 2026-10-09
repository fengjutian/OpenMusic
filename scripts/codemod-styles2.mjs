/**
 * Pass 2 of the style codemod:
 *  - expand remaining logical shorthands, including inline/single-line styles
 *  - rename our own `testID` prop to `id`, which is what Lynx actually types
 *
 * Run: node scripts/codemod-styles.mjs
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

const LONGHAND = {
  paddingHorizontal: ['paddingLeft', 'paddingRight'],
  paddingVertical: ['paddingTop', 'paddingBottom'],
  marginHorizontal: ['marginLeft', 'marginRight'],
  marginVertical: ['marginTop', 'marginBottom'],
};

function expand(source) {
  return source.replace(
    /(\s*)(paddingHorizontal|paddingVertical|marginHorizontal|marginVertical):\s*([^,}\n]+)([,}])/g,
    (_match, indent, key, value, tail) => {
      const [a, b] = LONGHAND[key];
      return `${indent}${a}: ${value}, ${indent}${b}: ${value}${tail === ',' ? ',' : ''}`;
    },
  );
}

let changed = 0;
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8');

  // Our own components used `testID`; Lynx types the attribute as `id`.
  const renamed = before
    .replace(/\btestID\?: string;/g, 'id?: string;')
    .replace(/\btestID=/g, 'id=');

  const after = expand(renamed);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`pass2 touched ${changed} files`);