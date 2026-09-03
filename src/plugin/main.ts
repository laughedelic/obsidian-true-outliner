import {
  App,
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
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
import {
  OutlineModeRegistry,
  DEFAULT_DATA,
  normalizePluginData,
  type GroupHeight,
  type GuideHighlight,
  type LineageSeparator,
  type MarkerHighlight,
  type OverallCap,
  type PluginData,
  type SegmentIcons,
  type SortOrder,
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
import { zoomSpikeExtension, type ZoomSpikeSpan } from './zoom-spike';
import { historyCaretExtension } from './history-caret';
import { TransactionStats } from './stats';

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
  private registry!: OutlineModeRegistry;
  /** Public so the e2e harness can read classification evidence the same
   * way it already reads `isOutline` (design.md D8). */
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

  /** The stamp compiled into THIS bundle. Public so the dev hot-reload plugin
   * can name the build it just loaded: `manifest.json` is copied verbatim and
   * cached by Obsidian anyway, so it only ever reports the base package
   * version. */
  readonly buildStamp = BUILD_STAMP;

  /** THROWAWAY — the span `zoom-spike.ts` keeps visible, or null for no
   * hiding. Public for the same reason `stats` and `motionCounts` are: the
   * spike's e2e spec is the only thing that sets it. Remove with the spike. */
  zoomSpike: ZoomSpikeSpan | null = null;

  /** THROWAWAY — set the spike span and force the decoration field to
   * recompute. A no-op dispatch is enough: the field reads this plugin on
   * every transaction. Remove with the spike. */
  setZoomSpike(span: ZoomSpikeSpan | null): void {
    this.zoomSpike = span;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) view.editor.setCursor(view.editor.getCursor());
  }

  override async onload(): Promise<void> {
    this.showDevBuildStamp();
    this.data = normalizePluginData(await this.loadData());
    this.registry = new OutlineModeRegistry(async (paths) => {
      this.data.outlinePaths = paths;
      await this.saveData(this.data);
    });
    this.registry.hydrate(this.data.outlinePaths);

    this.addCommand({
      id: 'toggle-outline-mode',
      name: 'Toggle outline mode',
      editorCheckCallback: (checking, _editor, ctx) => {
        const path = ctx.file?.path;
        if (!path) return false;
        if (!checking) void this.toggleMode(path);
        return true;
      },
    });

    this.addStructuralCommand('indent-node', 'Indent node', indentGroups, true);
    this.addStructuralCommand('outdent-node', 'Outdent node', outdentGroups, true);
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

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) void this.registry.handleRename(oldPath, file.path);
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
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) void this.registry.handleDelete(file.path);
      }),
    );
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, _editor, info) => {
        const path = info.file?.path;
        if (!path || !path.endsWith('.md')) return;
        const on = this.registry.isOutline(path);
        menu.addItem((item) =>
          item
            .setTitle(on ? 'Disable outline mode' : 'Enable outline mode')
            .setIcon('list-tree')
            .onClick(() => void this.toggleMode(path)),
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
    this.registerEditorExtension(grammarExtension(this));
    this.registerEditorExtension(decorationsExtension(this));
    this.registerEditorExtension(transactionFilterExtension(this, this.stats));
    // Registered LAST among the decoration producers: it is the only block
    // decoration here, and keeping it last means any interaction with the
    // established layers is attributable to it rather than to ordering.
    this.registerEditorExtension(backlinksFooterExtension(this));
    // THROWAWAY — `outline-zoom` task 1's mechanism spike (design D2). Last of
    // all, so anything it disturbs is attributable to it. Remove with
    // `zoom-spike.ts` once doc 23 records the verdict.
    this.registerEditorExtension(zoomSpikeExtension(this));
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
    this.registerEditorExtension(historyCaretExtension(this));

    this.addCommand({
      id: 'print-transaction-stats',
      name: 'Debug: print transaction classification stats',
      callback: () => {
        console.debug(`[true-outliner] transaction stats\n${this.stats.formatSummary()}`);
        new Notice('Transaction classification stats printed to console.', 2000);
      },
    });

    this.addSettingTab(new TrueOutlinerSettingTab(this.app, this));

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

  isOutline(path: string): boolean {
    return this.registry.isOutline(path);
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

  /** See `SpikeFooterSource.footerRevision` — bumped whenever outline mode or
   * the backlinks-footer setting changes, so the footer's StateField gets a real
   * transaction to recompute on (docs/research/19, S2). Those are the two
   * inputs the footer's own rendering reads; a setting added later that the
   * footer depends on has to bump this too, or its change is invisible until
   * some unrelated transaction arrives. */
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
    await this.forceRedraw();
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
    nudgeFooters(this.app);
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

  get markerVisibility(): MarkerVisibility {
    return this.data.markerVisibility;
  }

  async setMarkerVisibility(value: MarkerVisibility): Promise<void> {
    this.data.markerVisibility = value;
    await this.saveData(this.data);
    await this.forceRedraw();
  }

  get guideHighlight(): GuideHighlight {
    return this.data.guideHighlight;
  }

  async setGuideHighlight(value: GuideHighlight): Promise<void> {
    this.data.guideHighlight = value;
    await this.saveData(this.data);
    await this.forceRedraw();
  }

  get markerHighlight(): MarkerHighlight {
    return this.data.markerHighlight;
  }

  async setMarkerHighlight(value: MarkerHighlight): Promise<void> {
    this.data.markerHighlight = value;
    await this.saveData(this.data);
    await this.forceRedraw();
  }

  /**
   * A plain cursor nudge (what `refreshDecorations` uses for the mode
   * toggle) forces `computeDecorations`/`computeMarkers` to recompute, but
   * doesn't reliably reach `MarginCompensation` — a ViewPlugin with no
   * decorations of its own, whose `docViewUpdate` hook only fires when
   * SOME decoration source's output actually differs (CM6's own doc
   * comment: "due to content, decoration, or viewport changes"). For a
   * note containing only widget-replaced atoms (table/callout/hr/html —
   * `computeMarkers` deliberately skips these; `computeDecorations` doesn't
   * read `markerVisibility` at all), changing the setting produces
   * byte-identical StateField output, so CM6 correctly sees no diff and
   * never re-fires `docViewUpdate` — confirmed live: a table-only note's
   * marker visibility silently failed to update until this fix.
   *
   * Toggling outline mode off then immediately back on (via the registry
   * directly, not `toggleMode` — no user-facing Notice for an internal
   * refresh) guarantees two GENUINELY different decoration outputs
   * (`Decoration.none` vs. the real thing) regardless of note content,
   * which CM6 always detects as a real change — reliably triggering
   * `docViewUpdate` twice, with the second pass reading the just-saved
   * setting. Both toggles are public-API-only (an `Editor.setCursor` per
   * step, same trick `refreshDecorations` already uses) — no private CM6
   * access, consistent with this project's own public-API-only bar.
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
  private async forceRedraw(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const path = view?.file?.path;
    if (!view || !path || !this.registry.isOutline(path)) return; // nothing rendered to refresh
    await this.registry.toggle(path); // off
    view.editor.setCursor(view.editor.getCursor());
    await this.registry.toggle(path); // back on, now reading the new setting
    view.editor.setCursor(view.editor.getCursor());
  }

  private async toggleMode(path: string): Promise<void> {
    const on = await this.registry.toggle(path);
    this.footerRev++;
    new Notice(on ? 'Outline mode on' : 'Outline mode off', 1500);
    // The same note can be open in more than one split, and `refreshDecorations`
    // reaches one of them. Every footer for this path has just become wrong.
    nudgeFooters(this.app);
    this.refreshDecorations(path);
  }

  /**
   * Toggling outline mode doesn't itself dispatch a CM6 transaction, so
   * decorationsExtension's StateField never gets a chance to recompute.
   * Nudging the cursor to its own position is a real (public-API) dispatch
   * that forces the recompute without changing anything visible.
   */
  private refreshDecorations(path: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path !== path) return;
    view.editor.setCursor(view.editor.getCursor());
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
  private addStructuralCommand(
    id: string,
    name: string,
    op: StructuralOp,
    useMappedCursor = false,
    hotkeys?: Hotkey[],
  ): void {
    this.addCommand({
      id,
      name,
      ...(hotkeys ? { hotkeys } : {}),
      editorCheckCallback: (checking, editor, ctx) => {
        const path = ctx.file?.path;
        if (!path || !this.registry.isOutline(path)) return false;
        // Multi-cursor: unavailable, matching the keymap's own decline
        // (`selection-structural-ops`). Acting would silently discard every
        // range but one, and the two entry points must answer alike.
        if (editor.listSelections().length !== 1) return false;
        if (!checking) this.runOp(editor, ctx, op, useMappedCursor);
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
  name: 'Backlinks: hide Obsidian’s own linked mentions',
  desc: 'Hides Obsidian’s in-document backlinks section in notes where this plugin renders its own, so the same references are not listed twice. Presentational only: no other plugin’s settings are read or changed, and turning this off restores the section immediately.',
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
