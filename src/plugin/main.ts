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
  type SettingDefinitionItem,
} from 'obsidian';
import type { OutlineDoc, OutlineNode } from '../model';
import { parse } from '../parse';
import { indent, moveDown, moveUp, outdent } from '../ops';
import type { OpOutput } from '../ops';
import type { OpResult } from '../result';
import { applyEdits } from '../result';
import { OutlineModeRegistry, DEFAULT_DATA, type PluginData } from './mode-registry';
import { nodeAtLine } from './locate';
import { isAddressable } from '../caret';
import { editsToChanges, mapCursorForward, type EditorChange } from './dispatch';
import { REJECTION_MESSAGES } from './messages';
import { compareWithSections, type SectionInfo } from './crosscheck';
import { grammarExtension, setMotionProbe } from './keymap';
import { nestedEditorExtension } from './nested-editor';
import { BUILD_STAMP } from 'virtual:build-stamp';
import { decorationsExtension, type MarkerVisibility } from './decorations';
import { transactionFilterExtension } from './transaction-filter';
import { historyCaretExtension } from './history-caret';
import { TransactionStats } from './stats';

const MARKER_VISIBILITY_LABELS: Record<MarkerVisibility, string> = {
  all: 'All eligible kinds (status quo)',
  'with-children': 'Only nodes that have children',
  'headings-and-paragraphs': 'Only headings and paragraphs',
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
type StructuralOp = (doc: OutlineDoc, nodeId: number) => OpResult<OpOutput>;

/**
 * The cursor a palette-invoked structural command should end on, in the SAME
 * terms `grammar.ts`'s `planFromOp` uses for the keyboard path: when
 * `mapFrom` is given (indent/outdent), the pre-op caret mapped forward
 * through the change set, but ONLY if that lands somewhere a caret may
 * actually go — otherwise the operation's own cursor.
 *
 * The guard is not optional here just because the palette has no Tab key: a
 * command can equally be invoked with a whole-block cover selected, whose
 * head sits on the trailing gap line the cover owns, and mapping that forward
 * yields another gap position. The keyboard path would fall back; without
 * this the palette path would not, and its follow-up placement is a
 * `programmatic` transaction, which `transaction-filter.ts` deliberately
 * exempts from gap resolution — so nothing downstream would catch it.
 */
function resultCursor(
  lines: readonly string[],
  newLines: readonly string[],
  changes: readonly EditorChange[],
  opCursor: { line: number; ch: number },
  mapFrom?: { line: number; ch: number },
): { line: number; ch: number } {
  if (mapFrom !== undefined) {
    const mapped = offsetToPos(newLines, mapCursorForward(lines, changes, mapFrom));
    if (isAddressable(parse(newLines.join('\n')), mapped)) return mapped;
  }
  return opCursor;
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

  override async onload(): Promise<void> {
    this.showDevBuildStamp();
    this.data = { ...DEFAULT_DATA, ...((await this.loadData()) as Partial<PluginData> | null) };
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

    this.addStructuralCommand('indent-node', 'Indent node', indent, true);
    this.addStructuralCommand('outdent-node', 'Outdent node', outdent, true);
    this.addStructuralCommand('move-node-up', 'Move node up', moveUp);
    this.addStructuralCommand('move-node-down', 'Move node down', moveDown);

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) void this.registry.handleRename(oldPath, file.path);
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
    this.registerEditorExtension(grammarExtension(this));
    this.registerEditorExtension(decorationsExtension(this));
    this.registerEditorExtension(transactionFilterExtension(this, this.stats));
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

    this.app.workspace.onLayoutReady(() => void this.warnAboutConflicts());
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

  get markerVisibility(): MarkerVisibility {
    return this.data.markerVisibility;
  }

  async setMarkerVisibility(value: MarkerVisibility): Promise<void> {
    this.data.markerVisibility = value;
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
    new Notice(on ? 'Outline mode on' : 'Outline mode off', 1500);
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

  private addStructuralCommand(
    id: string,
    name: string,
    op: StructuralOp,
    useMappedCursor = false,
  ): void {
    this.addCommand({
      id,
      name,
      editorCheckCallback: (checking, editor, ctx) => {
        const path = ctx.file?.path;
        if (!path || !this.registry.isOutline(path)) return false;
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

    const cursorBefore = editor.getCursor();
    const node: OutlineNode | undefined = nodeAtLine(doc, cursorBefore.line);
    if (!node) {
      new Notice(REJECTION_MESSAGES['node-not-found'], 1500);
      return;
    }
    const result = op(doc, node.id);
    if (!result.ok) {
      new Notice(REJECTION_MESSAGES[result.rejection.reason], 1500);
      return;
    }
    const lines = text === '' ? [] : text.split('\n');
    const changes = editsToChanges(lines, result.value.edits);
    const newLines = applyEdits(lines, result.value.edits);
    const cursor = resultCursor(lines, newLines, changes, result.value.cursor, useMappedCursor
      ? cursorBefore
      : undefined);

    // TWO transactions, deliberately: the change, then the cursor. Combining
    // them into one `editor.transaction({changes, selection})` looks tidier and
    // silently breaks undo granularity — measured, and caught by
    // 20-structural-commands' "one undo step each way".
    //
    // `Editor.transaction` dispatches with no `userEvent`, and CM6's
    // `HistoryState.addChanges` joins a new change into the previous event when
    // (among other things) `!userEvent` and the previous event has no
    // `selectionsAfter`. Two palette commands run back-to-back — indent then
    // outdent — are adjacent and inside `newGroupDelay`, so with nothing
    // between them they merge into ONE undo step and a single Cmd+Z reverts
    // both. The separate `setCursor` is what prevents that: a selection-only
    // transaction populates the preceding event's `selectionsAfter`, which
    // blocks the join. The keyboard path needs no such trick because its
    // `input.structure.*` userEvent already fails CM6's `joinableUserEvent`
    // test. Guarded by a unit test on that CM6 behaviour in
    // tests/minimal-change-history.test.ts.
    //
    // Splitting them costs nothing in cursor correctness: `setCursor` writes an
    // absolute position computed from the PRE-op buffer, so it overwrites
    // rather than builds on the change transaction's own default mapping, and
    // the resulting `selectionsAfter[0]` is what redo prefers — our cursor.
    if (changes.length > 0) editor.transaction({ changes });
    editor.setCursor(cursor);
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

const SETTING_MARKER_VISIBILITY = {
  name: 'Debug: block marker visibility (experiment 5a)',
  desc: 'Which nodes get a block marker icon at all. Most leaf atom kinds (code, table, callout, quote, HTML, hr) already carry their own native visual style, so a marker may only be worth showing on branch nodes. Takes effect on the next edit or note switch.',
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
        ...SETTING_MARKER_VISIBILITY,
        control: {
          type: 'dropdown',
          key: 'markerVisibility',
          options: MARKER_VISIBILITY_LABELS,
          defaultValue: 'all',
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
      case 'markerVisibility':
        return this.plugin.markerVisibility;
      default:
        return undefined;
    }
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case 'debugCrossCheck':
        await this.plugin.setDebugCrossCheck(Boolean(value));
        break;
      case 'markerVisibility':
        await this.plugin.setMarkerVisibility(value as MarkerVisibility);
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
      .setName(SETTING_MARKER_VISIBILITY.name)
      .setDesc(SETTING_MARKER_VISIBILITY.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(MARKER_VISIBILITY_LABELS)
          .setValue(this.plugin.markerVisibility)
          .onChange((value) => void this.plugin.setMarkerVisibility(value as MarkerVisibility)),
      );
  }
}
