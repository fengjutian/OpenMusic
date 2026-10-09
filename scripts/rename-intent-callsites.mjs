/**
 * Rename intents at call sites.
 */
import fs from 'node:fs';

const files = [
  'src/ui/android/screens/DetailScreens.tsx',
  'src/ui/android/screens/SearchScreen.tsx',
  'src/ui/android/screens/HomeScreen.tsx',
  'src/ui/android/screens/LibraryScreen.tsx',
  'src/ui/android/overlays/NowPlayingOverlay.tsx',
];

for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  const after = before
    .replaceAll('intents.playTracks(', 'intents.playTrackList(')
    .replaceAll('intents.playNextInQueue(', 'intents.enqueueNext(')
    .replaceAll('intents.addToQueue(', 'intents.enqueueLast(')
    .replaceAll('intents.seek(', 'intents.seekTo(');
  if (before !== after) {
    fs.writeFileSync(f, after, 'utf8');
    console.log('patched', f);
  }
}