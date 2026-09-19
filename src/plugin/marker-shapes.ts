/**
 * What a node's mark draws, as data: the primitives inside the marker's
 * `0 0 16 16` viewBox, with no DOM. `buildMarkerIcon` (decorations.ts) turns
 * them into elements; the unit suite reads them directly, which it cannot do
 * with a drawing that only exists once a document does.
 *
 * Every kind but a heading draws one fixed shape. A heading draws a glyph and,
 * in two of its three layouts, a digit naming its level. The six styles and
 * their geometry are docs/research/heading-level-markers.md's "Decision".
 */

import type { NodeKind } from '../model';

/** The glyph a heading's mark is drawn with. */
export type HeadingMarkerGlyph = 'H' | 'hash';

/** Where a heading's level digit sits against its glyph, if it is drawn. */
export type HeadingMarkerLevel = 'beside' | 'subscript' | 'none';

export interface HeadingMarkerStyle {
  readonly glyph: HeadingMarkerGlyph;
  readonly level: HeadingMarkerLevel;
}

/**
 * The node a mark is drawn for. A heading brings its level whatever its style
 * does with it, so no caller can ask for a heading's mark without one.
 */
export type MarkSubject =
  | { readonly kind: 'heading'; readonly level: number; readonly style: HeadingMarkerStyle }
  | { readonly kind: Exclude<NodeKind, 'heading'> };

/** One SVG element: its tag, its attributes, and, for a group, what it holds. */
export interface Shape {
  readonly tag: 'rect' | 'polygon' | 'circle' | 'line' | 'polyline' | 'path' | 'g';
  readonly attrs: Readonly<Record<string, string>>;
  readonly children?: readonly Shape[];
}

/**
 * The subject for a node known by its kind and optional level — a decoration
 * fact, or a lineage segment.
 *
 * A heading without a level is a model defect: every fact and segment carries
 * one exactly when its kind is `'heading'`. It throws rather than draw a
 * plausible mark for a level nobody knows.
 */
export function markSubject(
  kind: NodeKind,
  level: number | undefined,
  style: HeadingMarkerStyle,
): MarkSubject {
  if (kind !== 'heading') return { kind };
  if (level === undefined) throw new Error('A heading mark needs its level');
  return { kind, level, style };
}

/**
 * A subject's identity for a widget's `eq` or a DOM cache: two subjects with
 * the same key draw the same mark and state the same attributes.
 */
export function markKey(subject: MarkSubject): string {
  if (subject.kind !== 'heading') return subject.kind;
  return `heading:${subject.level}:${subject.style.glyph}:${subject.style.level}`;
}

export function markerShapes(subject: MarkSubject): readonly Shape[] {
  switch (subject.kind) {
    case 'heading':
      return headingShapes(subject.level, subject.style);
    case 'paragraph':
      // Three text lines, the last one shorter.
      return [line(2, 4, 14, 4), line(2, 8, 14, 8), line(2, 12, 9, 12)];
    case 'code':
      // "</>"
      return [
        { tag: 'polyline', attrs: { ...STROKE, points: '6,3 2,8 6,13' } },
        line(9.5, 2, 6.5, 14),
        { tag: 'polyline', attrs: { ...STROKE, points: '10,3 14,8 10,13' } },
      ];
    case 'table':
      // 2x2 grid.
      return [
        { tag: 'rect', attrs: { ...STROKE, x: '2', y: '2', width: '12', height: '12', rx: '1' } },
        line(2, 8, 14, 8),
        line(8, 2, 8, 14),
      ];
    case 'callout':
      // Filled alert circle with an "!" bar, knocked out of the page colour.
      return [
        { tag: 'circle', attrs: { cx: '8', cy: '8', r: '6', fill: 'currentColor' } },
        rect(7, 4, 2, 5, KNOCKOUT),
        rect(7, 10, 2, 2, KNOCKOUT),
      ];
    case 'quote':
      // Two opening-quote marks.
      return [
        { tag: 'circle', attrs: { cx: '5', cy: '5', r: '2', fill: 'currentColor' } },
        rect(4, 5, 2, 4),
        { tag: 'circle', attrs: { cx: '11', cy: '5', r: '2', fill: 'currentColor' } },
        rect(10, 5, 2, 4),
      ];
    case 'html':
      // An outlined tag/document shape with a folded corner.
      return [
        { tag: 'rect', attrs: { ...STROKE, x: '3', y: '2', width: '10', height: '12', rx: '1' } },
        line(9, 2, 13, 6),
      ];
    case 'hr':
      // A single bold horizontal bar.
      return [rect(2, 7, 12, 2)];
    case 'list-item':
      // A bullet. The EDITOR never asks for this one — a list line there keeps
      // its native marker, which is editable text the reader typed. The
      // backlinks footer does: it renders list items unwrapped, with no native
      // marker to keep, so it draws the bullet the reader would have seen.
      //
      // Larger than a speck: it stands in for a real bullet beside 16px text.
      return [{ tag: 'circle', attrs: { cx: '8', cy: '8', r: '3', fill: 'currentColor' } }];
  }
}

