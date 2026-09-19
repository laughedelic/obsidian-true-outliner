/**
 * The marks every node kind draws, read as data (`heading-level-markers`,
 * design D1): what the other kinds draw has not moved, and a heading's six
 * styles keep the geometry docs/research/heading-level-markers.md decided.
 */

import { describe, expect, it } from 'vitest';
import type { NodeKind } from '../src/model';
import {
  markSubject,
  markerShapes,
  nodeMark,
  type NodeMark,
  type HeadingMarkerGlyph,
  type HeadingMarkerLevel,
  type HeadingMarkerStyle,
  type Shape,
} from '../src/plugin/marker-shapes';

const STROKE = {
  stroke: 'currentColor',
  'stroke-width': '1.5',
  fill: 'none',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};
const FILL = { fill: 'currentColor' };

/** What `buildMarkerIcon` drew for each kind before this change, element for
 * element. */
const BEFORE: Record<NodeKind, Shape[]> = {
  heading: [
    { tag: 'rect', attrs: { x: '3', y: '2', width: '2', height: '12', ...FILL } },
    { tag: 'rect', attrs: { x: '11', y: '2', width: '2', height: '12', ...FILL } },
    { tag: 'rect', attrs: { x: '3', y: '7', width: '10', height: '2', ...FILL } },
  ],
  paragraph: [
    { tag: 'line', attrs: { ...STROKE, x1: '2', y1: '4', x2: '14', y2: '4' } },
    { tag: 'line', attrs: { ...STROKE, x1: '2', y1: '8', x2: '14', y2: '8' } },
    { tag: 'line', attrs: { ...STROKE, x1: '2', y1: '12', x2: '9', y2: '12' } },
  ],
  code: [
    { tag: 'polyline', attrs: { ...STROKE, points: '6,3 2,8 6,13' } },
    { tag: 'line', attrs: { ...STROKE, x1: '9.5', y1: '2', x2: '6.5', y2: '14' } },
    { tag: 'polyline', attrs: { ...STROKE, points: '10,3 14,8 10,13' } },
  ],
  table: [
    { tag: 'rect', attrs: { ...STROKE, x: '2', y: '2', width: '12', height: '12', rx: '1' } },
    { tag: 'line', attrs: { ...STROKE, x1: '2', y1: '8', x2: '14', y2: '8' } },
    { tag: 'line', attrs: { ...STROKE, x1: '8', y1: '2', x2: '8', y2: '14' } },
  ],
  callout: [
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '6', ...FILL } },
    { tag: 'rect', attrs: { x: '7', y: '4', width: '2', height: '5', fill: 'var(--background-primary)' } },
    { tag: 'rect', attrs: { x: '7', y: '10', width: '2', height: '2', fill: 'var(--background-primary)' } },
  ],
  quote: [
    { tag: 'circle', attrs: { cx: '5', cy: '5', r: '2', ...FILL } },
    { tag: 'rect', attrs: { x: '4', y: '5', width: '2', height: '4', ...FILL } },
    { tag: 'circle', attrs: { cx: '11', cy: '5', r: '2', ...FILL } },
    { tag: 'rect', attrs: { x: '10', y: '5', width: '2', height: '4', ...FILL } },
  ],
  html: [
    { tag: 'rect', attrs: { ...STROKE, x: '3', y: '2', width: '10', height: '12', rx: '1' } },
    { tag: 'line', attrs: { ...STROKE, x1: '9', y1: '2', x2: '13', y2: '6' } },
  ],
  hr: [{ tag: 'rect', attrs: { x: '2', y: '7', width: '12', height: '2', ...FILL } }],
  'list-item': [{ tag: 'circle', attrs: { cx: '8', cy: '8', r: '3', ...FILL } }],
};

const GLYPHS: readonly HeadingMarkerGlyph[] = ['H', 'hash'];
const LAYOUTS: readonly HeadingMarkerLevel[] = ['beside', 'subscript', 'none'];
const STYLES: readonly HeadingMarkerStyle[] = GLYPHS.flatMap((glyph) => LAYOUTS.map((level) => ({ glyph, level })));
const LEVELS = [1, 2, 3, 4, 5, 6] as const;

const heading = (level: number, style: HeadingMarkerStyle) => markerShapes({ kind: 'heading', level, style });
const name = (s: HeadingMarkerStyle) => `${s.glyph}/${s.level}`;

/* ---------- reading geometry back out of the primitives ---------- */

