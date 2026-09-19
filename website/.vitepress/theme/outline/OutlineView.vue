<script setup lang="ts">
/**
 * Draws a docs page as the outline it is: the page's own elements step right
 * by their depth, and a layer over them carries the markers, guides, fold
 * controls and zoom trail. The page's DOM is never moved; classes and one
 * custom property per block are all it gains, so switching back to long-form
 * is removing one class.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { onContentUpdated, useData } from 'vitepress';
import { ancestors, buildTree, descendants, labelOf, type ONode, type OTree } from './tree';
import { ICONS } from './icons';
import { outlineOn, pendingFlash } from './state';

const STORAGE_KEY = 'true-outliner:docs-view';
const STATE_KEY = 'true-outliner:docs-state:';
const EDIT_ROOT = 'https://github.com/laughedelic/obsidian-true-outliner/edit/main/website/';

interface Mark {
  node: ONode;
  x: number;
  y: number;
  foldable: boolean;
}
interface Saved {
  folded: number[];
  zoom: number | null;
  y: number;
}
interface Tip {
  text: string;
  x: number;
  y: number;
  side: 'above' | 'right';
}
interface Guide {
  node: ONode;
  x: number;
  top: number;
  height: number;
}

const { frontmatter, page } = useData();
const enabled = computed(() => frontmatter.value.outlineView !== false);
const outline = outlineOn;
const layer = ref<HTMLElement | null>(null);
const tree = shallowRef<OTree | null>(null);
// Shallow: a node must stay the object the tree holds, not a reactive proxy
// of it, or identity checks against the tree's own sets fail.
const marks = shallowRef<Mark[]>([]);
const guides = shallowRef<Guide[]>([]);
const zoomRoot = shallowRef<ONode | null>(null);
const active = shallowRef<ONode | null>(null);
const version = ref(0);
const flash = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const tip = ref<Tip | null>(null);
let content: HTMLElement | null = null;
// The path the tree was read from, which is what its state is saved under:
// during a navigation the address changes before the page does.
let builtPath = '';
// Held for a moment rather than used once: the content can report itself
// updated more than once for one navigation.
let restore: { path: string; state: Saved | null } | null = null;
let restoreTimer = 0;
let saveTimer = 0;
let tipTimer = 0;
let resize: ResizeObserver | null = null;
let frame = 0;

const path = computed(() => {
  version.value;
  const ids = new Set<number>();
  for (let n = active.value; n; n = n.parent) ids.add(n.id);
  return ids;
});
// The page's title stands for its top heading, as the file's name does in
// the plugin's own trail.
const trail = computed(() => (zoomRoot.value ? ancestors(zoomRoot.value).filter((a) => a.parent) : []));
const anyFolded = computed(() => {
  version.value;
  return !!tree.value?.nodes.some((n) => n.folded);
});

function contentRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.VPDoc .vp-doc > div');
}

function hidden(el: Element): boolean {
  return el.classList.contains('to-o-hidden');
}

/** Folds and zoom decide what shows; both are classes on the page's own
 * elements, recomputed from scratch each time. */
function applyVisibility() {
  const t = tree.value;
  if (!t || !content) return;
  for (const n of t.nodes) {
    n.el.classList.remove('to-o-hidden', 'to-o-folded', 'to-o-zoom-anc', 'to-o-zoom-root');
    delete n.el.dataset.toHidden;
  }
  for (const list of t.lists) list.classList.remove('to-o-hidden', 'to-o-zoom-list');

  const root = zoomRoot.value;
  if (root) {
    const keep = new Set<ONode>([root, ...descendants(root)]);
    const anc = new Set(ancestors(root));
    for (const n of t.nodes) {
      if (keep.has(n)) continue;
      // An ancestor item holds the root inside its own element, so it stays
      // in the flow with its own text suppressed.
      if (anc.has(n) && n.kind === 'item') n.el.classList.add('to-o-zoom-anc');
      else n.el.classList.add('to-o-hidden');
    }
    root.el.classList.add('to-o-zoom-root');
    if (root.kind === 'item') {
      for (let el = root.el.parentElement; el && el !== content; el = el.parentElement) {
        if (el.tagName === 'UL' || el.tagName === 'OL') el.classList.add('to-o-zoom-list');
      }
    }
  }
  for (const n of t.nodes) {
    if (!n.folded || !n.children.length) continue;
    const inside = descendants(n);
    n.el.classList.add('to-o-folded');
    n.el.dataset.toHidden = String(inside.length);
    for (const d of inside) d.el.classList.add('to-o-hidden');
  }
  for (const list of t.lists) {
    const items = Array.from(list.children).filter((c) => c.tagName === 'LI');
    if (items.length && items.every(hidden)) list.classList.add('to-o-hidden');
  }
  const base = root && root.kind !== 'item' ? root.depth : 0;
  content.style.setProperty('--to-o-base', String(base));
}

