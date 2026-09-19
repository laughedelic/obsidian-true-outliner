/**
 * The pixel size of every captured still and clip poster, read from the PNG
 * headers at build time. `Shot` and `Clip` put it on their elements so the
 * page keeps each figure's height before its file arrives, and nothing below
 * a figure moves when it does.
 */
import { openSync, readSync, closeSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { defineLoader } from 'vitepress';

export type MediaSizes = Record<string, { width: number; height: number }>;

declare const data: MediaSizes;
export { data };

export default defineLoader({
  watch: ['../../public/media/shots/*.png', '../../public/media/clips/*.png'],
  load(files: string[]): MediaSizes {
    const out: MediaSizes = {};
    for (const file of files) {
      // IHDR is the first chunk: width and height sit at bytes 16 and 20.
      const header = Buffer.alloc(24);
      const fd = openSync(file, 'r');
      readSync(fd, header, 0, 24, 0);
      closeSync(fd);
      const key = `${basename(dirname(file))}/${basename(file, '.png')}`;
      out[key] = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
    }
    return out;
  },
});
