// One-shot icon generator: rasterizes public/icon.svg into the PNG sizes
// Chrome Web Store + the manifest require.
//
// Run: pnpm icons
//
// Output: public/icon/{16,32,48,96,128}.png (overwrites)
//
// Why a script rather than wxt auto-handling: WXT's icon discovery prefers
// pre-rendered PNGs in public/icon/{N}.png; this script keeps a single SVG
// source-of-truth and lets us regenerate cleanly when the mark evolves.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'icon.svg');
const outDir = join(root, 'public', 'icon');

const SIZES = [16, 32, 48, 96, 128];

async function main() {
  const svg = await readFile(src);
  await mkdir(outDir, { recursive: true });
  for (const size of SIZES) {
    const buf = await sharp(svg)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const out = join(outDir, `${size}.png`);
    await writeFile(out, buf);
    console.log(`  ${size}x${size} → public/icon/${size}.png  (${buf.byteLength} B)`);
  }
  console.log(`\n✓ wrote ${SIZES.length} icons from ${src.replace(root + '\\', '')}`);
}

main().catch((e) => {
  console.error('Icon generation failed:', e);
  process.exit(1);
});
