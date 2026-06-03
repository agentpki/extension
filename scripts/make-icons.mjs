// One-shot icon + promo-tile generator.
//
// Rasterizes:
//   public/icon.svg                    → public/icon/{16,32,48,96,128}.png
//   public/promo/small-440x280.svg     → public/promo/small-440x280.png
//   public/promo/marquee-1400x560.svg  → public/promo/marquee-1400x560.png
//
// The PNGs land where wxt + the CWS submission expect them. Re-run after
// editing any SVG source.
//
// Run: pnpm icons

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const ICON_SIZES = [16, 32, 48, 96, 128];

async function renderIcons() {
  const src = join(root, 'public', 'icon.svg');
  const outDir = join(root, 'public', 'icon');
  const svg = await readFile(src);
  await mkdir(outDir, { recursive: true });
  console.log('\nIcons:');
  for (const size of ICON_SIZES) {
    const buf = await sharp(svg)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const out = join(outDir, `${size}.png`);
    await writeFile(out, buf);
    console.log(`  ${size}x${size} → public/icon/${size}.png  (${buf.byteLength} B)`);
  }
}

async function renderPromo() {
  const promoDir = join(root, 'public', 'promo');
  await mkdir(promoDir, { recursive: true });
  const tiles = [
    { name: 'small-440x280', width: 440, height: 280 },
    { name: 'marquee-1400x560', width: 1400, height: 560 },
  ];
  console.log('\nPromo tiles:');
  for (const t of tiles) {
    const svgPath = join(promoDir, `${t.name}.svg`);
    let svg;
    try {
      svg = await readFile(svgPath);
    } catch {
      console.log(`  (skipping ${t.name} — SVG missing)`);
      continue;
    }
    const buf = await sharp(svg)
      .resize(t.width, t.height)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const out = join(promoDir, `${t.name}.png`);
    await writeFile(out, buf);
    console.log(`  ${t.width}x${t.height} → public/promo/${t.name}.png  (${buf.byteLength} B)`);
  }
}

async function main() {
  await renderIcons();
  await renderPromo();
  console.log('\n✓ Done. Upload public/promo/*.png to the Chrome Web Store listing.');
}

main().catch((e) => {
  console.error('Generation failed:', e);
  process.exit(1);
});
