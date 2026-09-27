/**
 * The seam oracle of `created-seams-are-separated` (design D11): generated
 * notes, every structural operation over them, and five checks on what each
 * operation writes at its seams. It counts rather than asserts, so the same
 * sweep measures today's operations and the edit-site pass.
 *
 * The notes are generated as TEXT, from blocks joined by gaps of none, one or
 * two blank lines, so the seams a user writes flush under a quote, a callout
 * or a list item are among them — the seams every reader but our parse
 * continues lazily.
 */

import { Parser, type Node as CmNode } from 'commonmark';
import { editSite, isPlace } from '../src/edit-site';
import { encode } from '../src/encode';
import { forEachNodeWithLine } from '../src/locate';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import {
  deleteSubtrees,
  indentGroups,
  insertSiblingHeading,
  insertSubtrees,
  mergeNodes,
  moveGroupsDown,
  moveGroupsUp,
  moveSubtreesTo,
  outdentGroups,
  splitNode,
} from '../src/ops';
import { kindAsWritten, parse } from '../src/parse';
import { isLoneBlockIdLine } from '../src/rules';

// ------------------------------------------------------------------ notes

/** A small deterministic PRNG, so a sweep's figures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Block = (n: number, prev: string | undefined) => string[] | undefined;

/** Every block opens with a label unique in its note, so a line names it. */
const BLOCKS: readonly (readonly [number, Block])[] = [
  [4, (n) => [`p${n}`]],
  [2, (n) => [`> q${n}`]],
  [1, (n) => [`> [!note] c${n}`]],
  [2, (n) => [`## h${n}`]],
  [1, (n) => [`### h${n}`]],
  [3, (n) => [`- i${n}`]],
  [2, (n, prev) => (prev?.startsWith('- ') ? [`  - j${n}`] : undefined)],
  [1, (n, prev) => (prev?.startsWith('- ') ? [`  m${n}`] : undefined)],
  [1, (n) => [`1. o${n}`]],
  [1, (n) => [`2. o${n}`]],
  [1, (n) => ['```', `k${n}`, '```']],
  [1, (n) => [`| t${n} | b |`, '| --- | --- |']],
  [1, (n) => [`<div>d${n}</div>`]],
  [1, (n) => [`^id${n}`]],
];

const GAPS: readonly (readonly [number, number])[] = [
  [3, 0],
  [3, 1],
  [1, 2],
];

function pick<T>(random: () => number, weighted: readonly (readonly [number, T])[]): T {
  const total = weighted.reduce((sum, [w]) => sum + w, 0);
  let r = random() * total;
  for (const [w, value] of weighted) if ((r -= w) < 0) return value;
  return weighted[weighted.length - 1]![1];
}

/** `count` notes of up to `size` blocks each. */
export function generateNotes(seed: number, count: number, size: number): string[] {
  const random = mulberry32(seed);
  const notes: string[] = [];
  for (let k = 0; k < count; k++) {
    const lines: string[] = [];
    const blocks = 2 + Math.floor(random() * (size - 1));
    let prev: string | undefined;
    for (let n = 1; n <= blocks; n++) {
      let block: string[] | undefined;
      while (!block) block = pick(random, BLOCKS)(n, prev);
      if (n > 1) for (let g = pick(random, GAPS); g > 0; g--) lines.push('');
      lines.push(...block);
      prev = block[0];
    }
    notes.push(`${lines.join('\n')}\n`);
  }
  return notes;
}

// -------------------------------------------------------------- operations

/** What a clipboard holds for the paste operations. */
const PAYLOADS = ['> z1', 'z2\n\n> z3', '- z4', 'z5', '> z6\nz7'];

export interface Application {
  readonly name: string;
  readonly run: () => { ok: boolean };
}

