/**
 * Builds a browser editor running the plugin's own extensions.
 *
 * The extension order mirrors `src/plugin/main.ts`: nested-editor gate, view
 * registry, zoom anchor, outline mode, keyboard grammar, decorations, the
 * transaction filter, then zoom's hiding, trail, click and view layers, and
 * the history caret last. The backlinks footer is the one omission: it reads
 * the vault's metadata cache, which a browser page does not have.
 */

import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightSpecialChars, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';

import { nestedEditorExtension } from '../../src/plugin/nested-editor';
import { viewRegistryExtension } from '../../src/plugin/view-registry';
import { zoomStateExtension, zoomTo, zoomCleared } from '../../src/plugin/zoom-state';
import { outlineStateExtension, outlineToggled, isOutlineMode } from '../../src/plugin/outline-state';
import { grammarExtension } from '../../src/plugin/keymap';
import { decorationsExtension, type DecorationSource } from '../../src/plugin/decorations';
import { transactionFilterExtension } from '../../src/plugin/transaction-filter';
import { TransactionStats } from '../../src/plugin/stats';
import { zoomDecorationsExtension } from '../../src/plugin/zoom-decorations';
import { zoomTrailExtension, type ZoomTrailSource } from '../../src/plugin/zoom-trail';
import { zoomClickExtension } from '../../src/plugin/zoom-click';
import { zoomViewExtension } from '../../src/plugin/zoom-view';
import { historyCaretExtension } from '../../src/plugin/history-caret';
import { zoomScope } from '../../src/plugin/zoom-scope';
import { parsedDoc } from '../../src/plugin/parsed-doc';
import { resolveZoom } from '../../src/zoom';
import { applyAppearance, type AppearanceSource } from '../../src/plugin/appearance';
import { demoFileInfo, editorInfoField, makeFileInfo } from './obsidian-shim';
import { livePreviewExtension } from './live-preview';

export type DemoSettings = DecorationSource & ZoomTrailSource & AppearanceSource;

export const DEFAULT_SETTINGS: DemoSettings = {
  markerVisibility: 'all',
  markerHighlight: 'current',
  guideHighlight: 'full',
  guideVisibility: 'all',
  guideHideSingleRoot: false,
  backlinksSegmentIcons: 'all',
  backlinksSeparator: 'none',
  outlineUnit: 'auto',
  guideIntensity: 'subtle',
};

export interface OutlineEditorOptions {
  doc: string;
  path?: string;
  settings?: Partial<DemoSettings>;
  outline?: boolean;
  readOnly?: boolean;
}

export interface OutlineEditor {
  view: EditorView;
  wrapper: HTMLElement;
  settings: DemoSettings;
  setOutline(on: boolean): void;
  isOutline(): boolean;
  setSettings(patch: Partial<DemoSettings>): void;
  zoomToLine(line: number): void;
  zoomOut(): void;
  isZoomed(): boolean;
  setDoc(doc: string): void;
  destroy(): void;
}

/**
 * The plugin's extensions read their settings through the object they were
 * given, fresh on every recompute, so one mutable object per editor is the
 * whole settings store.
 */
export function createOutlineEditor(parent: HTMLElement, options: OutlineEditorOptions): OutlineEditor {
  const settings: DemoSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const info = makeFileInfo(options.path ?? 'Kitchen renovation.md');
  const stats = new TransactionStats();
  const readOnly = new Compartment();

  const wrapper = document.createElement('div');
  wrapper.className = 'to-demo markdown-source-view mod-cm6 is-live-preview cm-s-obsidian';
  parent.appendChild(wrapper);

  const extensions: Extension[] = [
    demoFileInfo.of(info),
    // Obsidian installs this field in every editor; the grammar, zoom and
    // decorations all gate on the note path it carries.
    editorInfoField,
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    indentUnit.of('\t'),
    // Lowest precedence, so its marks sit OUTSIDE the plugin's own: the
    // plugin wraps an ordered marker's digits inside the formatting span the
    // way Obsidian's renderer emits them.
    Prec.lowest(livePreviewExtension()),
    // CodeMirror scrolls every scrollable ancestor to reveal the caret, the
    // page included, which would drag a reader along with a scripted tour.
    // The editor's own scroller is the only thing that moves.
    EditorView.scrollHandler.of((v, range) => {
      // Called mid-measure, where DOM coordinates may not be read; the line
      // block's cached geometry is enough to place the scroller.
      const block = v.lineBlockAt(range.head);
      const scroller = v.scrollDOM;
      const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const top = block.top + pad;
      const bottom = block.bottom + pad;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      if (top < viewTop) scroller.scrollTop = Math.max(0, top - 12);
      else if (bottom > viewBottom) scroller.scrollTop = bottom - scroller.clientHeight + 12;
      return true;
    }),
    readOnly.of(EditorState.readOnly.of(!!options.readOnly)),
    placeholder('Empty note'),
    nestedEditorExtension(),
    viewRegistryExtension(),
    zoomStateExtension(),
    outlineStateExtension({ outlineByDefault: options.outline ?? true }),
    grammarExtension(),
    decorationsExtension(settings),
    transactionFilterExtension({ debugCrossCheck: false }, stats),
    zoomDecorationsExtension(),
    zoomTrailExtension(settings),
    zoomClickExtension(),
    zoomViewExtension(),
    historyCaretExtension(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: options.doc, extensions }),
    parent: wrapper,
  });
  applyAppearance(settings, wrapper);

  const editor: OutlineEditor = {
    view,
    wrapper,
    settings,
    setOutline(on) {
      if (isOutlineMode(view.state) === on) return;
      view.dispatch({ effects: outlineToggled.of(on) });
    },
    isOutline: () => isOutlineMode(view.state),
    setSettings(patch) {
      Object.assign(settings, patch);
      applyAppearance(settings, wrapper);
      // A settings change that is not a document change still has to reach
      // the decoration recompute; an empty transaction with a no-op selection
      // is the cheapest thing that does.
      view.dispatch({ selection: view.state.selection });
    },
    zoomToLine(line) {
      const { doc } = parsedDoc(view.state.doc);
      const scope = resolveZoom(doc, line);
      if (!scope) return;
      const anchor = view.state.doc.line(line + 1).from;
      view.dispatch({ effects: zoomTo.of(anchor) });
    },
    zoomOut() {
      view.dispatch({ effects: zoomCleared.of(null) });
    },
    isZoomed: () => zoomScope(view.state) !== null,
    setDoc(doc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
    },
    destroy() {
      view.destroy();
      wrapper.remove();
    },
  };
  // Reachable from the page for scripts and for inspection.
  (wrapper as HTMLElement & { outlineEditor?: OutlineEditor }).outlineEditor = editor;
  return editor;
}

