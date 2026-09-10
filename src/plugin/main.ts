import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  setIcon,
  type Hotkey,
  type SettingDefinitionItem,
} from 'obsidian';
import type { OutlineDoc } from '../model';
import { parse } from '../parse';
import { indentGroups, moveGroupsDown, moveGroupsUp, outdentGroups } from '../ops';
import { afterState, resolveOperand } from '../operand';
import type { OpOutput } from '../ops';
import type { OpResult } from '../result';
import { applyEdits } from '../result';
import { applyAppearance, clearAppearance } from './appearance';
import {
  DEFAULT_DATA,
  normalizePluginData,
  type GroupHeight,
  type GuideHighlight,
  type GuideIntensity,
  type GuideVisibility,
  type OutlineUnit,
  type LineageSeparator,
  type MarkerHighlight,
  type OverallCap,
  type PluginData,
  type SegmentIcons,
  type SortOrder,
  type StatusBarMode,
} from './mode-registry';

/** The `PluginData` keys the footer reads, so `setFooterSetting` can only be
 * pointed at one of them. */
type FooterSettingKey =
  | 'backlinksSort'
  | 'backlinksOverallCap'
  | 'backlinksGroupHeight'
  | 'backlinksSuppressCore'
  | 'backlinksSegmentIcons'
  | 'backlinksSeparator'
  | 'backlinksGuides';
import { planCaret, type CaretOp } from '../caret-policy';
import { editsToChanges, mapCursorForward, type EditorChange } from './dispatch';
import { REJECTION_MESSAGES } from './messages';
import { compareWithSections, type SectionInfo } from './crosscheck';
import { grammarExtension, setMotionProbe } from './keymap';
import { nestedEditorExtension } from './nested-editor';
import {
  backlinksFooterExtension,
  nudgeFooters,
  pruneFooterViewState,
  repaintFooters,
} from './backlinks-footer';
import { BacklinkIndex } from './backlink-index';
import { BUILD_STAMP } from 'virtual:build-stamp';
import { decorationsExtension, type MarkerVisibility } from './decorations';
import { transactionFilterExtension } from './transaction-filter';
import { viewRegistryExtension } from './view-registry';
import { zoomStateExtension } from './zoom-state';
import { isOutlineMode, outlineStateExtension, outlineToggled } from './outline-state';
import { zoomClickExtension } from './zoom-click';
import { zoomDecorationsExtension } from './zoom-decorations';
import { zoomTrailExtension } from './zoom-trail';
import { zoomViewExtension } from './zoom-view';
import { viewFor } from './view-registry';
import { zoomScope } from './zoom-scope';
import { zoomCleared, zoomTo } from './zoom-state';
import { operandEscapes, parentOf, reresolveZoom, resolveZoom } from '../zoom';
import { toLineRange } from './cm-pos';
import { nodeStartLine } from '../locate';
import { parsedDoc } from './parsed-doc';
import { foldable } from '@codemirror/language';
import { foldChromeTarget, foldRangeAt, foldServiceExtension } from './fold-service';
import { currentFolds } from './fold-ops';
import { foldViewExtension } from './fold-view';
import { foldCarryExtension } from './fold-carry';
import {
  foldGestureAvailable,
  hasAnyFold,
  hasOpenFoldable,
  runFoldAll,
  runFoldGesture,
  runFoldLevel,
} from './fold-commands';
import type { EditorView } from '@codemirror/view';
import { historyCaretExtension } from './history-caret';
import { TransactionStats } from './stats';

const STATUS_BAR_MODE_LABELS: Record<StatusBarMode, string> = {
  none: 'Nothing',
  icon: 'An icon',
  text: 'Words',
};

const MARKER_VISIBILITY_LABELS: Record<MarkerVisibility, string> = {
  all: 'All eligible kinds (status quo)',
  'with-children': 'Only nodes that have children',
  'headings-and-paragraphs': 'Only headings and paragraphs',
};

const OVERALL_CAP_LABELS: Record<OverallCap, string> = {
  '25': '25 references',
  '50': '50 references',
  '100': '100 references',
  none: 'No limit',
};

const GROUP_HEIGHT_LABELS: Record<GroupHeight, string> = {
  compact: 'Compact',
  standard: 'Standard',
  tall: 'Tall',
  unlimited: 'Uncapped',
};

const SEGMENT_ICONS_LABELS: Record<SegmentIcons, string> = {
  all: 'Every ancestor',
  own: 'Only the row’s own marker',
  none: 'No markers',
};

const LINEAGE_SEPARATOR_LABELS: Record<LineageSeparator, string> = {
  none: 'Nothing',
  chevron: 'A chevron',
};

const OUTLINE_UNIT_LABELS: Record<OutlineUnit, string> = {
  auto: 'Auto',
  compact: 'Compact',
  balanced: 'Balanced',
  roomy: 'Roomy',
  wide: 'Wide',
};

const GUIDE_VISIBILITY_LABELS: Record<GuideVisibility, string> = {
  all: 'Every level',
  ancestors: 'The levels the cursor is inside',
  subtree: 'The levels inside the current node',
  off: 'None',
};

const GUIDE_INTENSITY_LABELS: Record<GuideIntensity, string> = {
  subtle: 'Subtle',
  normal: 'Normal',
  strong: 'Strong',
};

const GUIDE_HIGHLIGHT_LABELS: Record<GuideHighlight, string> = {
  off: 'No highlight',
  full: 'Whole guide of every ancestor',
  lineage: 'Only the part leading down to the cursor',
};

const MARKER_HIGHLIGHT_LABELS: Record<MarkerHighlight, string> = {
  off: 'No highlight',
  current: 'The current node only',
  lineage: 'The current node and all its ancestors',
};

/**
 * Note: `indent`/`outdent` also accept an optional trailing
 * `fallbackIndentUnit` (the unit to use for brand-new indentation with no
 * existing evidence in the document — see ops.ts's `destinationIndent`).
 * The command-palette path here can't supply it: Obsidian's public `Editor`/
 * `MarkdownView` API doesn't expose the underlying CM6 `EditorState`, so
 * there's no public-API way to read the live "Indent using tabs" setting
 * (the `@codemirror/language` `indentUnit` facet) from a command callback
 * the way keymap.ts's Tab/Shift-Tab handler and transaction-filter.ts's
 * paste path do. These commands fall back to inferring from the document's
 * own existing indentation, same as before this fix — a known, small gap
 * limited to the command-palette / custom-hotkey entry point.
 */
type StructuralOp = (
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
) => OpResult<OpOutput>;

/**
 * The cursor a palette-invoked structural command should end on: decided by
 * `caret-policy.ts`, the same procedure `grammar.ts` uses for the keyboard
 * path, so the two entry points cannot diverge.
 *
 * This function is now purely an adapter — it converts Obsidian's `{line,
 * ch}` world into the policy's facts and back. It holds no rule of its own;
 * the previous version re-implemented the mapped-with-addressability-fallback
 * rule here, and had already drifted once (the palette missed the
 * addressability guard entirely until review caught it).
 */
function resultCursor(
  lines: readonly string[],
  newLines: readonly string[],
  changes: readonly EditorChange[],
  before: OutlineDoc,
  op: CaretOp,
  anchor: { line: number; ch: number },
  mapFrom?: { line: number; ch: number },
): { line: number; ch: number } {
  const after = parse(newLines.join('\n'));
  const mapped =
    mapFrom === undefined
      ? undefined
      : offsetToPos(newLines, mapCursorForward(lines, changes, mapFrom));
  return planCaret(op, { before, after, anchor, mapped }).caret;
}

/** Flat character offset (as `mapCursorForward` returns) → `{line, ch}`, for
 * Obsidian's public `Editor.setCursor`. */
function offsetToPos(lines: readonly string[], offset: number): { line: number; ch: number } {
  let acc = 0;
  for (let line = 0; line < lines.length; line++) {
    const len = lines[line]?.length ?? 0;
    if (offset <= acc + len) return { line, ch: offset - acc };
    acc += len + 1;
  }
  return { line: Math.max(0, lines.length - 1), ch: lines[lines.length - 1]?.length ?? 0 };
}

const CONFLICTING_PLUGINS = ['obsidian-outliner', 'obsidian-zoom'];

export default class TrueOutlinerPlugin extends Plugin {
  private data: PluginData = { ...DEFAULT_DATA };
  /** Which notes reference which — see backlink-index.ts. */
  readonly backlinks = new BacklinkIndex(this.app);
  /** Public so the e2e harness can read classification evidence the same
   * way it already reads the mode (design.md D8). */
  readonly stats = new TransactionStats();

  /**
   * Per-key keymap-liveness counters, same "public for the harness" rationale
   * as `stats`. Populated only in dev builds (see `showDevBuildStamp`).
   *
   * These exist so e2e can assert the MECHANISM and not only the outcome. A
   * caret can land in the right place without our keymap ever running — the
   * transaction filter corrects native motion after the fact — so an
   * outcome-only test passes identically whether our handler fired or never
   * existed. That blind spot hid a real defect through three rewrites of the
   * Home/End logic (docs/research/04 Q27).
   */
  readonly motionCounts: Record<string, { invoked: number; consumed: number }> = {};