interface Transform {
  readonly tx: number;
  readonly ty: number;
  readonly s: number;
}

const n = (v: string | undefined): number => {
  if (v === undefined) throw new Error('missing attribute');
  return Number(v);
};

function parseTransform(value: string | undefined): Transform {
  const m = /^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)$/.exec(value ?? '');
  if (!m) throw new Error(`unexpected transform: ${value}`);
  return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
}

function pairs(numbers: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push([numbers[i]!, numbers[i + 1]!]);
  return out;
}

/**
 * Every point a primitive's ink can reach, with the half-stroke it spreads by.
 * A path is bounded by its control points, which contain the curve.
 */
interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function inkBounds(shape: Shape, at: Transform = { tx: 0, ty: 0, s: 1 }, halfStroke = 0): Bounds {
  const a = shape.attrs;
  const own = a['stroke-width'] !== undefined && a.stroke !== undefined ? (n(a['stroke-width']) * at.s) / 2 : halfStroke;
  let points: Array<[number, number]> = [];
  switch (shape.tag) {
    case 'rect': {
      const [x, y, w, h] = [n(a.x), n(a.y), n(a.width), n(a.height)];
      points = [[x, y], [x + w, y + h]];
      break;
    }
    case 'circle': {
      const [cx, cy, r] = [n(a.cx), n(a.cy), n(a.r)];
      points = [[cx - r, cy - r], [cx + r, cy + r]];
      break;
    }
    case 'line':
      points = [[n(a.x1), n(a.y1)], [n(a.x2), n(a.y2)]];
      break;
    case 'polygon':
    case 'polyline':
      points = pairs((a.points ?? '').split(/[ ,]+/).map(Number));
      break;
    case 'path':
      points = pairs((a.d ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number));
      break;
    case 'g': {
      const inner = parseTransform(a.transform);
      const t = { tx: at.tx + inner.tx * at.s, ty: at.ty + inner.ty * at.s, s: at.s * inner.s };
      const childHalf = a['stroke-width'] === undefined ? halfStroke : (n(a['stroke-width']) * t.s) / 2;
      return (shape.children ?? [])
        .map((child) => inkBounds(child, t, childHalf))
        .reduce((u: Bounds, b: Bounds) => ({
          x0: Math.min(u.x0, b.x0),
          y0: Math.min(u.y0, b.y0),
          x1: Math.max(u.x1, b.x1),
          y1: Math.max(u.y1, b.y1),
        }));
    }
  }
  const xs = points.map(([x]) => at.tx + x * at.s);
  const ys = points.map(([, y]) => at.ty + y * at.s);
  return {
    x0: Math.min(...xs) - own,
    y0: Math.min(...ys) - own,
    x1: Math.max(...xs) + own,
    y1: Math.max(...ys) + own,
  };
}

/** The drawn digit: its placement and its stroke in viewBox units. */
function digitOf(shapes: readonly Shape[]) {
  const g = shapes.find((s) => s.tag === 'g');
  if (!g) return undefined;
  const t = parseTransform(g.attrs.transform);
  return { ...t, stroke: n(g.attrs['stroke-width']) * t.s, d: g.children?.[0]?.attrs.d };
}

/* ---------- the tests ---------- */

describe('markerShapes: the kinds that did not change', () => {
  /**
   * Negative control: change any attribute of any kind's primitives, and its
   * row fails.
   */
  it.each(Object.keys(BEFORE).filter((k) => k !== 'heading') as Array<Exclude<NodeKind, 'heading'>>)(
    '%s draws what it drew',
    (kind) => {
      expect(markerShapes(markSubject({ kind }, { glyph: 'H', level: 'beside' }))).toEqual(BEFORE[kind]);
    },
  );
});

