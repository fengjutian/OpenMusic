/**
 * Repairs the template-literal damage caused by pass 2 of the style codemod.
 *
 * Broken shape:
 *   paddingTop: `${theme.spacing.x4,  paddingBottom: `${theme.spacing.x4px`
 *
 * Intended shape:
 *   paddingTop: `${theme.spacing.x4}px`, paddingBottom: `${theme.spacing.x4}px`
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

const BROKEN = /(\w+): `\$\{([^,}\n]+?),\s+(\w+): `\$\{\2px`/g;

let changed = 0;
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(
    BROKEN,
    (_m, a, expr, b) => `${a}: \`\${${expr}}px\`, ${b}: \`\${${expr}}px\``,
  );
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`repaired template literals in ${changed} files`);