  /**
   * What the fold layer currently believes, in LINE numbers, for the harness.
   *
   * Same "public for the harness" rationale as `stats` and `motionCounts`, with
   * one reason of its own: CM6's fold exports resolve only inside plugin module
   * scope — the renderer's `require` has neither `@codemirror/language` nor
   * `obsidian` — so a spec cannot read a folded range without going through the
   * plugin. Measured while writing docs/research/28, which had to hang a
   * temporary probe on the instance to ask anything at all.
   *
   * Three separate answers, because the change turns on their differences: what
   * the EDITOR calls foldable (which includes lines we deliberately decline,
   * such as a raw HTML block), what WE claim, and where our own fold chrome
   * belongs.
   */
  foldState(): {
    folded: { from: number; to: number }[];
    editorFoldable: { line: number; from: number; to: number }[];
    ourFoldable: { line: number; from: number; to: number }[];
    chromeLines: number[];
  } {
    const view = viewFor(this.app.workspace.getActiveViewOfType(MarkdownView));
    if (!view) return { folded: [], editorFoldable: [], ourFoldable: [], chromeLines: [] };
    const { state } = view;
    const lineOf = (pos: number): number => state.doc.lineAt(pos).number - 1;
    const editorFoldable: { line: number; from: number; to: number }[] = [];
    const ourFoldable: { line: number; from: number; to: number }[] = [];
    const chromeLines: number[] = [];
    for (let n = 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      const editor = foldable(state, line.from, line.to);
      if (editor)
        editorFoldable.push({ line: n - 1, from: lineOf(editor.from), to: lineOf(editor.to) });
      const ours = foldRangeAt(state, n - 1);
      if (ours) ourFoldable.push({ line: n - 1, from: lineOf(ours.from), to: lineOf(ours.to) });
      if (foldChromeTarget(state, n - 1)) chromeLines.push(n - 1);
    }
    return {
      // Sorted: `foldedRanges` iterates a RangeSet, whose order across nested
      // ranges is an implementation detail no assertion should depend on.
      folded: currentFolds(state)
        .map((r) => ({ from: lineOf(r.from), to: lineOf(r.to) }))
        .sort((a, b) => a.from - b.from || a.to - b.to),
      editorFoldable,
      ourFoldable,
      chromeLines,
    };
  }

  /** The stamp compiled into THIS bundle. Public so the dev hot-reload plugin
   * can name the build it just loaded: `manifest.json` is copied verbatim and
   * cached by Obsidian anyway, so it only ever reports the base package
   * version. */
  readonly buildStamp = BUILD_STAMP;

