/* Remove stale compiler artifacts that TypeScript no longer regenerates. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'out');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
let removed = 0;

function visit(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.name.endsWith('.map') || entry.name.endsWith('.tsbuildinfo')) {
      fs.rmSync(absolute, { force: true });
      removed += 1;
    }
  }
}

visit(out);
if (removed) console.log(`[QPM] Removed ${removed} stale generated artifact(s).`);