function visible(node: ONode): boolean {
  if (hidden(node.el) || node.el.classList.contains('to-o-zoom-anc')) return false;
  return node.el.getClientRects().length > 0;
}

function measure() {
  const t = tree.value;
  const host = layer.value;
  if (!t || !host || !outline.value) {
    marks.value = [];
    guides.value = [];
    return;
  }
  const origin = host.getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const gutter = parseFloat(getComputedStyle(host).getPropertyValue('--to-o-gutter')) * rem || 1.5 * rem;
  const nextMarks: Mark[] = [];
  const centre = new Map<number, { x: number; y: number }>();
  for (const node of t.nodes) {
    if (!visible(node)) continue;
    const rect = node.el.getBoundingClientRect();
    const style = getComputedStyle(node.el);
    const text = node.kind === 'heading' || node.kind === 'paragraph' || node.kind === 'item';
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const y = rect.top - origin.top + (text ? parseFloat(style.paddingTop) + line / 2 : Math.min(rect.height / 2, 0.95 * rem));
    const x = rect.left - origin.left - gutter / 2;
    centre.set(node.id, { x, y });
    nextMarks.push({ node, x, y, foldable: node.children.length > 0 });
  }
  const nextGuides: Guide[] = [];
  for (const node of t.nodes) {
    const c = centre.get(node.id);
    if (!c || node.folded || !node.children.length) continue;
    const last = [...descendants(node)].reverse().find(visible);
    if (!last) continue;
    const bottom = last.el.getBoundingClientRect().bottom - origin.top;
    const top = c.y + 0.55 * rem;
    if (bottom - top > 4) nextGuides.push({ node, x: c.x, top, height: bottom - top });
  }
  marks.value = nextMarks;
  guides.value = nextGuides;
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}

function refresh(keep = true) {
  applyVisibility();
  version.value++;
  void nextTick(schedule);
  if (keep) save();
}

function save() {
  const t = tree.value;
  if (!t || builtPath !== location.pathname) return;
  const state: Saved = {
    folded: t.nodes.filter((n) => n.folded).map((n) => n.id),
    zoom: zoomRoot.value?.id ?? null,
    y: window.scrollY,
  };
  try {
    sessionStorage.setItem(STATE_KEY + builtPath, JSON.stringify(state));
  } catch {
    // Without storage, going back starts the page afresh.
  }
}

function onScroll() {
  hideTip();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 150);
}

function saved(): Saved | null {
  try {
    return JSON.parse(sessionStorage.getItem(STATE_KEY + location.pathname) ?? 'null') as Saved | null;
  } catch {
    return null;
  }
}

/** Runs once the router's own scroll for the navigation has happened. */
function afterNavigation(run: () => void) {
  void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(run)));
}

const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The node a backlink row stood for, found by its text: the footer's rows
 * come from the markdown and the tree from the HTML, so text is what they
 * share. A table's reference is one of its rows. */
function findByText(t: OTree, text: string): { node: ONode; el: HTMLElement } | null {
  const want = squash(text).slice(0, 40);
  if (!want) return null;
  for (const node of t.nodes) {
    if (node.kind === 'table') {
      const row = Array.from(node.el.querySelectorAll('tr')).find((tr) => squash(tr.textContent ?? '').startsWith(want));
      if (row) return { node, el: row };
    } else if (squash(labelOf(node, 400)).startsWith(want)) return { node, el: node.el };
  }
  return null;
}

function flashAt(el: HTMLElement) {
  const host = layer.value;
  if (!host) return;
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  const origin = host.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  // An item's box holds its children too; the line is what is pointed at.
  const nested = Array.from(el.children).find((c) => c.tagName === 'UL' || c.tagName === 'OL');
  const bottom = nested ? nested.getBoundingClientRect().top : rect.bottom;
  flash.value = null;
  void nextTick(() => {
    flash.value = { x: rect.left - origin.left - 6, y: rect.top - origin.top - 2, w: rect.width + 12, h: bottom - rect.top + 4 };
  });
}

/** Keeps a node on screen after a fold changed the page's height above or
 * around it. */
function keepInView(node: ONode) {
  void nextTick(() => {
    const top = node.el.getBoundingClientRect().top;
    if (top < 88 || top > window.innerHeight - 40) {
      window.scrollBy({ top: top - 104, behavior: 'instant' as ScrollBehavior });
    }
  });
}

function showTip(event: MouseEvent) {
  const el = (event.target as Element).closest<HTMLElement>('[data-tip]');
  clearTimeout(tipTimer);
  if (!el?.dataset.tip) return hideTip();
  const text = el.dataset.tip;
  const rect = el.getBoundingClientRect();
  const guide = el.classList.contains('to-o-guide');
  const next: Tip = guide
    ? { text, x: rect.right + 6, y: event.clientY, side: 'right' }
    : { text, x: rect.left + rect.width / 2, y: rect.top - 6, side: 'above' };
  tipTimer = window.setTimeout(() => (tip.value = next), 450);
}

