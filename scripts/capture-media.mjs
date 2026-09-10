/**
 * Regenerates every screenshot and clip the website shows, from real Obsidian:
 *
 *   npm run docs:capture              # capture desktop + mobile, then encode
 *   npm run docs:capture -- --encode  # encode what website/capture/out holds
 *
 * Capture runs `website/capture/capture.e2e.ts` through the e2e dev loop
 * (`scripts/e2e-narrow.mjs`), once under the desktop config and once under
 * mobile emulation, so it needs the same Obsidian cache the e2e suite uses —
 * `OBSIDIAN_CACHE` and `OBSIDIAN_VERSION` are passed through untouched.
 *
 * Encoding turns each clip's frames into an MP4 (H.264) and a WebM (VP9)
 * timed by the `frames.json` the spec wrote beside them, plus a PNG poster
 * from the first frame, and downscales every still from the Mac's 2x
 * capture to 1x. Output lands under `website/public/media/`, which is what
 * the site ships; the raw frames are deleted once encoded. The one thing left
 * behind is `out/dom/`, the Live Preview markup the spec dumps for reference.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = path.join(root, 'website', 'capture', 'capture.e2e.ts');
const out = path.join(root, 'website', 'capture', 'out');
const media = path.join(root, 'website', 'public', 'media');
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';

const encodeOnly = process.argv.includes('--encode');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`[capture-media] ${cmd} ${args.join(' ')} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

// ---- Capture -----------------------------------------------------------------

if (!encodeOnly) {
  rmSync(out, { recursive: true, force: true });
  run(process.execPath, ['scripts/e2e-narrow.mjs', spec]);
  run(process.execPath, ['scripts/e2e-narrow.mjs', spec, '--mobile']);
}

if (!existsSync(out)) {
  console.error(`[capture-media] nothing to encode: ${path.relative(root, out)} does not exist`);
  process.exit(1);
}

// ---- Encode ------------------------------------------------------------------

/**
 * Even dimensions after the 2x → 1x downscale, which yuv420p needs. Stills
 * come out of a Retina Mac at twice their CSS size; the site shows them at 1x
 * and a 2x PNG of a whole window is several hundred kilobytes for nothing.
 */
const HALVE = 'scale=trunc(iw/4)*2:trunc(ih/4)*2';

const clipsDir = path.join(media, 'clips');
const shotsDir = path.join(media, 'shots');
mkdirSync(clipsDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

const sizes = [];
const record = (file) => sizes.push({ file: path.relative(root, file), bytes: statSync(file).size });

function encodeClip(dir) {
  const name = path.basename(dir);
  const { frames } = JSON.parse(readFileSync(path.join(dir, 'frames.json'), 'utf-8'));
  // The concat demuxer takes dwell as a per-entry duration but never honours
  // the last entry's own: the final frame is listed twice so the real last
  // dwell counts, and the output is cut at the sum of the dwells, since the
  // repeat is held for whatever the entry before it was.
  const list = frames
    .map((f) => `file '${path.join(dir, f.file)}'\nduration ${(f.dwellMs / 1000).toFixed(3)}`)
    .join('\n');
  const last = frames[frames.length - 1];
  const listFile = path.join(dir, 'concat.txt');
  writeFileSync(listFile, `${list}\nfile '${path.join(dir, last.file)}'\n`);
  const total = (frames.reduce((sum, f) => sum + f.dwellMs, 0) / 1000).toFixed(3);

  const common = ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `${HALVE},fps=10`, '-t', total];
  const mp4 = path.join(clipsDir, `${name}.mp4`);
  run(ffmpeg, [...common, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4]);
  const webm = path.join(clipsDir, `${name}.webm`);
  run(ffmpeg, [...common, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-an', webm]);
  const poster = path.join(clipsDir, `${name}.png`);
  encodePng(path.join(dir, frames[0].file), poster);
  for (const f of [mp4, webm, poster]) record(f);
}

function encodePng(from, to) {
  run(ffmpeg, ['-loglevel', 'error', '-y', '-i', from, '-vf', HALVE, '-compression_level', '100', '-pred', 'mixed', to]);
}

function encodeShot(file) {
  const target = path.join(shotsDir, path.basename(file));
  encodePng(file, target);
  record(target);
}

for (const entry of readdirSync(out, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'dom') continue;
  const dir = path.join(out, entry.name);
  if (entry.name === 'shots') {
    for (const png of readdirSync(dir).filter((f) => f.endsWith('.png'))) encodeShot(path.join(dir, png));
  } else if (existsSync(path.join(dir, 'frames.json'))) {
    encodeClip(dir);
  }
  rmSync(dir, { recursive: true, force: true });
}

const total = sizes.reduce((sum, s) => sum + s.bytes, 0);
for (const s of sizes.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(`${String(Math.round(s.bytes / 1024)).padStart(6)} KB  ${s.file}`);
}
console.log(`[capture-media] ${sizes.length} files, ${(total / 1024 / 1024).toFixed(1)} MB under ${path.relative(root, media)}`);