  override async onload(): Promise<void> {
    this.showDevBuildStamp();
    this.data = normalizePluginData(await this.loadData());

    // The appearance settings are published to the document, not built into a
    // decoration: one property write moves the grid in every open pane and in
    // the footer at once (see `appearance.ts`). Registered for cleanup rather
    // than left to an `onunload` override, so the properties go with the
    // plugin whatever else changes here.
    this.publishAppearance();
    this.register(() => clearAppearance(document.body));

    // `checkCallback`, not `editorCheckCallback`: the mode is a property of the
    // TAB, and a tab in reading view has no editor to hand the latter. Offered
    // wherever a markdown file is the active view, in every view mode.
    this.addCommand({
      id: 'toggle-outline-mode',
      name: 'Toggle outline mode',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) this.toggleActiveTab();
        return true;
      },
    });

    this.addStructuralCommand('indent-node', 'Indent node', indentGroups, true);
    this.addStructuralCommand('outdent-node', 'Outdent node', outdentGroups, true, undefined, true);
    // Mod+Shift+Arrow is the dominant move-node convention: obsidian-outliner
    // and obsidian-bullet ship exactly these as command defaults, and Logseq
    // binds mod+shift+up/down on macOS. It collides with no Obsidian core
    // command. See `addStructuralCommand` for why a default hotkey is used at
    // all despite the guideline.
    this.addStructuralCommand('move-node-up', 'Move node up', moveGroupsUp, false, [
      { modifiers: ['Mod', 'Shift'], key: 'ArrowUp' },
    ]);
    this.addStructuralCommand('move-node-down', 'Move node down', moveGroupsDown, false, [
      { modifiers: ['Mod', 'Shift'], key: 'ArrowDown' },
    ]);

    // Folding's three gestures, and the four document-wide ones.
    //
    // Default hotkeys here, unlike zoom's, because the bindings are free and
    // the gesture is one users reach for constantly: measured against Obsidian
    // 1.13.7, no core command claims Mod+Alt+ArrowUp, Mod+Alt+ArrowDown or
    // Mod+Alt+Period. (Mod+Alt+ArrowLeft/Right ARE taken — by back and forward
    // — which is the pair worth remembering about that modifier.) The same
    // deliberate departure from the no-default-hotkeys guideline the move
    // commands document, for the same reason: a gesture nobody can find is not
    // a gesture.
    this.addFoldCommand('fold-node', 'Fold node', (view) => runFoldGesture(view, 'fold'), [
      { modifiers: ['Mod', 'Alt'], key: 'ArrowUp' },
    ]);
    this.addFoldCommand('unfold-node', 'Unfold node', (view) => runFoldGesture(view, 'unfold'), [
      { modifiers: ['Mod', 'Alt'], key: 'ArrowDown' },
    ]);
    this.addFoldCommand('toggle-fold', 'Toggle fold', (view) => runFoldGesture(view, 'toggle'), [
      { modifiers: ['Mod', 'Alt'], key: 'Period' },
    ]);
    // Document-wide, and unbound: these are palette operations, and every
    // remaining modifier combination is worth more to the per-node gestures.
    // `hasAnyFold` gates the two that would otherwise be offered on a document
    // with nothing to act on.
    this.addFoldCommand('fold-all', 'Fold all nodes', (view) => runFoldAll(view, 'fold'), undefined, (view) =>
      hasOpenFoldable(view.state),
    );
    this.addFoldCommand(
      'unfold-all',
      'Unfold all nodes',
      (view) => runFoldAll(view, 'unfold'),
      undefined,
      (view) => hasAnyFold(view.state),
    );
    this.addFoldCommand('fold-more', 'Fold one level more', (view) => runFoldLevel(view, 'more'), undefined, (view) =>
      hasOpenFoldable(view.state),
    );
    this.addFoldCommand(
      'fold-less',
      'Fold one level less',
      (view) => runFoldLevel(view, 'less'),
      undefined,
      (view) => hasAnyFold(view.state),
    );

    // Zoom's three gestures. No default hotkeys: unlike the move commands there
    // is no dominant convention to inherit, and every plausible binding
    // (Mod+Alt+Arrow, Mod+.) is already spoken for by Obsidian core or by a
    // common community plugin. The palette and the context menu are the entry
    // points; a user who wants a key assigns one.
    this.addZoomCommand('zoom-in', 'Zoom in to node', (view) => this.zoomInFrom(view));
    // Available only while zoomed: both are otherwise a no-op, and the
    // palette should not offer "zoom out" when there is nothing to zoom out
    // of. The predicate is `zoomScope` itself, the same read `act` starts
    // with — cheap and side-effect-free, unlike `act`, which is why it is a
    // second function rather than a dry run of the first.
    this.addZoomCommand(
      'zoom-out',
      'Zoom out one level',
      (view) => this.zoomOutFrom(view),
      (view) => zoomScope(view.state) !== null,
    );
    this.addZoomCommand(
      'zoom-clear',
      'Zoom out fully',
      (view) => {
        if (zoomScope(view.state) === null) return false;
        view.dispatch({ effects: zoomCleared.of(null) });
        return true;
      },
      (view) => zoomScope(view.state) !== null,
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        // The index keys sources by path, so a rename is a removal plus an add;
        // leaving the old key would report references from a file that is gone.
        this.backlinks.removeSource(oldPath);
        if (file instanceof TFile) this.backlinks.reindex(file);
        // Defence in depth, not a fix for an observed defect — said plainly
        // because the difference matters to whoever reads this next.
        //
        // Review argued a rename left mounted footers naming a path that no
        // longer exists, since this handler updated the index and stopped.
        // Measured, it does not: a rename changes what every OTHER note's links
        // resolve to, so `metadataCache` re-resolves and the `resolved` handler
        // below rebuilds and repaints. Confirmed by deleting this line and
        // watching the footer still update, through both `fileManager.renameFile`
        // and the raw `vault.rename` that rewrites no links.
        //
        // Kept anyway: that chain runs through an Obsidian event ordering we do
        // not control and do not document, and `changed` and `deleted` both
        // repaint from their own handlers rather than relying on it. One call on
        // a rare event buys this one the same independence.
        repaintFooters();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        this.backlinks.reindex(file);
        repaintFooters();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on('deleted', (file) => {
        this.backlinks.removeSource(file.path);
        repaintFooters();
      }),
    );
    // Everything the incremental paths cannot see.
    //
    // `changed` fires for a SOURCE whose text changed, which misses two real
    // cases: a link that was unresolved becomes resolvable when its target is
    // finally created, and a TARGET is renamed or moved — in both, no source's
    // text need change, so no source is ever reindexed and the reference stays
    // missing or stays filed under a path that no longer exists. `resolved`
    // fires once the cache has finished settling after any of that, which is
    // the one event that covers them all.
    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        this.backlinks.rebuild();
        repaintFooters();
      }),
    );
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, _editor, info) => {
        const path = info.file?.path;
        if (!path || !path.endsWith('.md')) return;
        const view = viewFor(info);
        // The menu names THIS editor's state, not the active tab's: the
        // right-click that opened it is what decides which editor is meant, and
        // in a split it need not be the active one.
        const on = !!view && isOutlineMode(view.state);
        menu.addItem((item) =>
          item
            .setTitle(on ? 'Disable outline mode' : 'Enable outline mode')
            .setIcon('list-tree')
            .onClick(() => {
              if (view) this.setOutlineMode(view, !on);
            }),
        );
        if (!on || !view) return;
        menu.addItem((item) =>
          item
            .setTitle('Zoom in to node')
            .setIcon('search')
            .onClick(() => {
              this.zoomInFrom(view);
            }),
        );
        if (zoomScope(view.state) === null) return;
        menu.addItem((item) =>
          item
            .setTitle('Zoom out fully')
            .setIcon('search')
            .onClick(() => view.dispatch({ effects: zoomCleared.of(null) })),
        );
      }),
    );

    // Must precede the filter and decorations: both ask whether they are
    // running inside a nested per-cell editor, and only a view-level plugin can
    // answer that from the DOM.
    this.registerEditorExtension(nestedEditorExtension());
    // Immediately after the nested-editor gate it consults, and before anything
    // that dispatches: a command needs the view registered before it can reach
    // it (design D5). Holds no state of its own beyond the view it publishes.
    this.registerEditorExtension(viewRegistryExtension());
    // The zoom anchor. A bare StateField, so it can sit anywhere; here, so the
    // extensions that READ the scope are registered after the state that holds
    // it and the reading order matches the dependency.
    this.registerEditorExtension(zoomStateExtension());
    // Before every extension that GATES on the mode, so the field it reads is
    // installed by the time their own `create` runs.
    this.registerEditorExtension(outlineStateExtension(this));
    // After the mode field it gates on, and before the decorations that draw
    // fold chrome from the same answer. Registering it is what makes an outline
    // node foldable at all — Obsidian's own fold command, placeholder and
    // per-file persistence all follow from this one provider
    // (docs/research/28-fold-mechanics.md).
    this.registerEditorExtension(foldServiceExtension());
    // Beside it: the rule that a computed caret never lands in hidden content,
    // and the one that decides what a change does to a fold.
    this.registerEditorExtension(foldViewExtension(this));
    this.registerEditorExtension(foldCarryExtension());
    this.registerEditorExtension(grammarExtension());
    this.registerEditorExtension(decorationsExtension(this));
    this.registerEditorExtension(transactionFilterExtension(this, this.stats));
    // Registered LAST among the decoration producers: it is the only block
    // decoration here, and keeping it last means any interaction with the
    // established layers is attributable to it rather than to ordering.
    this.registerEditorExtension(backlinksFooterExtension(this));
    // Zoom's hiding, after the footer for the same reason the footer is last
    // among the decoration producers: these are the two block-decoration
    // sources, and keeping them adjacent and last makes any interaction with
    // the established layers attributable to them.
    this.registerEditorExtension(zoomDecorationsExtension());
    this.registerEditorExtension(zoomTrailExtension(this));
    this.registerEditorExtension(zoomClickExtension());
    this.registerEditorExtension(zoomViewExtension());
    // A footer's unfolded state belongs to the reading, not to the note: when
    // its tab closes, the state goes with it. `layout-change` is the event that
    // fires for a closed tab; the leaves still open name what to keep.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        const open = new Set<string>();
        this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
          const path = (leaf.view as MarkdownView).file?.path;
          if (path) open.add(path);
        });
        pruneFooterViewState(open);
      }),
    );
    // Re-asserts the cursor of operations that CHOOSE one (move, split, merge,
    // paste, structural delete) so redo restores it — history recomputes a
    // cursor by mapping, which cannot reproduce a choice (history-caret.ts).
    this.registerEditorExtension(historyCaretExtension());

    this.addCommand({
      id: 'print-transaction-stats',
      name: 'Debug: print transaction classification stats',
      callback: () => {
        console.debug(`[true-outliner] transaction stats\n${this.stats.formatSummary()}`);
        new Notice('Transaction classification stats printed to console.', 2000);
      },
    });

    this.addSettingTab(new TrueOutlinerSettingTab(this.app, this));

    this.registerIndicators();

    this.app.workspace.onLayoutReady(() => {
      void this.warnAboutConflicts();
      // Deferred to layout-ready: before it, the metadata cache may still be
      // filling, and an index built from a half-populated cache would be wrong
      // in a way nothing later corrects.
      this.backlinks.rebuild();
      // A footer mounted before this painted its first frame from an empty
      // index, and nothing about building one is a transaction, so without this
      // an already-open note reads "0 references" until an unrelated edit.
      repaintFooters();
    });
  }

  get rememberFolds(): boolean {
    return this.data.rememberFolds;
  }

  async setRememberFolds(value: boolean): Promise<void> {
    this.data.rememberFolds = value;
    await this.saveData(this.data);
    this.app.workspace.updateOptions();
  }

  get outlineByDefault(): boolean {
    return this.data.outlineByDefault;
  }

  /**
   * Persists the default. Deliberately touches no open tab: each holds its own
   * state and `outlineModeField.create` reads this value live, so the next
   * editor state built picks the new value up and every existing one keeps
   * what it has (design D8).
   */
  async setOutlineByDefault(value: boolean): Promise<void> {
    this.data.outlineByDefault = value;
    await this.saveData(this.data);
  }

  get statusBarMode(): StatusBarMode {
    return this.data.statusBarMode;
  }

  async setStatusBarMode(value: StatusBarMode): Promise<void> {
    this.data.statusBarMode = value;
    await this.saveData(this.data);
    // The item is re-rendered rather than re-registered: `addStatusBarItem` has
    // no counterpart, so `none` is the element rendering nothing.
    this.refreshIndicators();
  }

  get debugCrossCheck(): boolean {
    return this.data.debugCrossCheck;
  }

  async setDebugCrossCheck(value: boolean): Promise<void> {
    this.data.debugCrossCheck = value;
    await this.saveData(this.data);
  }

  get backlinksFooter(): boolean {
    return this.data.backlinksFooter;
  }

  /** See `SpikeFooterSource.footerRevision` — bumped whenever a SETTING the
   * footer reads changes, so its StateField gets a real transaction to
   * recompute on (docs/research/19, S2). Outline mode used to be one of those
   * inputs and no longer is: it lives in editor state, so a mode toggle is
   * itself the transaction the footer recomputes on. A setting added later that
   * the footer depends on still has to bump this, or its change is invisible
   * until some unrelated transaction arrives. */
  private footerRev = 0;

  get footerRevision(): number {
    return this.footerRev;
  }

  async setBacklinksFooter(value: boolean): Promise<void> {
    this.data.backlinksFooter = value;
    this.footerRev++;
    await this.saveData(this.data);
    // EVERY open editor, not just the active one. The revision is observed by a
    // per-view ViewPlugin, so a view that receives no transaction never notices
    // it — which left a second split's footer showing a setting that had been
    // turned off.
    nudgeFooters(this.app);
    this.forceRedraw();
  }

  /**
   * One writer for every footer setting, because each of them has to bump the
   * revision AND nudge the open footers. The footer's StateField never sees a
   * transaction of its own, so a setting written without both is invisible
   * until some unrelated edit arrives — which is exactly the failure
   * `footerRevision` documents.
   */
  private async setFooterSetting<K extends FooterSettingKey>(
    key: K,
    value: PluginData[K],
  ): Promise<void> {
    this.data[key] = value;
    this.footerRev++;
    await this.saveData(this.data);
    // Both, because they do different things and a control setting needs the
    // second. `nudgeFooters` wakes the StateField, which decides whether a
    // footer exists at all; but the widget's identity is the NOTE, so an
    // existing footer is `eq` to its replacement and CM6 keeps the mounted DOM
    // without ever calling `toDOM` again. `repaintFooters` is what re-runs
    // `render()` on that DOM, and without it a setting that changes only what
    // the footer draws lands on the next repaint from some other cause.
    nudgeFooters(this.app);
    repaintFooters();
  }

  get backlinksSort(): SortOrder {
    return this.data.backlinksSort;
  }

  async setBacklinksSort(value: SortOrder): Promise<void> {
    await this.setFooterSetting('backlinksSort', value);
  }

  get backlinksOverallCap(): OverallCap {
    return this.data.backlinksOverallCap;
  }

  async setBacklinksOverallCap(value: OverallCap): Promise<void> {
    await this.setFooterSetting('backlinksOverallCap', value);
  }

  get backlinksGroupHeight(): GroupHeight {
    return this.data.backlinksGroupHeight;
  }

  async setBacklinksGroupHeight(value: GroupHeight): Promise<void> {
    await this.setFooterSetting('backlinksGroupHeight', value);
  }

  get backlinksSuppressCore(): boolean {
    return this.data.backlinksSuppressCore;
  }

  async setBacklinksSuppressCore(value: boolean): Promise<void> {
    await this.setFooterSetting('backlinksSuppressCore', value);
  }

  get backlinksSegmentIcons(): SegmentIcons {
    return this.data.backlinksSegmentIcons;
  }

  async setBacklinksSegmentIcons(value: SegmentIcons): Promise<void> {
    await this.setFooterSetting('backlinksSegmentIcons', value);
  }

  get backlinksSeparator(): LineageSeparator {
    return this.data.backlinksSeparator;
  }

  async setBacklinksSeparator(value: LineageSeparator): Promise<void> {
    await this.setFooterSetting('backlinksSeparator', value);
  }

  get backlinksGuides(): boolean {
    return this.data.backlinksGuides;
  }

  async setBacklinksGuides(value: boolean): Promise<void> {
    await this.setFooterSetting('backlinksGuides', value);
  }

  get outlineUnit(): OutlineUnit {
    return this.data.outlineUnit;
  }

  async setOutlineUnit(value: OutlineUnit): Promise<void> {
    this.data.outlineUnit = value;
    await this.saveData(this.data);
    // No redraw: every column on both surfaces is a `var()` away from the
    // property this writes, so the grid moves on the next style recalculation
    // — in every open pane, which `forceRedraw` could not reach.
    this.publishAppearance();
  }

  get guideIntensity(): GuideIntensity {
    return this.data.guideIntensity;
  }

  async setGuideIntensity(value: GuideIntensity): Promise<void> {
    this.data.guideIntensity = value;
    await this.saveData(this.data);
    this.publishAppearance();
  }

  get guideVisibility(): GuideVisibility {
    return this.data.guideVisibility;
  }

  async setGuideVisibility(value: GuideVisibility): Promise<void> {
    this.data.guideVisibility = value;
    await this.saveData(this.data);
    // A visibility change alters which gradient layers are BUILT, which is a
    // decoration rebuild — unlike the appearance settings above. The footer
    // draws no guides at all while the layer is off, so it is repainted too.
    this.footerRev++;
    this.publishAppearance();
    this.forceRedraw();
    nudgeFooters(this.app);
    repaintFooters();
  }

  get guideHideSingleRoot(): boolean {
    return this.data.guideHideSingleRoot;
  }

  async setGuideHideSingleRoot(value: boolean): Promise<void> {
    this.data.guideHideSingleRoot = value;
    await this.saveData(this.data);
    this.forceRedraw();
  }

  /**
   * Write the appearance choices onto the document — see `appearance.ts`.
   *
   * This realm's document is enough, INCLUDING for a pop-out leaf, which runs
   * in a window with a `Document` of its own. Measured rather than assumed,
   * since the decoration layer treats a pop-out as its own realm everywhere it
   * schedules or measures: Obsidian mirrors the main window's `body` inline
   * properties and classes into every pop-out document, live — a property
   * written here after the window opened arrives there too, and resolves in its
   * own layout. Writing each document separately would be a second mechanism
   * for something the platform already does, and `59-appearance-settings`
   * pins the behaviour we are relying on.
   */
  private publishAppearance(): void {
    applyAppearance(this.data, document.body);
  }

  get markerVisibility(): MarkerVisibility {
    return this.data.markerVisibility;
  }

  async setMarkerVisibility(value: MarkerVisibility): Promise<void> {
    this.data.markerVisibility = value;
    await this.saveData(this.data);
    this.forceRedraw();
  }

  get guideHighlight(): GuideHighlight {
    return this.data.guideHighlight;
  }

  async setGuideHighlight(value: GuideHighlight): Promise<void> {
    this.data.guideHighlight = value;
    await this.saveData(this.data);
    this.forceRedraw();
  }

  get markerHighlight(): MarkerHighlight {
    return this.data.markerHighlight;
  }

  async setMarkerHighlight(value: MarkerHighlight): Promise<void> {
    this.data.markerHighlight = value;
    await this.saveData(this.data);
    this.forceRedraw();
  }

  /**
   * Two GENUINELY different decoration outputs in one turn, so a settings
   * change lands even where its own output would be byte-identical.
   *
   * A plain cursor nudge forces `computeDecorations`/`computeMarkers` to
   * recompute, but doesn't reliably reach `MarginCompensation` — a ViewPlugin
   * with no decorations of its own, whose `docViewUpdate` hook only fires when
   * SOME decoration source's output actually differs (CM6's own doc comment:
   * "due to content, decoration, or viewport changes"). For a note containing
   * only widget-replaced atoms (table/callout/hr/html — `computeMarkers`
   * deliberately skips these; `computeDecorations` doesn't read
   * `markerVisibility` at all), changing the setting produces byte-identical
   * StateField output, so CM6 correctly sees no diff and never re-fires
   * `docViewUpdate` — confirmed live: a table-only note's marker visibility
   * silently failed to update until this fix.
   *
   * Flipping the mode field off and immediately back on guarantees the two
   * outputs differ (`Decoration.none` vs. the real thing) regardless of note
   * content, which CM6 always detects — firing `docViewUpdate` twice, the
   * second pass reading the just-saved setting. Two separate dispatches, not
   * one: a single transaction carrying both effects ends on the same value it
   * started from and produces one output, which is the whole thing this
   * defeats. No Notice and no indicator refresh: this is an internal repaint,
   * not a user-visible mode change, which is why it does not go through
   * `setOutlineMode`.
   *
   * `app.workspace.updateOptions()` — Obsidian's public "editor-extension-
   * affecting settings changed" API, and the obvious-looking replacement —
   * was evaluated (hardening 5.3) and FAILS exactly the scenario this hack
   * exists for, so don't swap it back in: its reconfigure transaction does
   * re-run the decoration plugins, but on a note whose decoration output is
   * byte-identical across the setting change (the table-only case above)
   * CM6 correctly sees no decoration diff and never fires
   * `MarginCompensation.docViewUpdate`, so the widget-atom marker silently
   * keeps its stale visibility — confirmed empirically: the marker-
   * visibility e2e tests (52-block-markers-icons.e2e.ts, the table-only
   * 'with-children' case in particular) fail with `updateOptions()` in
   * place of this method and pass with it. obsidian-lapel's use of
   * `updateOptions()` works because lapel swaps its registered extension
   * array entry in place (a genuinely different extension → a real
   * reconfigure diff); our extension instance is unchanged and reads the
   * setting live, so there is no diff for CM6 to see. Those same e2e tests
   * stay as the regression net for this scenario.
   */
  private forceRedraw(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view ? viewFor(view) : undefined;
    if (!cm || !isOutlineMode(cm.state)) return; // nothing rendered to refresh
    cm.dispatch({ effects: outlineToggled.of(false) });
    cm.dispatch({ effects: outlineToggled.of(true) });
  }

  /**
   * The one path every mode change goes through — the command, the editor
   * context menu, the status bar item and the ribbon icon.
   *
   * The dispatch IS the repaint. Every gate and decoration reads the field from
   * the state it already holds, so they all recompute because this transaction
   * moved it; there is no sweep, no cursor nudge and no `forceRedraw` here, and
   * none of the mode's consequences wait on anything. That is what moving the
   * mode into CM6 state bought.
   *
   * Turning OFF clears this view's zoom in the SAME transaction, so the anchor
   * is gone rather than merely ungated (`outline-zoom` exit trigger 3). Left
   * uncleared it would survive the toggle inert — `computeScope` gates on the
   * mode — and revive the moment the mode came back, restoring a zoom the user
   * never asked to keep. This view only: the mode is per view now, so a second
   * pane on the same file keeps both its own mode and its own scope.
   */
  private setOutlineMode(cm: EditorView, on: boolean): void {
    cm.dispatch({
      effects: on ? [outlineToggled.of(true)] : [outlineToggled.of(false), zoomCleared.of(null)],
    });
    // No notice. The mode used to announce itself with one because nothing else
    // said what had happened; the document now visibly changes under a state
    // both indicators are already stating, so a toast on top of that is a third
    // report of the same fact and it interrupts to deliver it.
    this.refreshIndicators();
  }

  /**
   * Flip the ACTIVE tab, from whatever view mode it is in.
   *
   * The direction is read from the tab's own field even in reading view: the
   * leaf keeps its editor across a view-mode switch (docs/research/24), so the
   * state is there to read and the toggle means the same thing in every mode.
   */
  private toggleActiveTab(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;
    const cm = viewFor(view);
    if (!cm) return;
    const on = !isOutlineMode(cm.state);
    if (view.getMode() === 'preview') {
      // OFF from reading view does nothing: nothing is outlined there, so the
      // only thing switching the pane would achieve is a change the user did
      // not ask for.
      if (on) void this.enterOutlineFromReading(view);
      return;
    }
    this.setOutlineMode(cm, on);
  }

  /**
   * Turn the mode on from a pane showing reading view, which renders no outline
   * — so the pane switches to an editing mode as part of the same gesture
   * (design D6).
   *
   * `mode: 'source'` over the state's OWN spread. Measured (docs/research/24):
   * the reading-view state carries the `source` flag the pane was last editing
   * under, so spreading it lands the pane back in its own editing mode —
   * Live Preview or the source editor — rather than in whichever one this code
   * would otherwise have to pick. A pane with no editing history reports
   * `source: false` itself.
   *
   * The mode is then set explicitly rather than left to the field: the pane
   * keeps its editor across the switch, so the field still holds whatever it
   * held — off because the default is off, or off because the user turned this
   * tab off earlier — and an explicit request for the outline wins over both.
   */
  private async enterOutlineFromReading(view: MarkdownView): Promise<void> {
    await view.setState({ ...view.getState(), mode: 'source' }, { history: false });
    // Re-resolved rather than carried across the `await`: the leaf reuses its
    // editor today, and re-asking costs nothing if it ever stops.
    const cm = viewFor(view);
    if (cm) this.setOutlineMode(cm, true);
  }

  /** The status bar item, absent on mobile where there is no status bar. */
  private statusItem: HTMLElement | undefined;
  /** The ribbon icon's element, whose class carries the on-state. */
  private ribbonItem: HTMLElement | undefined;

  /**
   * The two indicator surfaces, both stating the ACTIVE tab's mode and both
   * toggling that tab (design D7).
   *
   * The status bar item is gated on `Platform.isMobile`, because the absence it
   * relies on is not real: `addStatusBarItem` is documented as unavailable on
   * mobile, but measured under Obsidian's own `emulateMobile()` it still
   * returns a live element in the desktop shell's status bar — so leaving it
   * ungated would ship an item onto a platform that has nowhere to put it. The
   * ribbon carries the indication there, which is why it is not gated.
   *
   * Refreshed from `active-leaf-change` and `file-open`, which between them
   * cover every transition that can change the answer — measured
   * (docs/research/24): an in-leaf mode switch fires no public event, and needs
   * none, because it does not change the tab's mode. The remaining way the mode
   * moves is a dispatch through `setOutlineMode`, which refreshes at its own
   * site.
   */
  private registerIndicators(): void {
    const status = Platform.isMobile ? undefined : this.addStatusBarItem();
    if (status) {
      status.addClass('true-outliner-mode-status');
      status.setAttribute('role', 'button');
      // `mod-clickable` and the tab stop are set per render, since the `none`
      // setting has to take both away.
      this.registerDomEvent(status, 'click', () => this.toggleActiveTab());
      // A `div` with `role="button"` and a tab stop is reachable by keyboard
      // and, without this, does nothing when it gets there — the same
      // equivalent the footer's composite rows build for themselves
      // (`backlinks-footer.ts`'s `makeDisclosure`). `preventDefault` because
      // Space would otherwise scroll the page as well.
      this.registerDomEvent(status, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.toggleActiveTab();
      });
      this.statusItem = status;
    }

    // `list-tree`, the same icon the context-menu entry carries, so the two
    // entry points to one gesture look like one gesture.
    this.ribbonItem = this.addRibbonIcon('list-tree', 'Toggle outline mode', () =>
      this.toggleActiveTab(),
    );

    const refresh = (): void => this.refreshIndicators();
    this.registerEvent(this.app.workspace.on('active-leaf-change', refresh));
    this.registerEvent(this.app.workspace.on('file-open', refresh));
    // The first paint: `onload` runs with tabs already open, and no event is
    // coming for a leaf that was already active.
    this.app.workspace.onLayoutReady(() => this.refreshIndicators());
  }

  /**
   * The ACTIVE tab's outline mode, or `undefined` when no markdown tab is
   * active — a graph view, the empty state, or a leaf whose editor has not
   * registered yet.
   *
   * What the indicators state, so the e2e harness can assert the same value the
   * UI shows rather than a parallel one — the same "public for the harness"
   * rationale as `stats` and `motionCounts`, and here it is the surfaces' own
   * source of truth rather than test-only scaffolding.
   */
  activeTabOutlineMode(): boolean | undefined {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view?.file ? viewFor(view) : undefined;
    return cm ? isOutlineMode(cm.state) : undefined;
  }

  /**
   * Restate both indicators from the active tab.
   *
   * `undefined` where no markdown tab is active at all — a graph view, the
   * empty state — which is a third thing to say, not a mode to guess at: the
   * status text goes blank and the ribbon drops its on-state, so neither
   * surface claims a mode nothing is in.
   */
  private refreshIndicators(): void {
    const on = this.activeTabOutlineMode();
    this.renderStatusItem(on);
    this.ribbonItem?.toggleClass('true-outliner-ribbon-on', on === true);
    // Each indicator's state signal is visual — a colour on the ribbon, a glyph
    // in the status bar — which a screen reader cannot see and which their
    // unchanging labels do not say. `aria-pressed` is the one that carries it;
    // REMOVED rather than set to a value when no markdown tab is active,
    // because neither "pressed" nor "not pressed" is true of a control that is
    // stating no mode at all — the third thing the spec says the indicators
    // must be able to say.
    for (const el of [this.ribbonItem, this.statusItem]) {
      if (!el) continue;
      if (on === undefined) el.removeAttribute('aria-pressed');
      else el.setAttribute('aria-pressed', String(on));
    }
  }

  /**
   * The status bar chip, in whichever form the setting asks for.
   *
   * `none` renders nothing rather than unregistering: `addStatusBarItem` has no
   * counterpart, so an empty, hidden element IS the off state. It keeps its
   * label and `aria-pressed` all the same — a user who hid the chip did not ask
   * to be lied to by an element still in the accessibility tree — and is taken
   * out of the tab order, since there is nothing to see or press.
   *
   * `icon` uses the same `list-tree` glyph as the ribbon for ON, and a distinct
   * glyph for OFF rather than the ribbon's colour accent. A tinted chip in the
   * status bar competes with everything else in that bar for attention it does
   * not deserve; two glyphs say the same thing quietly, and `align-left` — flat
   * prose lines against `list-tree`'s branching ones — is the contrast that
   * survives being small and monochrome.
   */
  private renderStatusItem(on: boolean | undefined): void {
    const item = this.statusItem;
    if (!item) return;
    const mode = this.statusBarMode;
    item.toggleClass('true-outliner-mode-status-hidden', mode === 'none');
    item.toggleClass('mod-clickable', mode !== 'none');
    if (mode === 'none') item.removeAttribute('tabindex');
    else item.tabIndex = 0;

    item.empty();
    if (mode === 'text' && on !== undefined) {
      item.setText(on ? 'Outline on' : 'Outline off');
    } else if (mode === 'icon' && on !== undefined) {
      setIcon(item, on ? 'list-tree' : 'align-left');
    }
    item.setAttribute(
      'aria-label',
      on === undefined ? 'Outline mode' : `Outline mode ${on ? 'on' : 'off'} — click to toggle`,
    );
  }

  /**
   * Dev-build-only status bar item: which build is loaded, and what time it
   * loaded. Runs FIRST in onload so it appears even if something later in
   * startup throws.
   *
   * Gated on `BUILD_STAMP.dev`, a constant compiled into the bundle. That flag
   * is OPT-IN via esbuild's `--dev` argument (passed by `dev`, `vault:install`
   * and the e2e runner), so a plain `npm run build:plugin` — what the release
   * pipeline runs, through an external reusable workflow this repo does not
   * control — cannot ship this UI even if someone forgets the flag. Two earlier
   * revisions of this gate are worth not repeating: the manifest version carrying
   * a `+`, which broke once `install-to-vault` copied the manifest verbatim, and
   * an `OBSIDIAN_DEV_BUILD` environment variable, which was replaced by the argv
   * flag because `VAR=1 ...` is POSIX-only.
   *
   * Why persistent rather than a Notice: a toast that vanishes after 1.5s
   * cannot answer "is the code I just built actually running?" — you have to
   * be looking at the right moment, and if you miss it you cannot tell a
   * successful reload from one that never happened. This sits in the status
   * bar indefinitely and states the loaded build's own timestamp, so the
   * question is answerable at any time and by looking, not by remembering.
   * That distinction cost real debugging time: three consecutive
   * behavior changes were reported as "nothing changed", and neither of us
   * could confirm from the app which build was live (docs/research/04 Q27).
   */
  private showDevBuildStamp(): void {
    if (!BUILD_STAMP.dev) return; // release build (production, no --dev): no dev UI

    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const loadedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const base = `⟳ ${loadedAt} · ${BUILD_STAMP.buildId} (built ${BUILD_STAMP.clock})`;

    const item = this.addStatusBarItem();
    item.addClass('true-outliner-dev-stamp');
    item.setText(base);
    item.setAttribute(
      'aria-label',
      `True Outliner\nloaded ${loadedAt} · built ${BUILD_STAMP.clock} · ${BUILD_STAMP.buildId}\n${BUILD_STAMP.subject}\nchanged: ${BUILD_STAMP.changedSummary}`,
    );

    // Live keymap readout: does CM6 actually route each bound key to this
    // plugin's keymap, and do we consume it? Shown rather than assumed because
    // "our handler ran and computed the wrong target" and "our handler was
    // never invoked" look identical from outside — both are just wrong caret
    // behavior. A key absent from this readout was never routed here at all,
    // which is what Home turned out to be (docs/research/04 Q27).
    setMotionProbe((key, consumed) => {
      const tally = this.motionCounts[key] ?? { invoked: 0, consumed: 0 };
      tally.invoked += 1;
      if (consumed) tally.consumed += 1;
      this.motionCounts[key] = tally;
      const summary = Object.entries(this.motionCounts)
        .map(([k, t]) => `${k} ${t.consumed}/${t.invoked}`)
        .join(' ');
      item.setText(`${base} · ${summary}`);
    });
    this.register(() => setMotionProbe(undefined));
  }

  /**
   * `hotkeys` is normally discouraged — `obsidianmd/commands/no-default-hotkeys`
   * warns that defaults "might conflict with other hotkeys the user has already
   * set". It is a recommendation, not a submission requirement (the guidelines
   * page calls its contents recommendations; `hotkeys?: Hotkey[]` is `@public`
   * and not deprecated; a user's own binding always wins). We accept the warning
   * for move up/down because the alternative we shipped before was strictly
   * worse: a hardcoded CM6 keymap entry, which claims the key just as hard while
   * being invisible in Settings > Hotkeys and impossible for a user to rebind or
   * remove. A default hotkey is the version of this the user can actually undo.
   */
  /**
   * A zoom command: outline-mode-gated, and routed to the live `EditorView`
   * through the registry (`outline-zoom` design D5) — which is also where the
   * mode itself is read from.
   *
   * `editorCheckCallback` rather than `editorCallback`, so the command is
   * absent from the palette outside outline mode instead of present and inert —
   * matching `toggle-outline-mode` and the structural commands. `available`
   * is what makes CHECKING answer honestly: it has to be side-effect-free,
   * since checking runs on every palette keystroke, so it is a SEPARATE
   * argument from `act` rather than a dry-run of it — `act` dispatches.
   * Defaulted to always-available for zoom-in, which is always meaningful in
   * outline mode; a caret in the preamble is a documented no-op (design D6),
   * not a case this hides.
   */
  /**
   * A fold command: outline-mode-gated and routed to the live `EditorView`,
   * the same shape `addZoomCommand` uses and for the same reasons — the mode
   * lives in editor state, and `checking` must not dispatch.
   *
   * Folding needs no `Notice` on refusal. Every other command here can fail for
   * a reason the user cannot see (an operand that would leave the zoom scope, a
   * move with nowhere to go); a fold that finds nothing to fold is a node
   * without children, which the absence of any chevron beside it already says.
   */
  private addFoldCommand(
    id: string,
    name: string,
    act: (view: EditorView) => boolean,
    hotkeys?: Hotkey[],
    available: (view: EditorView) => boolean = (view) => foldGestureAvailable(view.state),
  ): void {
    this.addCommand({
      id,
      name,
      ...(hotkeys ? { hotkeys } : {}),
      editorCheckCallback: (checking, editor, ctx) => {
        const view = viewFor(ctx);
        if (!view || !isOutlineMode(view.state)) return false;
        // Multi-cursor declines, matching the structural commands: acting would
        // silently pick one range out of several.
        if (editor.listSelections().length !== 1) return false;
        if (checking) return available(view);
        return act(view);
      },
    });
  }

  private addZoomCommand(
    id: string,
    name: string,
    act: (view: EditorView) => boolean,
    available: (view: EditorView) => boolean = () => true,
  ): void {
    this.addCommand({
      id,
      name,
      editorCheckCallback: (checking, _editor, ctx) => {
        const view = viewFor(ctx);
        if (!view || !isOutlineMode(view.state)) return false;
        if (checking) return available(view);
        return act(view);
      },
    });
  }

  /**
   * Zoom to the node the selection's ANCHOR resolves to, collapsing a non-empty
   * selection onto that anchor.
   *
   * The anchor and not the head, for the reason `selection-structural-ops` gives
   * for operands: a cover's head is whichever end the gesture grew from, so
   * reading it would zoom somewhere different depending on which direction the
   * user selected in. Collapsing rather than clamping, because a range spanning
   * siblings has ends outside the new scope and pulling them inward produces a
   * selection the user never made while a zoom gesture was all they asked for.
   */
  private zoomInFrom(view: EditorView): boolean {
    const { doc } = parsedDoc(view.state.doc);
    const main = view.state.selection.main;
    const anchorLine = view.state.doc.lineAt(main.anchor).number - 1;

    // For a non-empty selection the target is the FIRST covered root in
    // document order, read through `selection-structural-ops`' own operand
    // resolution. Not the anchor and not the head: both are direction-dependent,
    // so the same two nodes selected upward and downward would zoom to
    // different places — the exact defect that capability exists to remove,
    // reintroduced one gesture later. An empty selection resolves to the
    // caret's own node, unchanged.
    let line = anchorLine;
    if (!main.empty) {
      const operand = resolveOperand(doc, toLineRange(view.state.doc, main));
      const firstRoot = operand?.groups[0]?.[0];
      if (firstRoot !== undefined) {
        const at = nodeStartLine(doc, firstRoot);
        if (at >= 0) line = at;
      }
    }

    const scope = resolveZoom(doc, line);
    if (!scope) return false; // the preamble, or a document with no nodes
    const rootStart = view.state.doc.line(scope.startLine + 1).from;
    view.dispatch({
      effects: zoomTo.of(rootStart),
      // A non-empty selection collapses, because its ends lie outside the scope
      // the gesture is creating. Onto the new root's own start rather than onto
      // either end of the old selection — the only position guaranteed to be
      // inside the new scope whichever way the selection was drawn. An empty
      // selection is left exactly where it was.
      ...(main.empty ? {} : { selection: { anchor: rootStart } }),
    });
    return true;
  }

  /** One level out: the root's parent becomes the root, and a top-level root
   * clears the zoom — so the gesture always has an effect while zoomed. */
  private zoomOutFrom(view: EditorView): boolean {
    const scope = zoomScope(view.state);
    if (!scope) return false;
    const parent = parentOf(scope);
    if (!parent) {
      view.dispatch({ effects: zoomCleared.of(null) });
      return true;
    }
    const { doc } = parsedDoc(view.state.doc);
    const line = nodeStartLine(doc, parent.id);
    if (line < 0) return false;
    view.dispatch({ effects: zoomTo.of(view.state.doc.line(line + 1).from) });
    return true;
  }

  private addStructuralCommand(
    id: string,
    name: string,
    op: StructuralOp,
    useMappedCursor = false,
    hotkeys?: Hotkey[],
    /** Outdent is the one operation whose result can leave a zoom scope from a
     * node that is not the root itself, so the guard has to be told. */
    isOutdent = false,
  ): void {
    this.addCommand({
      id,
      name,
      ...(hotkeys ? { hotkeys } : {}),
      editorCheckCallback: (checking, editor, ctx) => {
        // Through the view registry, which is the only public route to the
        // state the mode now lives in — and side-effect-free, as `checking`
        // requires (design D3).
        const cm = viewFor(ctx);
        if (!cm || !isOutlineMode(cm.state)) return false;
        // Multi-cursor: unavailable, matching the keymap's own decline
        // (`selection-structural-ops`). Acting would silently discard every
        // range but one, and the two entry points must answer alike.
        if (editor.listSelections().length !== 1) return false;
        if (!checking) this.runOp(editor, ctx, op, useMappedCursor, isOutdent);
        return true;
      },
    });
  }

  /**
   * `useMappedCursor` true for indent/outdent (`minimal-change-dispatch`):
   * the pre-op cursor, mapped forward through the (minimal) change set with
   * assoc=1, rather than the op's own semantic cursor choice — see
   * `dispatch.ts`'s `mapCursorForward` for why assoc=1 specifically (it's
   * what keeps a live dispatch and its eventual redo in agreement).
   */
  private runOp(
    editor: Editor,
    ctx: MarkdownView | MarkdownFileInfo,
    op: StructuralOp,
    useMappedCursor = false,
    isOutdent = false,
  ): void {
    // Fresh-tree guarantee: always parse the current buffer at invocation.
    const text = editor.getValue();
    const doc = parse(text);
    if (this.data.debugCrossCheck && ctx.file) this.crossCheck(doc, ctx.file);

    // The operand comes from the SELECTION, through the same rule the keyboard
    // path uses (`selection-structural-ops`). Reading only `getCursor()` is
    // what made a command act on one node out of a visible multi-node
    // selection — and on which one depended on the selection's orientation.
    const selection = editor.listSelections()[0];
    const range = selection
      ? { anchor: selection.anchor, head: selection.head }
      : { anchor: editor.getCursor(), head: editor.getCursor() };
    const cursorBefore = range.head;
    // Orientation is preserved so a run built by extending upward keeps growing
    // upward on the next Shift+ArrowUp rather than reversing under the user.
    const backward =
      range.head.line < range.anchor.line ||
      (range.head.line === range.anchor.line && range.head.ch < range.anchor.ch);
    const operand = resolveOperand(doc, range);
    if (!operand) {
      new Notice(REJECTION_MESSAGES['node-not-found'], 1500);
      return;
    }
    // `outline-zoom` D8: refuse an operand that would leave the scope, before the
    // algebra runs. Checked here and in `grammar.ts` against the SAME predicate,
    // so the two entry points cannot disagree about it — the divergence
    // `selection-structural-ops` exists to prevent.
    const view = viewFor(ctx);
    const scope = view ? zoomScope(view.state) : null;
    // Re-resolved against `doc`, the fresh parse this command just made —
    // `scope` was built from the live editor's own cached parse, a DIFFERENT
    // parse object even when the text agrees, and `parse()` allocates every
    // node a new id regardless of content. Comparing `scope`'s ids against
    // `operand.groups`' below without this re-derivation would never match
    // anything, silently letting every palette operation on the zoom root or
    // its direct children through (`reresolveZoom`'s own comment says why).
    const localScope = scope ? reresolveZoom(doc, scope) : null;
    if (localScope && operandEscapes(localScope, operand.groups, isOutdent)) {
      new Notice(REJECTION_MESSAGES['would-leave-zoom-scope'], 1500);
      return;
    }
    const result = op(doc, operand.groups);
    if (!result.ok) {
      new Notice(REJECTION_MESSAGES[result.rejection.reason], 1500);
      return;
    }
    const lines = text === '' ? [] : text.split('\n');
    const changes = editsToChanges(lines, result.value.edits);
    const newLines = applyEdits(lines, result.value.edits);
    const cursor = resultCursor(
      lines,
      newLines,
      changes,
      doc,
      useMappedCursor ? { kind: 'derived' } : { kind: 'subject' },
      result.value.anchor,
      useMappedCursor ? cursorBefore : undefined,
    );

    // The change and the caret that belongs to it go in ONE transaction. A
    // caret computed from the NEW document is meaningless to anything that has
    // not seen the change yet, and the editor is full of things that watch:
    // measured, Obsidian's live table widget still holds its PRE-change offsets
    // when a selection-only transaction arrives between the two, decides the
    // caret landed inside its last row, and calls `editTableCell` — which
    // focuses a nested cell editor and reports that focus back as the host
    // selection. Moving a paragraph past a table left the caret in the table.
    // The keyboard path never had this because it always dispatched both at
    // once (`keymap.ts`); this is the command path catching up.
    //
    // The trailing `setCursor` is NOT how the caret gets set — it re-asserts
    // the position it already has, to keep undo granularity. `Editor.transaction`
    // dispatches with no `userEvent`, and CM6's `HistoryState.addChanges` joins
    // a new change into the previous event when (among other things)
    // `!userEvent` and the previous event has no `selectionsAfter`. Two palette
    // commands back-to-back — indent then outdent — are adjacent and inside
    // `newGroupDelay`, so with nothing between them they merge into ONE undo
    // step and a single Cmd+Z reverts both. A selection-only transaction
    // populates the preceding event's `selectionsAfter`, which blocks the join.
    // The keyboard path needs no such trick because its `input.structure.*`
    // userEvent already fails CM6's `joinableUserEvent` test. Guarded by a unit
    // test on that CM6 behaviour in tests/minimal-change-history.test.ts and by
    // 20-structural-commands' "one undo step each way".
    // A selection that WAS a block cover survives the operation as the cover of
    // the nodes that moved; anything else lands a caret, exactly as before.
    const planned = afterState(result.value, operand.wasCover, cursor);
    const after =
      backward && planned.to ? { from: planned.to, to: planned.from } : planned;
    if (changes.length > 0) editor.transaction({ changes, selection: after });
    if (after.to) editor.setSelection(after.from, after.to);
    else editor.setCursor(after.from);
  }

  private crossCheck(doc: OutlineDoc, file: TFile): void {
    const sections = this.app.metadataCache.getFileCache(file)?.sections;
    if (!sections) return;
    const mapped: SectionInfo[] = sections.map((section) => ({
      type: section.type,
      startLine: section.position.start.line,
      endLine: section.position.end.line,
    }));
    const issues = compareWithSections(doc, mapped);
    if (issues.length > 0) {
      console.warn(
        `[true-outliner] parse disagreement in ${file.path} — candidate corpus fixture:`,
        issues,
      );
    }
  }

  private async warnAboutConflicts(): Promise<void> {
    if (this.data.coexistenceWarned) return;
    const configPath = `${this.app.vault.configDir}/community-plugins.json`;
    let enabled: string[] = [];
    try {
      enabled = JSON.parse(await this.app.vault.adapter.read(configPath)) as string[];
    } catch {
      return; // no community plugins file — nothing to warn about
    }
    const conflicts = CONFLICTING_PLUGINS.filter((id) => enabled.includes(id));
    if (conflicts.length === 0) return;
    new Notice(
      `True Outliner: ${conflicts.join(' and ')} ${conflicts.length > 1 ? 'are' : 'is'} enabled — ` +
        'overlapping outliner behavior and keybindings may conflict.',
      8000,
    );
    this.data.coexistenceWarned = true;
    await this.saveData(this.data);
  }
}