function hideTip() {
  clearTimeout(tipTimer);
  if (tip.value) tip.value = null;
}

function guideTip(node: ONode): string | undefined {
  const foldable = node.children.filter((c) => c.children.length);
  if (!foldable.length) return undefined;
  return foldable.some((c) => !c.folded) ? 'Fold everything under this node' : 'Unfold everything under this node';
}

function rebuild() {
  content = contentRoot();
  resize?.disconnect();
  zoomRoot.value = null;
  active.value = null;
  flash.value = null;
  hideTip();
  builtPath = location.pathname;
  if (!content || !enabled.value) {
    tree.value = null;
    marks.value = [];
    guides.value = [];
    return;
  }
  const t = buildTree(content);
  for (const n of t.nodes) {
    if (n.kind !== 'item') {
      n.el.classList.add('to-o-node');
      n.el.style.setProperty('--to-o-d', String(n.depth));
    }
  }
  for (const [list, depth] of t.topLists) {
    list.classList.add('to-o-list');
    list.style.setProperty('--to-o-d', String(depth));
  }
  tree.value = t;
  content.classList.toggle('to-o-on', outline.value);
  resize = new ResizeObserver(schedule);
  resize.observe(content);

  const state = restore?.path === location.pathname ? restore.state : null;
  if (state) {
    const folded = new Set(state.folded);
    for (const n of t.nodes) n.folded = folded.has(n.id) && n.children.length > 0;
    zoomRoot.value = t.nodes.find((n) => n.id === state.zoom && n.parent) ?? null;
  }
  refresh(false);
  if (state) afterNavigation(() => window.scrollTo({ top: state.y, behavior: 'instant' as ScrollBehavior }));

  const target = pendingFlash.value;
  pendingFlash.value = null;
  if (target && target.path === location.pathname && outline.value) {
    const found = findByText(t, target.text);
    if (found) afterNavigation(() => flashAt(found.el));
  }
}

function setOutline(on: boolean) {
  outline.value = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'outline' : 'long-form');
  } catch {
    // A private window keeps the choice for the page only.
  }
  content?.classList.toggle('to-o-on', on);
  void nextTick(schedule);
}

function toggleFold(node: ONode) {
  if (!node.children.length) return;
  node.folded = !node.folded;
  refresh();
  keepInView(node);
}

/** A click on a guide folds the branch's children, or opens them all again:
 * the gesture for reading one branch by closing the ones beside it. */
function toggleChildren(node: ONode) {
  const foldable = node.children.filter((c) => c.children.length);
  if (!foldable.length) return;
  const anyOpen = foldable.some((c) => !c.folded);
  for (const c of foldable) c.folded = anyOpen;
  hideTip();
  refresh();
  keepInView(node);
}

function foldAll(fold: boolean) {
  const t = tree.value;
  if (!t) return;
  const scope = zoomRoot.value ? descendants(zoomRoot.value) : t.nodes.filter((n) => n.parent);
  for (const n of scope) n.folded = fold && n.children.length > 0;
  refresh();
}

function zoomTo(node: ONode | null) {
  if (node) {
    node.folded = false;
    for (const a of ancestors(node)) a.folded = false;
  }
  const from = zoomRoot.value;
  const to = node && node.parent ? node : null;
  zoomRoot.value = to;
  refresh();
  // After the render, so the trail appearing above the page is already in
  // the layout the scroll is measured against.
  void nextTick(() => {
    const instant = 'instant' as ScrollBehavior;
    if (to) window.scrollTo({ top: 0, behavior: instant });
    else if (from) from.el.scrollIntoView({ block: 'center', behavior: instant });
  });
}

function onPop() {
  restore = { path: location.pathname, state: saved() };
  clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => (restore = null), 1500);
}

function onOver(event: Event) {
  const t = tree.value;
  if (!t) return;
  let el = event.target as Element | null;
  while (el && el !== content) {
    const node = t.byEl.get(el);
    if (node) {
      if (active.value !== node) active.value = node;
      return;
    }
    el = el.parentElement;
  }
}

