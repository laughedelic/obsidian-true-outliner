// Groups heatmap regions into the modules a split would create, then reports
// per-group churn, co-change between groups, and — from merged PR lifetimes —
// how many concurrently open PR pairs shared each file. Reads `heatmap.json`
// and `merged-prs.json` from SEAMS_DIR; `group()` is also used by
// conflicts.mjs.
//
//   gh pr list --state merged --limit 130 --json number,title,createdAt,mergedAt > "$SEAMS_DIR/merged-prs.json"
//   SEAMS_DIR=/tmp/seams node docs/research/prototypes/hot-file-seams/groups.mjs
//
// The decorations.ts line ranges and the helpers.ts section names describe the
// files as they stood at 3e994a5; names that no longer exist fall back to the
// patterns below.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { regionsTS } from './regions.mjs';

const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');
export const DIR = process.env.SEAMS_DIR ?? join(tmpdir(), 'hot-file-seams');
const BASE = process.env.BASE ?? '3e994a5';
const show = (file) => execFileSync('git', ['show', `${BASE}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 28 });

const HELPER_SECTIONS = {
  Folding: 'folding',
  'Outline mode': 'mode',
  'The mode indicators': 'mode',
  'Decorations (rendered layout)': 'layout',
};
const helperGroup = new Map();
{
  let section = '';
  for (const line of show('e2e/helpers.ts').split('\n')) {
    const banner = line.match(/^\/\/ -{2,} (.+?) -*$/);
    if (banner) section = banner[1];
    const m = line.match(/^(?:export )?(?:async )?(?:function|const|let|type|interface|class) (\w+)/);
    if (m) helperGroup.set(m[1], HELPER_SECTIONS[section] ?? 'core');
  }
}

const DECORATION_RANGES = [
  [1, 128, 'imports+head'], [129, 176, 'facts'], [177, 229, 'guides'], [230, 493, 'position-trail'],
  [494, 657, 'facts'], [658, 788, 'position-trail'], [789, 1112, 'markers'], [1113, 1315, 'fold-chrome'],
  [1316, 1471, 'core'], [1472, 1722, 'selection'], [1723, 1885, 'widget-patch'], [1886, 1929, 'core'],
  [1930, 1981, 'ordered-digits'], [1982, 2005, 'markers'], [2006, 2022, 'fold-chrome'],
  [2023, 2042, 'ordered-digits'], [2043, 2370, 'selection'], [2371, 3373, 'margin-compensation'],
  [3374, Infinity, 'extension'],
];
const decorationGroup = new Map();
for (const r of regionsTS(show('src/plugin/decorations.ts'), ts)) {
  decorationGroup.set(r.name, DECORATION_RANGES.find(([a, b]) => r.end >= a && r.end <= b)?.[2] ?? 'core');
}

const PATTERNS = {
  'src/plugin/decorations.ts': [
    [/^\(imports\)$/, 'imports+head'], [/MarginCompensation|AtomWidgetMargins/, 'margin-compensation'],
    [/[Ss]elect/, 'selection'], [/[Ff]old/, 'fold-chrome'], [/[Mm]arker/, 'markers'], [/[Gg]uide/, 'guides'],
    [/[Tt]rail|[Aa]ccent/, 'position-trail'], [/./, 'core'],
  ],
  'src/plugin/main.ts': [
    [/^\(imports\)$/, 'imports'],
    [/SettingTab|^SETTING_|_LABELS$|FooterSettingKey|publishAppearance|setFooterSetting/, 'settings'],
    [/^TrueOutlinerPlugin\.(set)?([Rr]ememberFolds|[Oo]utlineByDefault|[Ss]tatusBarMode|[Dd]ebugCrossCheck|[Bb]acklinks\w*|footerRevision|[Oo]utlineUnit|[Gg]uide\w*|[Mm]arker\w*)$/, 'settings'],
    [/onload\/registerEditorExtension/, 'extension-list'],
    [/addStructuralCommand|runOp|StructuralOp|resultCursor|offsetToPos|crossCheck/, 'structural-commands'],
    [/addFoldCommand|foldState/, 'fold-commands'],
    [/addZoomCommand|zoomInFrom|zoomOutFrom/, 'zoom-commands'],
    [/metadataCache|vault\.on|layout-change|onLayoutReady|\.backlinks$|BacklinkIndex/, 'backlinks-wiring'],
    [/toggleActiveTab|setOutlineMode|enterOutlineFromReading|Indicators|activeTabOutlineMode|renderStatusItem|toggle-outline-mode|toggleMode|refreshDecorations|forceRedraw|editor-menu|OutlineModeRegistry|registry/, 'mode'],
    [/showDevBuildStamp|motionCounts|buildStamp|print-transaction-stats|\.stats$/, 'dev'],
    [/./, 'other'],
  ],
  'src/plugin/mode-registry.ts': [
    [/^\((imports|exports)\)$/, 'imports'], [/OutlineModeRegistry/, 'mode-registry (retired)'],
    [/^(PluginData|DEFAULT_DATA|normalizePluginData|oneOf)$/, 'aggregate'], [/./, 'per-setting types'],
  ],
  'src/plugin/keymap.ts': [
    [/^\(imports\)$/, 'imports'],
    [/makeHorizontalHandler|makeVerticalHandler|makeHomeEndHandler|verticalGoalColumn|viewTick|tickOf|tickCounter|foldHidingLine|MotionProbe|motionProbe|setMotionProbe|probed|soleCursor/, 'motion'],
    [/makeExtendHandler|makeSelectAllHandler/, 'selection'], [/grammarExtension/, 'extension-list'],
    [/./, 'structural+shared'],
  ],
  'src/ops.ts': [
    [/^\(imports\)$/, 'imports'],
    [/splitNode|insertEmptyBefore|unwrapListItem|insertSiblingHeading|itemContentIsEmpty|emptyItemPrefix|itemMarkerText|itemTaskMarker|itemStyleFrom|markerPrefixCh|taskMarkerLength|isContentStartCh|LIST_MARKER_SPLIT_RE|TASK_MARKER_RE|EMPTY_TASK_MARKER/, 'split (Enter family)'],
    [/deleteSubtree|mergeNodes|rawSuccessorPath|bareContentLines|reindentSubtreeVerbatim|reencodeBlocksForDestination|insertSubtrees|resolveContiguousGroup|ResolvedGroup|arraysEqual/, 'edit (delete/merge/paste)'],
    [/^(indent|outdent|indentSurgery|outdentSurgery|move\w*|swapAbsorbsAListItem|fromSurgery|applyGroups|rejectAcrossScopes|\w+Groups\w*|headingLevel\w*|shiftHeadingLevels|maxHeadingLevel)$/, 'structure (indent/outdent/move)'],
    [/./, 'shared (finalize/renumber/indent choice)'],
  ],
  'src/plugin/backlinks-footer.ts': [
    [/Glyph|glyph|Chevron/, 'glyphs'],
    [/renderInline|withoutEmbeds|dropMedia|unwrapBlocks|trimEdgeWhitespace|decodeEntities|BLOCK_WRAPPERS|renderMarkdown|renderContent/, 'markdown'],
    [/Facet|facet|SORT_LABELS|KIND_LABELS|toggleMember|OpenPopover|renderFilter|renderControls|renderHeader/, 'controls'],
    [/./, 'core'],
  ],
};

// A stylesheet rule is named `<block>:<class>` (regions.mjs); the block is the
// part seam 1 cuts it into. Selection chrome stays with the editor, as it does
// in the proposed parts.
const CSS_BLOCK_GROUP = { editor: "editor+tokens", footer: "footer", zoom: "zoom", indicators: "indicators", folding: "folding" };
function cssGroup(name) {
  return CSS_BLOCK_GROUP[name.split(":")[0]] ?? "editor+tokens";
}

export function group(file, name) {
  if (file === 'e2e/helpers.ts') return helperGroup.get(name) ?? (name === '(imports)' ? 'core' : '(gone)');
  if (file === "styles.css") return cssGroup(name);
  // Paths a seam introduces: one group per file, so an edit inside a part or a
  // slice counts as that part's own.
  if (/^styles\//.test(file) || /^src\/plugin\/settings/.test(file) || file === "e2e/footer.ts" || file === "e2e/folding.ts") return file;
  if (file === 'src/plugin/decorations.ts' && decorationGroup.has(name)) return decorationGroup.get(name);
  for (const [re, g] of PATTERNS[file] ?? []) if (re.test(name)) return g;
  return 'other';
}

export const isImports = (g) => /^imports/.test(g);

function report() {
  const records = JSON.parse(readFileSync(join(DIR, 'heatmap.json'), 'utf8'));
  const prs = JSON.parse(readFileSync(join(DIR, 'merged-prs.json'), 'utf8'));
  const prByNum = new Map(prs.map((p) => [String(p.number), p]));
  for (const file of new Set(records.map((r) => r.file))) {
    const rs = records.filter((r) => r.file === file).map((r) => ({ ...r, groups: new Set(Object.keys(r.regions).map((n) => group(file, n))) }));
    const stats = new Map();
    for (const r of rs)
      for (const g of r.groups) {
        const e = stats.get(g) ?? { commits: 0, alone: 0, scopes: new Map() };
        e.commits++;
        if (r.groups.size === 1) e.alone++;
        const s = `${r.type}(${r.scope ?? '-'})`;
        e.scopes.set(s, (e.scopes.get(s) ?? 0) + 1);
        stats.set(g, e);
      }
    const spanning = rs.filter((r) => [...r.groups].filter((g) => !isImports(g)).length > 1).length;
    console.log(`\n### ${file}: ${rs.length} commits, ${spanning} touching more than one non-import group`);
    for (const [g, e] of [...stats].sort((a, b) => b[1].commits - a[1].commits)) {
      const scopes = [...e.scopes].sort((a, b) => b[1] - a[1]).map(([s, n]) => (n > 1 ? `${s}×${n}` : s)).join(' ');
      console.log(`  ${g.padEnd(40)} commits=${String(e.commits).padStart(2)} alone=${String(e.alone).padStart(2)}  ${scopes}`);
    }
    const pairs = new Map();
    for (const r of rs) {
      const gs = [...r.groups].filter((g) => !isImports(g)).sort();
      for (let i = 0; i < gs.length; i++)
        for (let j = i + 1; j < gs.length; j++) pairs.set(`${gs[i]} + ${gs[j]}`, (pairs.get(`${gs[i]} + ${gs[j]}`) ?? 0) + 1);
    }
    for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    co-change ${String(n).padStart(2)}  ${k}`);
  }

  const touched = new Map();
  for (const r of records) {
    if (!r.pr || !prByNum.has(r.pr)) continue;
    const m = touched.get(r.pr) ?? new Set();
    m.add(r.file);
    touched.set(r.pr, m);
  }
  const nums = [...touched.keys()];
  const sharing = new Map();
  let overlapping = 0;
  let sharingAny = 0;
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) {
      const a = prByNum.get(nums[i]);
      const b = prByNum.get(nums[j]);
      if (!(a.createdAt < b.mergedAt && b.createdAt < a.mergedAt)) continue;
      overlapping++;
      const shared = [...touched.get(nums[i])].filter((f) => touched.get(nums[j]).has(f));
      if (shared.length) sharingAny++;
      for (const f of shared) sharing.set(f, (sharing.get(f) ?? 0) + 1);
    }
  console.log(`\n### ${overlapping} overlapping PR pairs among ${nums.length} PRs that touched a hot file; ${sharingAny} shared at least one`);
  for (const [f, n] of [...sharing].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${f}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) report();
