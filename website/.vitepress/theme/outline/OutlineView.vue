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

const STORAGE_KEY = 'true-outliner:docs-view';

interface Mark {
  node: ONode;
  x: number;
  y: number;
  foldable: boolean;
}
interface Guide {
  node: ONode;
  x: number;
  top: number;
  height: number;
}

const { frontmatter, page } = useData();
const enabled = computed(() => frontmatter.value.outlineView !== false);
const outline = ref(true);
const layer = ref<HTMLElement | null>(null);
const tree = shallowRef<OTree | null>(null);
// Shallow: a node must stay the object the tree holds, not a reactive proxy
// of it, or identity checks against the tree's own sets fail.
const marks = shallowRef<Mark[]>([]);
const guides = shallowRef<Guide[]>([]);
const zoomRoot = shallowRef<ONode | null>(null);
const active = shallowRef<ONode | null>(null);
const version = ref(0);
let content: HTMLElement | null = null;
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

function refresh() {
  applyVisibility();
  version.value++;
  void nextTick(schedule);
}

function rebuild() {
  content = contentRoot();
  resize?.disconnect();
  zoomRoot.value = null;
  active.value = null;
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
  refresh();
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
}

/** A click on a guide folds the branch's children, or opens them all again:
 * the gesture for reading one branch by closing the ones beside it. */
function toggleChildren(node: ONode) {
  const foldable = node.children.filter((c) => c.children.length);
  if (!foldable.length) return;
  const anyOpen = foldable.some((c) => !c.folded);
  for (const c of foldable) c.folded = anyOpen;
  refresh();
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
  rebuild();
  document.addEventListener('mouseover', onOver, { passive: true });
  window.addEventListener('load', schedule);
  document.fonts?.ready.then(schedule).catch(() => undefined);
});
onContentUpdated(rebuild);
onBeforeUnmount(() => {
  document.removeEventListener('mouseover', onOver);
  window.removeEventListener('load', schedule);
  resize?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <nav v-if="enabled && outline && zoomRoot" class="to-o-trail" aria-label="Zoom trail">
    <button type="button" class="to-o-crumb to-o-crumb-page" @click="zoomTo(null)" title="Zoom out fully">
      <span class="to-o-zoomout" aria-hidden="true" v-html="ICONS.zoomOut"></span>{{ page.title }}
    </button>
    <template v-for="a in trail" :key="a.id">
      <span class="to-o-sep" aria-hidden="true">›</span>
      <button type="button" class="to-o-crumb" @click="zoomTo(a)">{{ labelOf(a) }}</button>
    </template>
  </nav>
  <Teleport to="body">
    <div v-if="enabled" class="to-o-status" role="toolbar" aria-label="Page view">
      <template v-if="outline">
        <button type="button" title="Fold all" aria-label="Fold all" @click="foldAll(true)" v-html="ICONS.foldAll"></button>
        <button
          type="button"
          title="Unfold all"
          aria-label="Unfold all"
          :disabled="!anyFolded"
          @click="foldAll(false)"
          v-html="ICONS.unfoldAll"
        ></button>
        <span class="to-o-status-sep" aria-hidden="true"></span>
      </template>
      <button
        type="button"
        title="Outline view"
        aria-label="Outline view"
        :aria-pressed="outline"
        @click="setOutline(true)"
        v-html="ICONS.outline"
      ></button>
      <button
        type="button"
        title="Long-form view"
        aria-label="Long-form view"
        :aria-pressed="!outline"
        @click="setOutline(false)"
        v-html="ICONS.longForm"
      ></button>
    </div>
  </Teleport>
  <div v-if="enabled" ref="layer" class="to-o-layer" :class="{ 'is-on': outline }" aria-hidden="false">
    <template v-if="outline">
      <button
        v-for="g in guides"
        :key="`g${g.node.id}`"
        type="button"
        class="to-o-guide"
        :class="{ 'is-path': path.has(g.node.id) }"
        :style="{ left: `${g.x}px`, top: `${g.top}px`, height: `${g.height}px` }"
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
          @click="toggleFold(m.node)"
          v-html="ICONS.chevron"
        ></button>
        <button
          type="button"
          class="to-o-mark"
          :class="[`is-${m.node.kind}`, { 'is-path': path.has(m.node.id), 'is-current': active === m.node, 'is-folded': m.node.folded, 'is-ordinal': !!m.node.ordinal }]"
          :style="{ left: `${m.x}px`, top: `${m.y}px` }"
          :aria-label="`Zoom in to: ${labelOf(m.node)}`"
          @click="zoomTo(m.node)"
        >
          <template v-if="m.node.ordinal">{{ m.node.ordinal }}</template>
          <span v-else v-html="ICONS[m.node.kind]"></span>
        </button>
      </template>
    </template>
  </div>
</template>
