import fs from 'node:fs';

const f = 'src/ui/android/overlays/NowPlayingOverlay.tsx';
const before = fs.readFileSync(f, 'utf8');
const after = before.replace('intents.seekTo(', 'intents.seek(');
if (before !== after) {
  fs.writeFileSync(f, after, 'utf8');
  console.log('reverted seek call');
}