const SETTING_OUTLINE_BY_DEFAULT = {
  name: 'Open new tabs in outline mode',
  desc: 'Whether a note opens outlined or as stock Obsidian. Applies to notes opened from now on \u2014 in a new tab, or in an existing tab that switches to another note. It never retoggles a tab that is already open, the way Obsidian\u2019s own default view mode works. Toggle a single tab from the command palette (\u201cToggle outline mode\u201d), the editor right-click menu, the ribbon icon, or the status bar item.',
} as const;

const SETTING_STATUS_BAR_MODE = {
  name: 'Show outline mode in the status bar',
  desc: 'What the status bar shows for the active tab, and whether it shows anything at all. Obsidian can hide the ribbon icon from its own right-click menu but offers no equivalent for a plugin\u2019s status bar item, so this is where that chip is turned off. Desktop only \u2014 there is no status bar on mobile.',
} as const;

const SETTING_REMEMBER_FOLDS = {
  name: 'Remember folds',
  desc: 'Whether a note reopens with the nodes you left folded. Fold state lives in Obsidian\u2019s own workspace data, never in the note \u2014 a file is byte-identical whether its nodes are folded or not, and always readable without this plugin. Turn this off to have every note open fully expanded.',
} as const;

const SETTING_DEBUG_CROSSCHECK = {
  name: 'Debug: cross-check parser against metadata cache',
  desc: 'Logs disagreements between the plugin parser and Obsidian metadata to the developer console when a structural command runs.',
} as const;

