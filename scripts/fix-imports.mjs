import fs from 'node:fs';

const files = [
  'src/ui/android/screens/SearchScreen.tsx',
  'src/ui/android/screens/HomeScreen.tsx',
  'src/ui/android/screens/LibraryScreen.tsx',
  'src/ui/android/screens/DetailScreens.tsx',
  'src/ui/android/AndroidShell.tsx',
  'src/ui/windows/WindowsShell.tsx',
];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replaceAll("'../shared/use-player.js'", "'../shared/use-player.jsx'")
    .replaceAll("'../../shared/use-player.js'", "'../../shared/use-player.jsx'");
  if (before !== after) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('patched', file);
  }
}
console.log('done');