/* ---------------------------------------------------------------------------
 * Heading marks
 * ------------------------------------------------------------------------- */

/** `x, y, width, height` in viewBox units. */
type Box = readonly [x: number, y: number, w: number, h: number];

/**
 * The six digits, as monoline paths authored in a 6 × 10 box with the figure
 * between y = 1 and y = 9: open counters and round terminals, the shapes a
 * numeral needs to stay legible at the marker's size. Drawn rather than typeset
 * so the reader's font never enters the mark's geometry.
 */
const DIGIT_PATHS: Readonly<Record<number, string>> = {
  1: 'M1.5,2.4 L3.0,1.0 L3.0,9.0',
  2: 'M0.9,2.7 C0.9,0.6 5.2,0.3 5.2,3.0 C5.2,5.1 1.6,6.5 0.8,9.0 L5.3,9.0',
  3:
    'M0.9,2.2 C1.4,0.5 5.2,0.4 5.2,2.7 C5.2,4.2 3.7,4.9 2.7,4.9 ' +
    'C3.9,4.9 5.4,5.6 5.4,7.2 C5.4,9.5 1.5,9.8 0.8,7.9',
  4: 'M4.3,9.0 L4.3,1.0 L0.7,6.6 L5.5,6.6',
  5: 'M5.0,1.0 L1.5,1.0 L1.2,4.3 C2.5,3.5 5.4,3.9 5.4,6.5 C5.4,9.3 1.9,9.9 0.8,8.3',
  6:
    'M4.9,1.2 C2.3,1.9 1.0,4.1 1.0,6.4 C1.0,8.4 2.2,9.4 3.3,9.4 ' +
    'C4.6,9.4 5.4,8.4 5.4,7.2 C5.4,6.0 4.5,5.1 3.2,5.1 C2.1,5.1 1.2,5.8 1.0,6.6',
};
const DIGIT_AUTHORED_W = 6;
const DIGIT_AUTHORED_H = 10;
const FIGURE_TOP = 1;
const FIGURE_BASELINE = 9;

const TWIN_DIGIT: Box = [9.2, 2.2, 6.2, 11.6];
const SUBSCRIPT_DIGIT: Box = [10.0, 7.4, 5.4, 7.2];

/** A digit's uniform scale into its box, and the offset that centres it there. */
function placeDigit([x, y, w, h]: Box): { s: number; tx: number; ty: number } {
  const s = Math.min(w / DIGIT_AUTHORED_W, h / DIGIT_AUTHORED_H);
  return { s, tx: x + (w - DIGIT_AUTHORED_W * s) / 2, ty: y + (h - DIGIT_AUTHORED_H * s) / 2 };
}

/** Where a digit's ink starts and ends vertically: its figure, plus half its
 * stroke on either side. */
function digitInk(box: Box, t: number): readonly [top: number, bottom: number] {
  const { s, ty } = placeDigit(box);
  return [ty + FIGURE_TOP * s - t / 2, ty + FIGURE_BASELINE * s + t / 2];
}

interface HeadingGeometry {
  readonly glyphBox: Box;
  /** The glyph's bar thickness. */
  readonly glyphT: number;
  /** The digit's box and stroke, or none where the layout draws no digit. */
  readonly digit: { readonly box: Box; readonly t: number } | null;
}

/*
 * Every thickness below is its layout's base bar or stroke times the weight the
 * decision fixed for that style, written as that product so the two stay
 * legible apart. The subscript's digit stroke carries one more factor, 0.92,
 * which is part of its base.
 */
const TWIN_H_DIGIT_T = 1.55 * 1.0;
const [TWIN_INK_TOP, TWIN_INK_BOTTOM] = digitInk(TWIN_DIGIT, TWIN_H_DIGIT_T);
const SUBSCRIPT_DIGIT_T = 1.55 * 0.92 * 0.9;

const HEADING_GEOMETRY: Readonly<
  Record<HeadingMarkerGlyph, Readonly<Record<HeadingMarkerLevel, HeadingGeometry>>>