const SETTING_BACKLINKS_FOOTER = {
  name: 'Show structured backlinks below notes',
  desc: 'Renders every reference to the open note beneath it, each in the tree of the note it came from. Outline mode only.',
} as const;

const SETTING_BACKLINKS_OVERALL_CAP = {
  name: 'Backlinks: how many references to show',
  desc: 'An upper bound on the whole footer. Notes are added whole and in order until the next one would cross it, so a note past the bound is never read. The header always reports the true total.',
} as const;

const SETTING_BACKLINKS_GROUP_HEIGHT = {
  name: 'Backlinks: how tall one note’s references may be',
  desc: 'How much of the screen a single referencing note may take before the rest is folded away behind a control. A height rather than a number of references, because a reference’s height depends on how its content wraps.',
} as const;

const SETTING_BACKLINKS_SUPPRESS_CORE = {
  name: 'Backlinks: hide Obsidian’s own in-document section',
  desc: 'Hides Obsidian’s in-document backlinks section entirely in notes where this plugin renders its own — including unlinked mentions, which this plugin does not reproduce and has no way to hide selectively. Obsidian’s own Backlinks pane still shows both, unaffected. Presentational only: no other plugin’s settings are read or changed, and turning this off restores the section immediately.',
} as const;

const SETTING_BACKLINKS_SEGMENT_ICONS = {
  name: 'Backlinks: markers on a lineage row',
  desc: 'A lineage row names every ancestor between the source note and the reference. This chooses how many of them carry their own marker icon.',
} as const;