/** Every operation the sweep applies to `doc`, one per applicable node. */
export function applications(doc: OutlineDoc): Application[] {
  const out: Application[] = [];
  const nodes = [...walkNodes(doc)];
  const starts = new Map<number, number>();
  forEachNodeWithLine(doc, (node, line) => void starts.set(node.id, line));
  for (const node of nodes) {
    const id = node.id;
    const label = node.lines[0]!.trim();
    out.push({ name: `indent ${label}`, run: () => indentGroups(doc, [[id]]) });
    out.push({ name: `outdent ${label}`, run: () => outdentGroups(doc, [[id]]) });
    out.push({ name: `move up ${label}`, run: () => moveGroupsUp(doc, [[id]]) });
    out.push({ name: `move down ${label}`, run: () => moveGroupsDown(doc, [[id]]) });
    out.push({ name: `delete ${label}`, run: () => deleteSubtrees(doc, [id]) });
    out.push({ name: `merge ${label}`, run: () => mergeNodes(doc, id) });
    const first = node.lines[0]!;
    out.push({
      name: `split ${label}`,
      run: () => splitNode(doc, id, { line: starts.get(id)!, ch: first.length - 1 }),
    });
    if (node.kind === 'heading') {
      out.push({ name: `sibling heading ${label}`, run: () => insertSiblingHeading(doc, id, 'r') });
    }
    for (const payload of PAYLOADS) {
      out.push({
        name: `paste ${JSON.stringify(payload)} after ${label}`,
        run: () => insertSubtrees(doc, id, parse(payload).children, 'after'),
      });
    }
    out.push({
      name: `move ${label} to the top`,
      run: () => moveSubtreesTo(doc, [[id]], { parentId: 'root', index: 0 }),
    });
    out.push({
      name: `move ${label} to the end`,
      run: () => moveSubtreesTo(doc, [[id]], { parentId: 'root', index: doc.children.length }),
    });
  }
  for (const scope of [doc.children, ...nodes.map((n) => n.children)]) {
    for (let i = 0; i + 1 < scope.length; i++) {
      const pair = [scope[i]!.id, scope[i + 1]!.id];
      const label = `${scope[i]!.lines[0]!.trim()} + ${scope[i + 1]!.lines[0]!.trim()}`;
      out.push({ name: `group move up ${label}`, run: () => moveGroupsUp(doc, [pair]) });
      out.push({ name: `group move down ${label}`, run: () => moveGroupsDown(doc, [pair]) });
      out.push({ name: `group indent ${label}`, run: () => indentGroups(doc, [pair]) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ seams

interface Seam {
  readonly upper: OutlineNode;
  readonly lower: OutlineNode;
  /** The upper block's last line, and the lower block's first, in the text. */
  readonly upperLine: number;
  readonly lowerLine: number;
  /** Whether the seam lies inside a list (design D3). */
  readonly inList: boolean;
  /** The upper block lies in a list item, and the lower's first line. */
  readonly upperInItem: boolean;
}

function childMargin(node: OutlineNode, margin: number): number {
  if (node.kind !== 'list-item') return margin;
  const match = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)/.exec(node.lines[0] ?? '');
  return match ? match[0].length : margin;
}

/** Every seam of `doc`, with where it stands in `encode(doc)`. */
function seamsOf(doc: OutlineDoc): Seam[] {
  interface Walked {
    node: OutlineNode;
    start: number;
    kind: string;
    /** The ids of the list items this block lies in or is, innermost last. */
    items: readonly number[];
    /** The list this block is an item of, as its first item's id. */
    listOf: number | undefined;
  }
  const walked: Walked[] = [];
  let line = doc.preamble.length;
  const walk = (
    nodes: readonly OutlineNode[],
    margin: number,
    items: readonly number[],
  ): void => {
    let listHead: number | undefined;
    nodes.forEach((node) => {
      const kind = kindAsWritten(node, margin);
      if (kind === 'list-item') listHead ??= node.id;
      else listHead = undefined;
      const own = kind === 'list-item' ? [...items, node.id] : items;
      walked.push({ node, start: line, kind, items: own, listOf: kind === 'list-item' ? listHead : undefined });
      line += node.lines.length + (node.blockId ? node.blockId.gap.length + 1 : 0) + node.trailingGap.length;
      walk(node.children, childMargin(node, margin), own);
    });
  };
  walk(doc.children, 0, []);
  const listOfItem = new Map<number, number>();
  for (const w of walked) if (w.listOf !== undefined) listOfItem.set(w.node.id, w.listOf);
  const seams: Seam[] = [];
  for (let i = 1; i < walked.length; i++) {
    const u = walked[i - 1]!;
    const l = walked[i]!;
    const lowerLists = new Set(l.items.map((id) => listOfItem.get(id)));
    const inList = u.items.some((id) => lowerLists.has(listOfItem.get(id)));
    const upperLast = u.start + u.node.lines.length - 1 + (u.node.blockId ? u.node.blockId.gap.length + 1 : 0);
    seams.push({
      upper: u.node,
      lower: l.node,
      upperLine: upperLast,
      lowerLine: l.start,
      inList,
      upperInItem: u.items.length > 0,
    });
  }
  return seams;
}

// ---------------------------------------------------------------- readers

const cmParser = new Parser();

/** The source lines (0-based, inclusive) of every CommonMark block below the document. */
function cmBlocks(text: string): { type: string; from: number; to: number; fenced: boolean }[] {
  const out: { type: string; from: number; to: number; fenced: boolean }[] = [];
  const walker = cmParser.parse(text).walker();
  let event;
  while ((event = walker.next())) {
    const node: CmNode = event.node;
    if (!event.entering || !node.isContainer && node.type !== 'code_block' && node.type !== 'paragraph' &&
      node.type !== 'html_block' && node.type !== 'heading' && node.type !== 'thematic_break') continue;
    if (node.type === 'document' || !node.sourcepos) continue;
    const [[from], [to]] = node.sourcepos;
    const first = text.split('\n')[from - 1] ?? '';
    out.push({ type: node.type, from: from - 1, to: to - 1, fenced: /^\s*(```|~~~)/.test(first) });
  }
  return out;
}

/**
 * Whether some reader continues the seam's lower block into its upper one:
 * CommonMark, when one of its blocks holds both lines, or reading mode's three
 * rows beyond it (`lazy-continuation-at-seams`, "Measured: CommonMark").
 */
function continued(seam: Seam, lines: readonly string[], blocks: ReturnType<typeof cmBlocks>): boolean {
  // A `list` holding both lines is two lists CommonMark joins across blank
  // lines, not a line continued: its items are its own.
  if (blocks.some((b) => b.type !== 'list' && b.from <= seam.upperLine && b.to >= seam.lowerLine)) return true;
  if (seam.lowerLine !== seam.upperLine + 1) return false;
  const next = (lines[seam.lowerLine] ?? '').trimStart();
  if (seam.upperInItem && (next.startsWith('<div') || next.startsWith('>'))) return true;
  const upperKind = kindAsWritten(seam.upper, 0);
  return (upperKind === 'quote' || upperKind === 'callout') && /^(?!1[.)])\d{1,9}[.)][ \t]/.test(next);
}

// ----------------------------------------------------------------- checks

export interface Tally {
  applications: number;
  accepted: number;
  /** Check 1: a seam away from the edit site whose bytes changed. */
  awayChanged: number;
  /** …of which the parse required the separator. */
  awayFloor: number;
  /** …of which it is #255's list-item first child. */
  away255: number;
  /** Check 2: a seam at the edit site outside a list that some reader continues. */
  continuedAtSite: number;
  /** …of which a limit exempts: a lone id above, or a block four columns in. */
  continuedExempt: number;
  /** Check 3: a list whose items all survive and whose tightness changed. */
  looseFlips: number;
  /** Check 4: a block id whose host changed. */
  idMoves: number;
  /** Check 5: indented code the operation created. */
  indentedCode: number;
  /** …of which the parse requires a separator below a block's attached id. */
  awayIdFloor: number;
  /** Seams at the edit site outside a list that are written flush. */
  flushAtSite: number;
  /** …of which no reader continues: the lines the narrower rule would not write. */
  flushUnneeded: number;
  /** Seams at the edit site outside a list. */
  siteSeams: number;
  examples: Record<string, string[]>;
}

export function emptyTally(): Tally {
  return {
    applications: 0,
    accepted: 0,
    awayChanged: 0,
    awayFloor: 0,
    away255: 0,
    continuedAtSite: 0,
    continuedExempt: 0,
    looseFlips: 0,
    idMoves: 0,
    indentedCode: 0,
    awayIdFloor: 0,
    flushAtSite: 0,
    flushUnneeded: 0,
    siteSeams: 0,
    examples: {},
  };
}

function example(tally: Tally, check: string, text: string): void {
  const list = (tally.examples[check] ??= []);
  if (list.length < (process.env.SEAM_ORACLE_ALL ? 1000 : 8)) list.push(text);
}

/** Whether a list is loose: a blank line between its items, or between an item's own blocks. */
function loose(items: readonly OutlineNode[]): boolean {
  const final = (n: OutlineNode): OutlineNode => (n.children.length ? final(n.children.at(-1)!) : n);
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (i + 1 < items.length && final(item).trailingGap.length > 0) return true;
    if (item.children.length > 0 && item.trailingGap.length > 0) return true;
    const kids = item.children;
    for (let k = 0; k + 1 < kids.length; k++) {
      if (kids[k]!.kind === 'list-item' && kids[k + 1]!.kind === 'list-item') continue;
      if (final(kids[k]!).trailingGap.length > 0) return true;
    }
  }
  return false;
}

/** Each list in `doc`, as its item ids, with whether it is loose. */
function lists(doc: OutlineDoc): { ids: number[]; loose: boolean }[] {
  const out: { ids: number[]; loose: boolean }[] = [];
  const walk = (nodes: readonly OutlineNode[]): void => {
    let run: OutlineNode[] = [];
    const flush = (): void => {
      if (run.length) out.push({ ids: run.map((n) => n.id), loose: loose(run) });
      run = [];
    };
    for (const n of nodes) {
      if (n.kind === 'list-item') run.push(n);
      else flush();
      walk(n.children);
    }
    flush();
  };
  walk(doc.children);
  return out;
}

/** Each block id in `doc` with the first line of the block it names. */
function idHosts(doc: OutlineDoc): Map<string, string> {
  const out = new Map<string, string>();
  const text = (n: OutlineNode): string => n.lines[0]!.trim();
  for (const n of walkNodes(doc)) {
    if (n.blockId) out.set(n.blockId.line.trim(), text(n));
    const last = n.lines.at(-1)!;
    const inline = /\s(\^[A-Za-z0-9-]+)\s*$/.exec(last);
    if (inline) out.set(inline[1]!, text(n));
    n.lines.slice(1).filter(isLoneBlockIdLine).forEach((l) => out.set(l.trim(), text(n)));
    if (n.lines.length === 1 && isLoneBlockIdLine(n.lines[0]!)) out.set(n.lines[0]!.trim(), '(lone)');
  }
  return out;
}

function indentedCodeCount(text: string): number {
  return cmBlocks(text).filter((b) => b.type === 'code_block' && !b.fenced).length;
}

/** The node count and kinds a text parses to. */
function shape(text: string): string {
  return [...walkNodes(parse(text))].map((n) => n.kind).join(',');
}

/**
 * Tallies one accepted operation: `before` is the note it acted on, `tree` the
 * tree `finalize` encoded (with the surgery's ids), and `after` the result.
 */
export function tallyOne(
  tally: Tally,
  name: string,
  before: OutlineDoc,
  tree: OutlineDoc,
  after: OutlineDoc,
): void {
  tally.accepted++;
  const beforeText = encode(before);
  const text = encode(tree);
  const lines = text.split('\n');
  const site = editSite(before, tree);
  const old = new Map([...walkNodes(before)].map((n) => [n.id, n]));
  const blocks = cmBlocks(text);
  const tag = `${name}\n${beforeText}---\n${text}`;
  for (const seam of seamsOf(tree)) {
    if (site.has(seam.lower.id)) {
      if (seam.inList) continue;
      tally.siteSeams++;
      const flush = seam.lowerLine === seam.upperLine + 1;
      if (flush) tally.flushAtSite++;
      if (!continued(seam, lines, blocks)) {
        if (flush) tally.flushUnneeded++;
      } else {
        const exempt =
          isLoneBlockIdLine(seam.upper.lines.at(-1)!) ||
          /^( {4,}|\t)/.test(lines[seam.lowerLine] ?? '') ||
          isPlace(seam.upper) ||
          isPlace(seam.lower);
        if (exempt) tally.continuedExempt++;
        else {
          tally.continuedAtSite++;
          example(tally, 'continued', tag);
        }
      }
      continue;
    }
    const was = old.get(seam.upper.id);
    if (!was || was.trailingGap.join('\n') === seam.upper.trailingGap.join('\n')) continue;
    tally.awayChanged++;
    const kind = kindAsWritten(seam.lower, 0);
    if (seam.upper.kind === 'list-item' && seam.upper.children[0] === seam.lower &&
      (kind === 'quote' || kind === 'callout' || kind === 'hr' || /^\s*- - -/.test(seam.lower.lines[0]!))) {
      tally.away255++;
      continue;
    }
    if (was.trailingGap.length === 0 && seam.upper.blockId && seam.upper.kind !== 'list-item') {
      tally.awayIdFloor++;
      continue;
    }
    const without = [...lines.slice(0, seam.upperLine + 1), ...lines.slice(seam.lowerLine)].join('\n');
    if (was.trailingGap.length === 0 && shape(without) !== shape(text)) tally.awayFloor++;
    else example(tally, 'away', `${JSON.stringify([seam.upper.lines[0], was.trailingGap, seam.upper.trailingGap, seam.lower.lines[0]])}\n${tag}`);
  }
  const beforeLists = lists(before);
  const listOf = new Map<number, { ids: number[]; loose: boolean }>();
  for (const l of beforeLists) for (const id of l.ids) listOf.set(id, l);
  for (const l of lists(tree)) {
    const was = listOf.get(l.ids[0]!);
    if (!was || was.ids.length !== l.ids.length || !l.ids.every((id, i) => was.ids[i] === id)) continue;
    if (was.loose !== l.loose) {
      tally.looseFlips++;
      example(tally, 'loose', tag);
    }
  }
  const hosts = idHosts(parse(beforeText));
  for (const [id, host] of idHosts(after)) {
    const was = hosts.get(id);
    const unchanged = (line: string): boolean =>
      line === '(lone)' || ([...walkNodes(before)].some((n) => n.lines[0]!.trim() === line) &&
        [...walkNodes(after)].some((n) => n.lines[0]!.trim() === line));
    if (was !== undefined && was !== host && unchanged(was) && unchanged(host) && !name.includes(id.slice(1))) {
      tally.idMoves++;
      example(tally, 'id', tag);
    }
  }
  if (indentedCodeCount(text) > indentedCodeCount(beforeText)) {
    tally.indentedCode++;
    example(tally, 'code', tag);
  }
}

/** Whether some reader continues the first seam of `text` (for the reader model's own tests). */
export function firstSeamContinued(text: string): boolean {
  const doc = parse(text);
  const seam = seamsOf(doc)[0];
  if (!seam) throw new Error('no seam');
  return continued(seam, text.split('\n'), cmBlocks(text));
}
