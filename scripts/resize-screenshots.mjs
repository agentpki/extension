// Resize every PNG in store-assets/screenshots/ to exactly 1280x800.
//
// Chrome Web Store rejects screenshots that aren't exactly 1280x800 (or
// 640x400). Win+Shift+S captures are arbitrary rectangles, so we use
// sharp to "contain" each image (preserve aspect, fit inside 1280x800)
// and pad the remaining space with the same dark color as the popup
// background, producing a clean letterbox that the eye reads as
// continuous Chrome chrome.
//
// Run: pnpm screenshots
//
// Output: overwrites the input files in-place. Originals get a .orig
// backup once on first run so re-running is idempotent.

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'store-assets', 'screenshots');

const TARGET_W = 1280;
const TARGET_H = 800;
// Matches popup `bg-zinc-950` (#09090b) — blends seamlessly with the
// dark Chrome incognito chrome in the captures.
const PAD_BG = { r: 9, g: 9, b: 11, alpha: 1 };

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(srcDir))) {
    console.error(`Source directory not found: ${srcDir}`);
    console.error('Make sure your screenshots are saved at:');
    console.error(`  ${srcDir}\\01-verified.png  (etc.)`);
    process.exit(1);
  }

  const all = (await readdir(srcDir)).filter(
    (f) => f.endsWith('.png') && !f.endsWith('.orig.png'),
  );

  if (all.length === 0) {
    console.error(`No .png files found in ${srcDir}`);
    process.exit(1);
  }

  console.log(`\nResizing ${all.length} screenshot(s) to ${TARGET_W}x${TARGET_H}:`);

  for (const name of all.sort()) {
    const inPath = join(srcDir, name);
    const backupPath = join(srcDir, name.replace(/\.png$/, '.orig.png'));

    // Back up the original on first run only
    if (!(await exists(backupPath))) {
      // Copy original via read-write so we don't rename + lose source
      const buf = await readFile(inPath);
      await writeFile(backupPath, buf);
    }

    const srcBuf = await readFile(backupPath); // always resize from the pristine original
    const meta = await sharp(srcBuf).metadata();
    const wIn = meta.width ?? 0;
    const hIn = meta.height ?? 0;

    const out = await sharp(srcBuf)
      .resize(TARGET_W, TARGET_H, {
        fit: 'contain',
        background: PAD_BG,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(inPath, out);

    const finalMeta = await sharp(out).metadata();
    console.log(
      `  ${name.padEnd(24)} ${wIn}x${hIn}  →  ${finalMeta.width}x${finalMeta.height}  (${out.byteLength} B)`,
    );
  }

  console.log(
    `\n✓ Done. Originals backed up as <name>.orig.png — safe to delete after CWS upload.`,
  );
}

main().catch((e) => {
  console.error('Resize failed:', e);
  process.exit(1);
});
