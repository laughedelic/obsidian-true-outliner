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
import { OutlineModeRegistry, DEFAULT_DATA, type PluginData } from './mode-registry';
import { nodeAtLine } from './locate';
import { editsToChanges } from './dispatch';
import { REJECTION_MESSAGES } from './messages';
import { compareWithSections, type SectionInfo } from './crosscheck';
import { grammarExtension } from './keymap';
import { decorationsExtension, type MarkerVisibility } from './decorations';
import { transactionFilterExtension } from './transaction-filter';
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

const CONFLICTING_PLUGINS = ['obsidian-outliner', 'obsidian-zoom'];

export default class TrueOutlinerPlugin extends Plugin {
  private data: PluginData = { ...DEFAULT_DATA };
  private registry!: OutlineModeRegistry;
  /** Public so the e2e harness can read classification evidence the same
   * way it already reads `isOutline` (design.md D8). */
  readonly stats = new TransactionStats();

  override async onload(): Promise<void> {
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

    this.addStructuralCommand('indent-node', 'Indent node', indent);
    this.addStructuralCommand('outdent-node', 'Outdent node', outdent);
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

    this.registerEditorExtension(grammarExtension(this));
    this.registerEditorExtension(decorationsExtension(this));
    this.registerEditorExtension(transactionFilterExtension(this, this.stats));

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

  private addStructuralCommand(id: string, name: string, op: StructuralOp): void {
    this.addCommand({
      id,
      name,
      editorCheckCallback: (checking, editor, ctx) => {
        const path = ctx.file?.path;
        if (!path || !this.registry.isOutline(path)) return false;
        if (!checking) this.runOp(editor, ctx, op);
        return true;
      },
    });
  }

  private runOp(editor: Editor, ctx: MarkdownView | MarkdownFileInfo, op: StructuralOp): void {
    // Fresh-tree guarantee: always parse the current buffer at invocation.
    const text = editor.getValue();
    const doc = parse(text);
    if (this.data.debugCrossCheck && ctx.file) this.crossCheck(doc, ctx.file);

    const node: OutlineNode | undefined = nodeAtLine(doc, editor.getCursor().line);
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
    if (changes.length > 0) editor.transaction({ changes });
    editor.setCursor(result.value.cursor);
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