> = {
  H: {
    // The H stands exactly as tall as the digit's ink beside it, so the pair
    // shares a cap line and a baseline.
    beside: {
      glyphBox: [0.6, TWIN_INK_TOP, 6.0, TWIN_INK_BOTTOM - TWIN_INK_TOP],
      glyphT: 1.7 * 1.0,
      digit: { box: TWIN_DIGIT, t: TWIN_H_DIGIT_T },
    },
    subscript: {
      glyphBox: [0.8, 1.4, 8.2, 10.4],
      glyphT: 2.0 * 0.85,
      digit: { box: SUBSCRIPT_DIGIT, t: SUBSCRIPT_DIGIT_T },
    },
    // The heading mark from before levels existed, unchanged.
    none: { glyphBox: [3, 2, 10, 12], glyphT: 2, digit: null },
  },
  hash: {
    beside: {
      glyphBox: [0.4, 4.2, 7.2, 7.6],
      glyphT: 1.5 * 0.9,
      digit: { box: TWIN_DIGIT, t: 1.55 * 1.0 },
    },
    subscript: {
      glyphBox: [0.5, 1.4, 9.2, 9.6],
      glyphT: 1.7 * 0.85,
      digit: { box: SUBSCRIPT_DIGIT, t: SUBSCRIPT_DIGIT_T },
    },
    none: { glyphBox: [2.4, 2.0, 11.2, 12.0], glyphT: 1.8, digit: null },
  },
};

function headingShapes(level: number, style: HeadingMarkerStyle): readonly Shape[] {
  const geometry = HEADING_GEOMETRY[style.glyph][style.level];
  const glyph =
    style.glyph === 'H' ? glyphH(geometry.glyphBox, geometry.glyphT) : glyphHash(geometry.glyphBox, geometry.glyphT);
  if (!geometry.digit) return glyph;
  return [...glyph, digitShape(level, geometry.digit.box, geometry.digit.t)];
}

/** Two stems and a crossbar. */
function glyphH([x, y, w, h]: Box, t: number): Shape[] {
  return [rect(x, y, t, h), rect(x + w - t, y, t, h), rect(x, y + (h - t) / 2, w, t)];
}

/** Two slanted stems and two full-width rails. Slanted, because upright stems
 * read as a window frame rather than a hash at this size. */
function glyphHash([x, y, w, h]: Box, t: number): Shape[] {
  const slant = Math.min(0.9, w * 0.11);
  const stem = (left: number): Shape => ({
    tag: 'polygon',
    attrs: {
      points: [
        [left + slant, y],
        [left + slant + t, y],
        [left - slant + t, y + h],
        [left - slant, y + h],
      ]
        .map((p) => p.map(num).join(','))
        .join(' '),
      fill: 'currentColor',
    },
  });
  return [
    stem(x + w * 0.2),
    stem(x + w * 0.62),
    rect(x, y + h * 0.28 - t / 2, w, t),
    rect(x, y + h * 0.7 - t / 2, w, t),
  ];
}

/**
 * A digit placed in its box. The stroke width is divided by the scale, so `t`
 * is the stroke as drawn in viewBox units whatever the box's size — a
 * non-scaling stroke would instead fix it in screen pixels, and the footer's
 * smaller box would draw a heavier digit than the editor's.
 */
function digitShape(level: number, box: Box, t: number): Shape {
  const d = DIGIT_PATHS[level];
  if (d === undefined) throw new Error(`No digit for heading level ${level}`);
  const { s, tx, ty } = placeDigit(box);
  return {
    tag: 'g',
    attrs: {
      transform: `translate(${num(tx)} ${num(ty)}) scale(${num(s, 4)})`,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': num(t / s),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    children: [{ tag: 'path', attrs: { d } }],
  };
}

/* ---------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */

const STROKE = {
  stroke: 'currentColor',
  'stroke-width': '1.5',
  fill: 'none',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;

const FILL = { fill: 'currentColor' } as const;
const KNOCKOUT = { fill: 'var(--background-primary)' } as const;

/** A number as an attribute: short, and free of float noise. */
function num(n: number, places = 3): string {
  return String(+n.toFixed(places));
}

function rect(x: number, y: number, w: number, h: number, paint: Readonly<Record<string, string>> = FILL): Shape {
  return { tag: 'rect', attrs: { x: num(x), y: num(y), width: num(w), height: num(h), ...paint } };
}

function line(x1: number, y1: number, x2: number, y2: number): Shape {
  return { tag: 'line', attrs: { ...STROKE, x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) } };
}
