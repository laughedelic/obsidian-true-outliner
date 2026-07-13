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

type StructuralOp = (doc: OutlineDoc, nodeId: number) => OpResult<OpOutput>;

const CONFLICTING_PLUGINS = ['obsidian-outliner', 'obsidian-zoom'];

export default class TrueOutlinerPlugin extends Plugin {
  private data: PluginData = { ...DEFAULT_DATA };
  private registry!: OutlineModeRegistry;

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

  private async toggleMode(path: string): Promise<void> {
    const on = await this.registry.toggle(path);
    new Notice(on ? 'Outline mode on' : 'Outline mode off', 1500);
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

class TrueOutlinerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TrueOutlinerPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Debug: cross-check parser against metadata cache')
      .setDesc(
        'Logs disagreements between the plugin parser and Obsidian metadata to the developer console when a structural command runs.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.debugCrossCheck)
          .onChange((value) => void this.plugin.setDebugCrossCheck(value)),
      );
  }
}
