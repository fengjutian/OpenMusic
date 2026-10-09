import fs from 'node:fs';

const files = [
  'src/ui/android/AndroidShell.tsx',
  'src/ui/android/overlays/NowPlayingOverlay.tsx',
  'src/ui/android/overlays/QueueOverlay.tsx',
  'src/ui/android/screens/DetailScreens.tsx',
  'src/ui/android/screens/HomeScreen.tsx',
  'src/ui/android/screens/LibraryScreen.tsx',
  'src/ui/android/screens/SearchScreen.tsx',
  'src/ui/windows/WindowsShell.tsx',
];

for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  const after = before
    .replaceAll("'../shared/use-player.jsx'", "'../shared/use-player'")
    .replaceAll("'../shared/use-player.js'", "'../shared/use-player'")
    .replaceAll("'../../shared/use-player.jsx'", "'../../shared/use-player'")
    .replaceAll("'../../shared/use-player.js'", "'../../shared/use-player'");
  if (before !== after) {
    fs.writeFileSync(f, after, 'utf8');
    console.log('patched', f);
  }
}