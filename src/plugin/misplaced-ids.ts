/**
 * Misplaced block ids in outline mode (`misplaced-block-ids`): the mark on the
 * id's text, the correction menu a press on it or on the paragraph's warning
 * glyph opens, and the one transaction a correction makes.
 *
 * What is misplaced, what Obsidian reads it as and what each correction
 * writes are `block-ids.ts`'s; this module only draws and dispatches.
 */

import { type EditorState, type Extension, RangeSetBuilder, Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  type PluginValue,
  ViewPlugin,
} from '@codemirror/view';
import { Menu } from 'obsidian';
import {
  misplacedBlockIds,
  type BlockIdCorrection,
  type BlockIdReading,
  type MisplacedBlockId,
} from '../block-ids';
import type { OutlineDoc } from '../model';
import { applyEdits } from '../result';
import { linePosToOffset } from './cm-pos';
import { editsToChanges } from './dispatch';
import { isNestedEditor } from './nested-editor';
import { isOutlineMode } from './outline-state';
import { parsedDoc } from './parsed-doc';

export const MISPLACED_ID_CLASS = 'to-decor-misplaced-id';

/** The userEvent a correction carries: plugin-own (`classify.ts`), since the
 * edit is valid by construction and by shape would read as boundary-crossing. */
export const BLOCK_ID_USER_EVENT = 'input.structure.block-id';

/** How far a press may travel and still be a press rather than a drag. */
const PRESS_SLOP_PX = 4;

const found = new WeakMap<OutlineDoc, readonly MisplacedBlockId[]>();

/** The misplaced ids of the state's document, computed once per parse. */
export function misplacedIn(state: EditorState): readonly MisplacedBlockId[] {
  const { doc } = parsedDoc(state.doc);
  let list = found.get(doc);
  if (!list) {
    list = misplacedBlockIds(doc);
    found.set(doc, list);
  }
  return list;
}

/** The misplaced id on a 0-based line, if any. */
export function misplacedAtLine(state: EditorState, line: number): MisplacedBlockId | undefined {
  return misplacedIn(state).find((m) => m.line === line);
}

/** The menu's first row and the mark's title: what Obsidian reads the id as. */
export function readingText(reading: BlockIdReading): string {
  switch (reading.kind) {
    case 'whole-list':
      return 'Obsidian reads this ID as naming the whole list above it';
    case 'item':
      return `Obsidian reads this ID as naming “${short(reading.itemText)}”`;
    case 'nothing':
      switch (reading.because) {
        case 'next-id':
          return 'Obsidian ignores this ID: the next one names the same block';
        case 'nothing-above':
          return 'Obsidian ignores this ID: nothing comes before it';
        case 'block-below':
          return 'Obsidian reads this ID as naming only its own line';
      }
      break;
    case 'not-an-id':
      return reading.because === 'trailing-space'
        ? 'Not an ID to Obsidian: whitespace follows it'
        : 'Not an ID to Obsidian: the line below joins it';
  }
  return '';
}

export function correctionLabel(correction: BlockIdCorrection, id: string): string {
  switch (correction.kind) {
    case 'attach':
      return `Attach to “${short(correction.targetText ?? '')}”`;
    case 'trim':
      return 'Remove trailing whitespace';
    case 'separate':
      return 'Separate from the line below';
    case 'remove':
      return `Remove ${id}`;
  }
}

function short(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
}

/**
 * The correction menu for `misplaced`: the reading, disabled, then one row per
 * correction, the removal last. At the press that asked for it, or at a point.
 */
export function openCorrectionMenu(
  view: EditorView,
  misplaced: MisplacedBlockId,
  at: MouseEvent | { x: number; y: number },
): void {
  const menu = new Menu();
  menu.addItem((item) => item.setTitle(readingText(misplaced.reading)).setDisabled(true));
  for (const correction of misplaced.corrections) {
    menu.addItem((item) =>
      item
        .setTitle(correctionLabel(correction, misplaced.id))
        .onClick(() => applyCorrection(view, correction)),
    );
  }
  if ('clientX' in at) menu.showAtMouseEvent(at);
  else menu.showAtPosition(at);
}

/** The menu for the caret's line, placed at the caret. False when that line
 * holds no misplaced id. */
export function openCorrectionMenuAtCaret(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const misplaced = misplacedAtLine(view.state, line.number - 1);
  if (!misplaced) return false;
  const coords = view.coordsAtPos(head);
  openCorrectionMenu(view, misplaced, coords ? { x: coords.left, y: coords.bottom } : { x: 0, y: 0 });
  return true;
}

