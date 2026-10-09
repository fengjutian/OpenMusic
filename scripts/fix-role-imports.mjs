/**
 * Fixes the relative import paths in the new player role files.
 * They live in `src/application/` so domain is `../domain/...`, not `../../`.
 */
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'src/application/engine-adapter.ts',
  'src/application/player-persistence.ts',
  'src/application/player-state-machine.ts',
  'src/application/queue-controller.ts',
];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replaceAll("'../../domain/", "'../domain/")
    .replaceAll("'../../application/", "'./")
    .replaceAll("'../../infrastructure/", "'../infrastructure/");
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('patched', file);
  }
}