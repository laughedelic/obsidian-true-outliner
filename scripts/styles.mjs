/**
 * The plugin's stylesheet, assembled from the parts under `styles/`.
 *
 * Obsidian loads one `styles.css` from the plugin root, so the parts are joined
 * into that file by the build. Joined by concatenation and nothing else: a CSS
 * bundler rewrites what it reads — measured, esbuild's dropped every comment
 * in the file and reformatted its expressions — and the comments are where
 * this stylesheet keeps its reasoning (docs/research/hot-file-seams).
 *
 * A part is one feature's rules. Filename order is source order, which is
 * cascade order, so a numeric prefix places a part and adding one edits no
 * list. Each part is a whole file: it ends with one newline and the join puts a
 * blank line between neighbours.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STYLES_DIR = path.join(root, 'styles');
export const STYLESHEET = path.join(root, 'styles.css');

/** The parts, in the order they are joined. */
export function stylesheetParts() {
  return readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => path.join(STYLES_DIR, name));
}

export function buildStylesheet() {
  return stylesheetParts()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function writeStylesheet() {
  writeFileSync(STYLESHEET, buildStylesheet());
}