/** One transaction, one undo step. */
export function applyCorrection(view: EditorView, correction: BlockIdCorrection): void {
  const lines = view.state.doc.toString().split('\n');
  const doc = view.state.doc;
  const changes = editsToChanges(lines, correction.edits).map((change) => ({
    from: doc.line(change.from.line + 1).from + change.from.ch,
    to: doc.line(change.to.line + 1).from + change.to.ch,
    insert: change.text,
  }));
  const after = Text.of(applyEdits(lines, correction.edits));
  view.dispatch({
    changes,
    selection: { anchor: linePosToOffset(after, correction.caret) },
    scrollIntoView: true,
    userEvent: BLOCK_ID_USER_EVENT,
  });
  view.focus();
}

function computeMarks(view: EditorView): DecorationSet {
  if (isNestedEditor(view) || !isOutlineMode(view.state)) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const misplaced of misplacedIn(view.state)) {
    if (misplaced.line >= doc.lines) continue;
    const line = doc.line(misplaced.line + 1);
    builder.add(
      line.from + misplaced.from,
      line.from + misplaced.to,
      Decoration.mark({
        class: MISPLACED_ID_CLASS,
        attributes: { title: `${readingText(misplaced.reading)}. Press for corrections.` },
      }),
    );
  }
  return builder.finish();
}

/** The events a handled press has to swallow, in the order they arrive. */
const TRAILING_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

/**
 * The mark, and the press that opens the menu at its release.
 *
 * The listener is the surplus-space mark's (`decorations.ts`): `pointerdown`
 * in the capture phase on the editor's own element, so neither CM6 nor the
 * browser places a caret or starts a selection from it, and the trailing mouse
 * events swallowed. The menu opens at release, so a press that wanders off is
 * not a menu.
 */
class MisplacedIdMarks implements PluginValue {
  decorations: DecorationSet;
  private readonly onPointerDown: (event: Event) => void;
  private readonly onPointerUp: (event: Event) => void;
  private readonly onTrailing: (event: Event) => void;
  private readonly Element: typeof Element;
  private press: { pointerId: number; x: number; y: number; line: number } | null = null;
  private consuming = false;

  constructor(private readonly view: EditorView) {
    this.decorations = computeMarks(view);
    this.Element = view.dom.ownerDocument.defaultView?.Element ?? Element;
    this.onPointerDown = (event) => this.handle(event as PointerEvent);
    this.onPointerUp = (event) => this.release(event as PointerEvent);
    this.onTrailing = (event) => this.swallow(event);
    view.dom.addEventListener('pointerdown', this.onPointerDown, true);
    view.dom.addEventListener('pointerup', this.onPointerUp, true);
    for (const type of TRAILING_EVENTS) view.dom.addEventListener(type, this.onTrailing, true);
  }

  update(): void {
    this.decorations = computeMarks(this.view);
  }

  destroy(): void {
    this.view.dom.removeEventListener('pointerdown', this.onPointerDown, true);
    this.view.dom.removeEventListener('pointerup', this.onPointerUp, true);
    for (const type of TRAILING_EVENTS) this.view.dom.removeEventListener(type, this.onTrailing, true);
  }

  private handle(event: PointerEvent): void {
    this.consuming = false;
    this.press = null;
    if (event.button !== 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target instanceof this.Element ? event.target : null;
    const mark = target?.closest<HTMLElement>(`.${MISPLACED_ID_CLASS}`);
    if (!mark) return;
    if (isNestedEditor(this.view) || !isOutlineMode(this.view.state)) return;
    let pos: number;
    try {
      pos = this.view.posAtDOM(mark);
    } catch {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.consuming = true;
    const line = this.view.state.doc.lineAt(pos).number - 1;
    this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, line };
  }

  private release(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.press = null;
    event.preventDefault();
    event.stopPropagation();
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > PRESS_SLOP_PX) return;
    const misplaced = misplacedAtLine(this.view.state, press.line);
    if (misplaced) openCorrectionMenu(this.view, misplaced, event);
  }

  private swallow(event: Event): void {
    if (!this.consuming) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click') this.consuming = false;
  }
}

export function misplacedIdsExtension(): Extension {
  return ViewPlugin.fromClass(MisplacedIdMarks, { decorations: (plugin) => plugin.decorations });
}

/** The menu a release on a paragraph's warning glyph opens (`zoom-click.ts`). */
export function openCorrectionMenuAtMark(view: EditorView, mark: HTMLElement, event: MouseEvent): void {
  let pos: number;
  try {
    pos = view.posAtDOM(mark);
  } catch {
    return;
  }
  const misplaced = misplacedAtLine(view.state, view.state.doc.lineAt(pos).number - 1);
  if (misplaced) openCorrectionMenu(view, misplaced, event);
}