onMounted(() => {
  try {
    outline.value = localStorage.getItem(STORAGE_KEY) !== 'long-form';
  } catch {
    outline.value = true;
  }
  // A reload or a return from another site comes back to the page as it was
  // left, as going back within the site does.
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (entry && (entry.type === 'reload' || entry.type === 'back_forward')) onPop();
  rebuild();
  window.addEventListener('popstate', onPop);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('mouseover', onOver, { passive: true });
  window.addEventListener('load', schedule);
  document.fonts?.ready.then(schedule).catch(() => undefined);
});
onContentUpdated(rebuild);
onBeforeUnmount(() => {
  document.removeEventListener('mouseover', onOver);
  window.removeEventListener('popstate', onPop);
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('load', schedule);
  clearTimeout(saveTimer);
  clearTimeout(tipTimer);
  clearTimeout(restoreTimer);
  resize?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <nav v-if="enabled && outline && zoomRoot" class="to-o-trail" aria-label="Zoom trail">
    <button type="button" class="to-o-crumb to-o-crumb-page" @click="zoomTo(null)" title="Zoom out fully">
      <span class="to-o-zoomout" aria-hidden="true" v-html="ICONS.zoomOut"></span><span class="to-o-crumb-text">{{ page.title }}</span>
    </button>
    <template v-for="a in trail" :key="a.id">
      <span class="to-o-sep" aria-hidden="true">›</span>
      <button type="button" class="to-o-crumb" @click="zoomTo(a)"><span class="to-o-crumb-text">{{ labelOf(a, 80) }}</span></button>
    </template>
  </nav>
  <Teleport to="body">
    <div v-if="enabled" class="to-o-status" role="toolbar" aria-label="Page view">
      <template v-if="outline">
        <button type="button" aria-label="Fold all" @click="foldAll(true)" v-html="ICONS.foldAll"></button>
        <button
          type="button"
          aria-label="Unfold all"
          :disabled="!anyFolded"
          @click="foldAll(false)"
          v-html="ICONS.unfoldAll"
        ></button>
        <span class="to-o-status-sep" aria-hidden="true"></span>
      </template>
      <button
        type="button"
        aria-label="Outline view"
        :aria-pressed="outline"
        @click="setOutline(true)"
        v-html="ICONS.outline"
      ></button>
      <button
        type="button"
        aria-label="Long-form view"
        :aria-pressed="!outline"
        @click="setOutline(false)"
        v-html="ICONS.longForm"
      ></button>
      <span class="to-o-status-sep" aria-hidden="true"></span>
      <a
        :href="EDIT_ROOT + page.relativePath"
        target="_blank"
        rel="noreferrer"
        aria-label="Edit this page on GitHub"
        v-html="ICONS.edit"
      ></a>
    </div>
    <div v-if="tip" class="to-o-tip" :class="`is-${tip.side}`" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }" role="tooltip">
      {{ tip.text }}
    </div>
  </Teleport>
  <div
    v-if="enabled"
    ref="layer"
    class="to-o-layer"
    :class="{ 'is-on': outline }"
    @mouseover="showTip"
    @mouseleave="hideTip"
    @mousedown="hideTip"
  >
    <template v-if="outline">
      <div
        v-if="flash"
        class="to-o-flash"
        :style="{ left: `${flash.x}px`, top: `${flash.y}px`, width: `${flash.w}px`, height: `${flash.h}px` }"
        @animationend="flash = null"
      ></div>
      <button
        v-for="g in guides"
        :key="`g${g.node.id}`"
        type="button"
        class="to-o-guide"
        :class="{ 'is-path': path.has(g.node.id) }"
        :style="{ left: `${g.x}px`, top: `${g.top}px`, height: `${g.height}px` }"
        :data-tip="guideTip(g.node)"
        tabindex="-1"
        aria-hidden="true"
        @click="toggleChildren(g.node)"
      ></button>
      <template v-for="m in marks" :key="`m${m.node.id}`">
        <button
          v-if="m.foldable"
          type="button"
          class="to-o-chevron"
          :class="{ 'is-folded': m.node.folded, 'is-active': active === m.node }"
          :style="{ left: `${m.x}px`, top: `${m.y}px` }"
          :aria-label="m.node.folded ? 'Unfold' : 'Fold'"
          :aria-expanded="!m.node.folded"
          :data-tip="m.node.folded ? 'Unfold' : 'Fold'"
          @click="toggleFold(m.node)"
          v-html="ICONS.chevron"
        ></button>
        <button
          type="button"
          class="to-o-mark"
          :class="[`is-${m.node.kind}`, { 'is-path': path.has(m.node.id), 'is-current': active === m.node, 'is-folded': m.node.folded, 'is-ordinal': !!m.node.ordinal }]"
          :style="{ left: `${m.x}px`, top: `${m.y}px` }"
          :aria-label="`Zoom in to: ${labelOf(m.node)}`"
          :data-tip="m.node === zoomRoot ? undefined : 'Zoom in'"
          @click="zoomTo(m.node)"
        >
          <template v-if="m.node.ordinal">{{ m.node.ordinal }}</template>
          <span v-else v-html="ICONS[m.node.kind]"></span>
        </button>
      </template>
    </template>
  </div>
</template>