// ---- Scripted keystrokes ----------------------------------------------------

export type ScriptStep = { label?: string } & (
  | { key: string; mod?: boolean; shift?: boolean; alt?: boolean }
  | { type: string }
  | { cursor: [number, number] }
  | { select: [[number, number], [number, number]] }
  | { click: 'marker'; line: number }
  | { zoom: 'out' }
  | { outline: boolean }
  | { pause: number }
  | { say: string }
);

export interface ScriptRunner {
  run(steps: ScriptStep[], onStep?: (step: ScriptStep, index: number) => void): Promise<void>;
  cancel(): void;
}

const KEY_CODES: Record<string, string> = {
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  Escape: 'Escape',
};

function posOf(view: EditorView, line: number, ch: number): number {
  const l = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
  return Math.min(l.from + ch, l.to);
}

/** Sends a key the way the keyboard would: a `keydown` on the content DOM,
 * which is where CodeMirror's keymaps listen. */
export function sendKey(view: EditorView, step: { key: string; mod?: boolean; shift?: boolean; alt?: boolean }): boolean {
  const isMac = navigator.platform.startsWith('Mac');
  const event = new KeyboardEvent('keydown', {
    key: step.key,
    code: KEY_CODES[step.key] ?? (step.key.length === 1 ? `Key${step.key.toUpperCase()}` : step.key),
    bubbles: true,
    cancelable: true,
    metaKey: !!step.mod && isMac,
    ctrlKey: !!step.mod && !isMac,
    shiftKey: !!step.shift,
    altKey: !!step.alt,
  });
  view.contentDOM.dispatchEvent(event);
  const handled = event.defaultPrevented;
  if (!handled && step.key.length === 1 && !step.mod && !step.alt) {
    // A keydown alone inserts nothing; the character goes in the way the
    // browser's input event would, annotated as typing so the plugin's
    // provisional-position rules read it as text arriving, not as the caret
    // leaving.
    view.dispatch({ ...view.state.replaceSelection(step.key), userEvent: 'input.type' });
    return true;
  }
  return handled;
}

export function scriptRunner(editor: OutlineEditor, delay = 700): ScriptRunner {
  let cancelled = false;
  const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  return {
    cancel() {
      cancelled = true;
    },
    async run(steps, onStep) {
      cancelled = false;
      const { view } = editor;
      view.focus();
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        const step = steps[i]!;
        onStep?.(step, i);
        if ('pause' in step) {
          await sleep(step.pause);
          continue;
        }
        if ('say' in step) {
          await sleep(delay);
          continue;
        }
        if ('cursor' in step) {
          view.dispatch({ selection: { anchor: posOf(view, step.cursor[0], step.cursor[1]) } });
        } else if ('select' in step) {
          view.dispatch({
            selection: {
              anchor: posOf(view, step.select[0][0], step.select[0][1]),
              head: posOf(view, step.select[1][0], step.select[1][1]),
            },
          });
        } else if ('type' in step) {
          for (const ch of step.type) {
            if (cancelled) return;
            sendKey(view, { key: ch });
            await sleep(45);
          }
        } else if ('click' in step) {
          editor.zoomToLine(step.line);
        } else if ('zoom' in step) {
          editor.zoomOut();
        } else if ('outline' in step) {
          editor.setOutline(step.outline);
        } else {
          sendKey(view, step);
        }
        await sleep(delay);
      }
    },
  };
}
