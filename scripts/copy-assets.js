// scripts/copy-assets.js
//
// tsc only emits .js from .ts — it does NOT copy non-TS assets. Several raw-SQL
// modules (payroll, leave-v2, …) ship *.sql migration files that are read from
// disk at runtime via readdirSync(join(__dirname, 'migrations')). Without this
// step those files never land in dist/, and the production image (which copies
// only /app/dist) crashes at boot with ENOENT scandir '.../db/migrations'.
//
// This mirrors the src/ tree into dist/, copying every *.sql file and
// preserving relative paths. Run automatically after `tsc` (see package.json
// build script).

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DEST = path.join(__dirname, '..', 'dist');
const EXTENSIONS = ['.sql'];

let copied = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      const rel = path.relative(SRC, full);
      const target = path.join(DEST, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(full, target);
      copied += 1;
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`[copy-assets] source dir not found: ${SRC}`);
  process.exit(1);
}

walk(SRC);
console.log(`[copy-assets] copied ${copied} asset file(s) to dist/`);