const SETTING_BACKLINKS_SEPARATOR = {
  name: 'Backlinks: what separates ancestors',
  desc: 'What stands between two ancestors named on the same lineage row.',
} as const;

const SETTING_BACKLINKS_GUIDES = {
  name: 'Backlinks: draw guide lines in the footer',
  desc: 'Draws the same indentation guides the editor uses down the footer’s own rows.',
} as const;

const SETTING_OUTLINE_UNIT = {
  name: 'Outline width',
  desc: 'How far one level of the outline steps to the right — in the editor and in the backlinks footer alike. “Auto” takes a narrower step on a phone or tablet, where the width is worth more, and a roomier one on a desktop. Every step keeps a child’s marker clear of its parent’s text; a CSS snippet setting --to-decor-unit still overrides whatever is chosen here.',
} as const;

const SETTING_GUIDE_VISIBILITY = {
  name: 'Which indentation guides to draw',
  desc: 'The vertical lines that connect a node to the levels above it. The two middle choices follow the cursor: the route down to the node it is in, or the ladder inside that node. Obsidian’s own indent guides stay hidden in outline mode whichever is chosen — they sit on columns this grid does not use.',
} as const;

const SETTING_GUIDE_SINGLE_ROOT = {
  name: 'Hide the outermost guide under a single root',
  desc: 'Where a whole note hangs off one top-level node — a single “# Title”, or any zoomed-in view — that node’s guide runs down every line while telling the reader nothing. This drops it and keeps every deeper level. Nothing moves: guides are painted, not laid out.',
} as const;