describe('markerShapes: heading marks', () => {
  /**
   * Negative control: move the twin digit box one unit right, and a digit's
   * stroke leaves the viewBox.
   */
  it.each(STYLES.map((s) => [name(s), s] as const))('%s keeps every level’s ink inside the viewBox', (_, style) => {
    for (const level of LEVELS) {
      for (const shape of heading(level, style)) {
        const b = inkBounds(shape);
        const inside = b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 16 && b.y1 <= 16;
        expect({ level, tag: shape.tag, inside, ...b }).toMatchObject({ inside: true });
      }
    }
  });

  it.each(STYLES.filter((s) => s.level !== 'none').map((s) => [name(s), s] as const))(
    '%s draws six different marks, one per level',
    (_, style) => {
      const drawn = LEVELS.map((level) => JSON.stringify(heading(level, style)));
      expect(new Set(drawn).size).toBe(6);
      expect(new Set(LEVELS.map((level) => digitOf(heading(level, style))?.d)).size).toBe(6);
    },
  );

  /**
   * The weights the decision fixed, as each layout's base bar or stroke times
   * its style's weight (docs/research/heading-level-markers.md, "Decision").
   * The subscript's digit base includes the 0.92 its smaller box takes.
   *
   * Negative control: change any style's weight in the geometry table.
   */
  it.each([
    ['H/beside', 1.7 * 1.0, 1.55 * 1.0],
    ['hash/beside', 1.5 * 0.9, 1.55 * 1.0],
    ['H/subscript', 2.0 * 0.85, 1.55 * 0.92 * 0.9],
    ['hash/subscript', 1.7 * 0.85, 1.55 * 0.92 * 0.9],
    ['H/none', 2.0, undefined],
    ['hash/none', 1.8, undefined],
  ] as const)('%s draws at its fixed weights', (key, glyphT, digitT) => {
    const [glyph, level] = key.split('/') as [HeadingMarkerGlyph, HeadingMarkerLevel];
    const shapes = heading(3, { glyph, level });
    // An H's stem is its first rect; a hash's rail is its first rect.
    const bar = shapes.find((s) => s.tag === 'rect')!;
    const thickness = glyph === 'H' ? n(bar.attrs.width) : n(bar.attrs.height);
    expect(thickness).toBeCloseTo(glyphT, 3);
    const digit = digitOf(shapes);
    if (digitT === undefined) expect(digit).toBeUndefined();
    else expect(digit!.stroke).toBeCloseTo(digitT, 2);
  });

  /**
   * Negative control: size the H with a constant full-height box, and its top
   * and bottom leave the digit's.
   */
  it('stands the H beside its digit exactly as tall as the digit’s ink', () => {
    for (const level of LEVELS) {
      const shapes = heading(level, { glyph: 'H', level: 'beside' });
      const stem = shapes[0]!;
      const digit = digitOf(shapes)!;
      const inkTop = digit.ty + 1 * digit.s - digit.stroke / 2;
      const inkBottom = digit.ty + 9 * digit.s + digit.stroke / 2;
      expect(n(stem.attrs.y)).toBeCloseTo(inkTop, 2);
      expect(n(stem.attrs.y) + n(stem.attrs.height)).toBeCloseTo(inkBottom, 2);
    }
  });

  /**
   * Negative control: draw the H alone in the twin's derived box, and it stops
   * being the mark from before levels existed.
   */
  it.each(GLYPHS)('%s with no digit draws one mark for every level', (glyph) => {
    const drawn = LEVELS.map((level) => heading(level, { glyph, level: 'none' }));
    for (const shapes of drawn) expect(shapes).toEqual(drawn[0]);
    expect(digitOf(drawn[0]!)).toBeUndefined();
  });

  it('draws H with no digit exactly as the heading mark was drawn before levels existed', () => {
    expect(heading(4, { glyph: 'H', level: 'none' })).toEqual(BEFORE.heading);
  });
});

describe('a node’s mark, and the subject drawn from it', () => {
  it('brings a heading’s level and style, and nothing for any other kind', () => {
    const style: HeadingMarkerStyle = { glyph: 'hash', level: 'subscript' };
    expect(markSubject({ kind: 'heading', level: 2 }, style)).toEqual({ kind: 'heading', level: 2, style });
    expect(markSubject({ kind: 'paragraph' }, style)).toEqual({ kind: 'paragraph' });
  });

  /**
   * The guarantee is the type's, so the check is the compiler's: `npm run build`
   * type-checks this file. Negative control: make `level` optional on the
   * heading arm of `NodeMark`, and the directive below goes unused, which fails
   * the build.
   */
  it('cannot be written for a heading without its level', () => {
    // @ts-expect-error a heading without a level is not a NodeMark
    const mark: NodeMark = { kind: 'heading' };
    expect(mark.kind).toBe('heading');
  });

  it('reads a model node, and refuses a heading node without a level rather than draw a guess', () => {
    expect(nodeMark({ kind: 'heading', level: 3 })).toEqual({ kind: 'heading', level: 3 });
    expect(nodeMark({ kind: 'code' })).toEqual({ kind: 'code' });
    expect(() => nodeMark({ kind: 'heading' })).toThrow();
  });
});