const SETTING_GUIDE_INTENSITY = {
  name: 'Guide line strength',
  desc: 'How strongly a guide stands out, as a proportion of the theme’s own faintest text — so it stays right in a light theme and a dark one. A snippet can change the colour, and the line’s weight, itself.',
} as const;

const SETTING_MARKER_VISIBILITY = {
  name: 'Debug: block marker visibility (experiment 5a)',
  desc: 'Which nodes get a block marker icon at all. Most leaf atom kinds (code, table, callout, quote, HTML, hr) already carry their own native visual style, so a marker may only be worth showing on branch nodes. Takes effect on the next edit or note switch.',
} as const;

const SETTING_GUIDE_HIGHLIGHT = {
  name: 'Highlight guides at the cursor’s position',
  desc: 'Which indentation guides to accent for the node the cursor is in. “Whole guide” accents each ancestor’s guide along its full length — everything the cursor is inside of. “Only the part leading down to the cursor” accents just the stretch of each guide between that ancestor and the next level, so the accent traces the route to the cursor instead.',
} as const;

const SETTING_MARKER_HIGHLIGHT = {
  name: 'Highlight markers at the cursor’s position',
  desc: 'Which block markers — or a list item’s native bullet or number — to accent. “The current node only” marks where the cursor is; adding the ancestors makes each level of the lineage visible, which is the only indication available inside a plain list, where there are no guides to accent.',
} as const;

class TrueOutlinerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TrueOutlinerPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * Declarative settings (Obsidian 1.13+, hardening 5.5): the settings
   * render from these definitions and become discoverable via Obsidian's
   * settings search. `display()` below is kept ONLY as the documented
   * fallback for pre-1.13 Obsidian (`minAppVersion` is older, and the e2e
   * harness's pinned runtime still exercises it) — on 1.13+ it is never
   * called once this returns a non-empty array. Keep the two in sync.
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        ...SETTING_OUTLINE_BY_DEFAULT,
        control: {
          type: 'toggle',
          key: 'outlineByDefault',
          defaultValue: DEFAULT_DATA.outlineByDefault,
        },
      },
      {
        ...SETTING_STATUS_BAR_MODE,
        control: {
          type: 'dropdown',
          key: 'statusBarMode',
          options: STATUS_BAR_MODE_LABELS,
          defaultValue: DEFAULT_DATA.statusBarMode,
        },
      },
      {
        ...SETTING_REMEMBER_FOLDS,
        control: {
          type: 'toggle',
          key: 'rememberFolds',
          defaultValue: DEFAULT_DATA.rememberFolds,
        },
      },
      {
        ...SETTING_DEBUG_CROSSCHECK,
        control: { type: 'toggle', key: 'debugCrossCheck', defaultValue: false },
      },
      {
        ...SETTING_BACKLINKS_FOOTER,
        control: { type: 'toggle', key: 'backlinksFooter', defaultValue: true },
      },
      {
        ...SETTING_BACKLINKS_OVERALL_CAP,
        control: {
          type: 'dropdown',
          key: 'backlinksOverallCap',
          options: OVERALL_CAP_LABELS,
          defaultValue: DEFAULT_DATA.backlinksOverallCap,
        },
      },
      {
        ...SETTING_BACKLINKS_GROUP_HEIGHT,
        control: {
          type: 'dropdown',
          key: 'backlinksGroupHeight',
          options: GROUP_HEIGHT_LABELS,
          defaultValue: DEFAULT_DATA.backlinksGroupHeight,
        },
      },
      {
        ...SETTING_BACKLINKS_SUPPRESS_CORE,
        control: {
          type: 'toggle',
          key: 'backlinksSuppressCore',
          defaultValue: DEFAULT_DATA.backlinksSuppressCore,
        },
      },
      {
        ...SETTING_BACKLINKS_SEGMENT_ICONS,
        control: {
          type: 'dropdown',
          key: 'backlinksSegmentIcons',
          options: SEGMENT_ICONS_LABELS,
          defaultValue: DEFAULT_DATA.backlinksSegmentIcons,
        },
      },
      {
        ...SETTING_BACKLINKS_SEPARATOR,
        control: {
          type: 'dropdown',
          key: 'backlinksSeparator',
          options: LINEAGE_SEPARATOR_LABELS,
          defaultValue: DEFAULT_DATA.backlinksSeparator,
        },
      },
      {
        ...SETTING_BACKLINKS_GUIDES,
        control: {
          type: 'toggle',
          key: 'backlinksGuides',
          defaultValue: DEFAULT_DATA.backlinksGuides,
        },
      },
      {
        ...SETTING_OUTLINE_UNIT,
        control: {
          type: 'dropdown',
          key: 'outlineUnit',
          options: OUTLINE_UNIT_LABELS,
          defaultValue: DEFAULT_DATA.outlineUnit,
        },
      },
      {
        ...SETTING_GUIDE_VISIBILITY,
        control: {
          type: 'dropdown',
          key: 'guideVisibility',
          options: GUIDE_VISIBILITY_LABELS,
          defaultValue: DEFAULT_DATA.guideVisibility,
        },
      },
      {
        ...SETTING_GUIDE_SINGLE_ROOT,
        control: {
          type: 'toggle',
          key: 'guideHideSingleRoot',
          defaultValue: DEFAULT_DATA.guideHideSingleRoot,
        },
      },
      {
        ...SETTING_GUIDE_INTENSITY,
        control: {
          type: 'dropdown',
          key: 'guideIntensity',
          options: GUIDE_INTENSITY_LABELS,
          defaultValue: DEFAULT_DATA.guideIntensity,
        },
      },
      {
        ...SETTING_MARKER_VISIBILITY,
        control: {
          type: 'dropdown',
          key: 'markerVisibility',
          options: MARKER_VISIBILITY_LABELS,
          defaultValue: 'all',
        },
      },
      {
        ...SETTING_GUIDE_HIGHLIGHT,
        control: {
          type: 'dropdown',
          key: 'guideHighlight',
          options: GUIDE_HIGHLIGHT_LABELS,
          defaultValue: 'full',
        },
      },
      {
        ...SETTING_MARKER_HIGHLIGHT,
        control: {
          type: 'dropdown',
          key: 'markerHighlight',
          options: MARKER_HIGHLIGHT_LABELS,
          defaultValue: 'current',
        },
      },
    ];
  }

  /** This plugin doesn't use the conventional `this.plugin.settings` shape
   * the base implementation reads, so both value hooks are overridden to go
   * through the plugin's own accessors (which also own persistence and the
   * decoration refresh on change). */
  override getControlValue(key: string): unknown {
    switch (key) {
      case 'outlineByDefault':
        return this.plugin.outlineByDefault;
      case 'statusBarMode':
        return this.plugin.statusBarMode;
      case 'rememberFolds':
        return this.plugin.rememberFolds;
      case 'debugCrossCheck':
        return this.plugin.debugCrossCheck;
      case 'backlinksFooter':
        return this.plugin.backlinksFooter;
      case 'backlinksOverallCap':
        return this.plugin.backlinksOverallCap;
      case 'backlinksGroupHeight':
        return this.plugin.backlinksGroupHeight;
      case 'backlinksSuppressCore':
        return this.plugin.backlinksSuppressCore;
      case 'backlinksSegmentIcons':
        return this.plugin.backlinksSegmentIcons;
      case 'backlinksSeparator':
        return this.plugin.backlinksSeparator;
      case 'backlinksGuides':
        return this.plugin.backlinksGuides;
      case 'outlineUnit':
        return this.plugin.outlineUnit;
      case 'guideVisibility':
        return this.plugin.guideVisibility;
      case 'guideHideSingleRoot':
        return this.plugin.guideHideSingleRoot;
      case 'guideIntensity':
        return this.plugin.guideIntensity;
      case 'markerVisibility':
        return this.plugin.markerVisibility;
      case 'guideHighlight':
        return this.plugin.guideHighlight;
      case 'markerHighlight':
        return this.plugin.markerHighlight;
      default:
        return undefined;
    }
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case 'outlineByDefault':
        await this.plugin.setOutlineByDefault(Boolean(value));
        break;
      case 'statusBarMode':
        await this.plugin.setStatusBarMode(value as StatusBarMode);
        break;
      case 'rememberFolds':
        await this.plugin.setRememberFolds(Boolean(value));
        break;
      case 'debugCrossCheck':
        await this.plugin.setDebugCrossCheck(Boolean(value));
        break;
      case 'backlinksFooter':
        await this.plugin.setBacklinksFooter(Boolean(value));
        break;
      case 'backlinksOverallCap':
        await this.plugin.setBacklinksOverallCap(value as OverallCap);
        break;
      case 'backlinksGroupHeight':
        await this.plugin.setBacklinksGroupHeight(value as GroupHeight);
        break;
      case 'backlinksSuppressCore':
        await this.plugin.setBacklinksSuppressCore(Boolean(value));
        break;
      case 'backlinksSegmentIcons':
        await this.plugin.setBacklinksSegmentIcons(value as SegmentIcons);
        break;
      case 'backlinksSeparator':
        await this.plugin.setBacklinksSeparator(value as LineageSeparator);
        break;
      case 'backlinksGuides':
        await this.plugin.setBacklinksGuides(Boolean(value));
        break;
      case 'outlineUnit':
        await this.plugin.setOutlineUnit(value as OutlineUnit);
        break;
      case 'guideVisibility':
        await this.plugin.setGuideVisibility(value as GuideVisibility);
        break;
      case 'guideHideSingleRoot':
        await this.plugin.setGuideHideSingleRoot(Boolean(value));
        break;
      case 'guideIntensity':
        await this.plugin.setGuideIntensity(value as GuideIntensity);
        break;
      case 'markerVisibility':
        await this.plugin.setMarkerVisibility(value as MarkerVisibility);
        break;
      case 'guideHighlight':
        await this.plugin.setGuideHighlight(value as GuideHighlight);
        break;
      case 'markerHighlight':
        await this.plugin.setMarkerHighlight(value as MarkerHighlight);
        break;
    }
  }

  /** Pre-1.13 fallback only — see getSettingDefinitions() above. */
  override display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName(SETTING_OUTLINE_BY_DEFAULT.name)
      .setDesc(SETTING_OUTLINE_BY_DEFAULT.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.outlineByDefault)
          .onChange((value) => void this.plugin.setOutlineByDefault(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_STATUS_BAR_MODE.name)
      .setDesc(SETTING_STATUS_BAR_MODE.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(STATUS_BAR_MODE_LABELS)
          .setValue(this.plugin.statusBarMode)
          .onChange((value) => void this.plugin.setStatusBarMode(value as StatusBarMode)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_REMEMBER_FOLDS.name)
      .setDesc(SETTING_REMEMBER_FOLDS.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.rememberFolds)
          .onChange((value) => void this.plugin.setRememberFolds(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_DEBUG_CROSSCHECK.name)
      .setDesc(SETTING_DEBUG_CROSSCHECK.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.debugCrossCheck)
          .onChange((value) => void this.plugin.setDebugCrossCheck(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_FOOTER.name)
      .setDesc(SETTING_BACKLINKS_FOOTER.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.backlinksFooter)
          .onChange((value) => void this.plugin.setBacklinksFooter(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_OVERALL_CAP.name)
      .setDesc(SETTING_BACKLINKS_OVERALL_CAP.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(OVERALL_CAP_LABELS)
          .setValue(this.plugin.backlinksOverallCap)
          .onChange((value) => void this.plugin.setBacklinksOverallCap(value as OverallCap)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_GROUP_HEIGHT.name)
      .setDesc(SETTING_BACKLINKS_GROUP_HEIGHT.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(GROUP_HEIGHT_LABELS)
          .setValue(this.plugin.backlinksGroupHeight)
          .onChange((value) => void this.plugin.setBacklinksGroupHeight(value as GroupHeight)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_SUPPRESS_CORE.name)
      .setDesc(SETTING_BACKLINKS_SUPPRESS_CORE.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.backlinksSuppressCore)
          .onChange((value) => void this.plugin.setBacklinksSuppressCore(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_SEGMENT_ICONS.name)
      .setDesc(SETTING_BACKLINKS_SEGMENT_ICONS.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(SEGMENT_ICONS_LABELS)
          .setValue(this.plugin.backlinksSegmentIcons)
          .onChange((value) => void this.plugin.setBacklinksSegmentIcons(value as SegmentIcons)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_SEPARATOR.name)
      .setDesc(SETTING_BACKLINKS_SEPARATOR.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(LINEAGE_SEPARATOR_LABELS)
          .setValue(this.plugin.backlinksSeparator)
          .onChange((value) => void this.plugin.setBacklinksSeparator(value as LineageSeparator)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_BACKLINKS_GUIDES.name)
      .setDesc(SETTING_BACKLINKS_GUIDES.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.backlinksGuides)
          .onChange((value) => void this.plugin.setBacklinksGuides(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_OUTLINE_UNIT.name)
      .setDesc(SETTING_OUTLINE_UNIT.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(OUTLINE_UNIT_LABELS)
          .setValue(this.plugin.outlineUnit)
          .onChange((value) => void this.plugin.setOutlineUnit(value as OutlineUnit)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_GUIDE_VISIBILITY.name)
      .setDesc(SETTING_GUIDE_VISIBILITY.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(GUIDE_VISIBILITY_LABELS)
          .setValue(this.plugin.guideVisibility)
          .onChange((value) => void this.plugin.setGuideVisibility(value as GuideVisibility)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_GUIDE_SINGLE_ROOT.name)
      .setDesc(SETTING_GUIDE_SINGLE_ROOT.desc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.guideHideSingleRoot)
          .onChange((value) => void this.plugin.setGuideHideSingleRoot(value)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_GUIDE_INTENSITY.name)
      .setDesc(SETTING_GUIDE_INTENSITY.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(GUIDE_INTENSITY_LABELS)
          .setValue(this.plugin.guideIntensity)
          .onChange((value) => void this.plugin.setGuideIntensity(value as GuideIntensity)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_MARKER_VISIBILITY.name)
      .setDesc(SETTING_MARKER_VISIBILITY.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(MARKER_VISIBILITY_LABELS)
          .setValue(this.plugin.markerVisibility)
          .onChange((value) => void this.plugin.setMarkerVisibility(value as MarkerVisibility)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_GUIDE_HIGHLIGHT.name)
      .setDesc(SETTING_GUIDE_HIGHLIGHT.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(GUIDE_HIGHLIGHT_LABELS)
          .setValue(this.plugin.guideHighlight)
          .onChange((value) => void this.plugin.setGuideHighlight(value as GuideHighlight)),
      );
    new Setting(this.containerEl)
      .setName(SETTING_MARKER_HIGHLIGHT.name)
      .setDesc(SETTING_MARKER_HIGHLIGHT.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(MARKER_HIGHLIGHT_LABELS)
          .setValue(this.plugin.markerHighlight)
          .onChange((value) => void this.plugin.setMarkerHighlight(value as MarkerHighlight)),
      );
  }
}
