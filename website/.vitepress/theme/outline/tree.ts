/**
 * Reads a rendered docs page as the outline the plugin would read its
 * markdown as. The rules are the plugin's own mapping, applied to HTML:
 * headings nest by level, everything between two headings belongs to the
 * first, a list that follows a paragraph is that paragraph's children, list
 * items nest by their lists, and code, tables, callouts, quotes and media are
 * leaves. Nothing in the page is moved or wrapped; nodes only point at the
 * elements VitePress rendered.
 */

export type Kind = 'heading' | 'paragraph' | 'item' | 'code' | 'table' | 'callout' | 'quote' | 'hr' | 'media';

export interface ONode {
  id: number;
  el: HTMLElement;
  kind: Kind;
  depth: number;
  parent: ONode | null;
  children: ONode[];
  /** An ordered item's number, as the list renders it. */
  ordinal?: string;
  folded: boolean;
}

export interface OTree {
  roots: ONode[];
  /** Every node, in document order. */
  nodes: ONode[];
  /** Every list element that holds item nodes, outermost first. */
  lists: HTMLElement[];
  /** Lists that are direct children of the page, which carry their own depth. */
  topLists: Map<HTMLElement, number>;
  byEl: WeakMap<Element, ONode>;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);

function kindOf(el: HTMLElement): Kind {
  const tag = el.tagName;
  if (tag === 'P') return 'paragraph';
  if (tag === 'TABLE') return 'table';
  if (tag === 'BLOCKQUOTE') return 'quote';
  if (tag === 'HR') return 'hr';
  if (tag === 'PRE' || /\blanguage-/.test(el.className)) return 'code';
  if (el.classList.contains('custom-block')) return 'callout';
  return 'media';
}

export function buildTree(root: HTMLElement): OTree {
  const tree: OTree = { roots: [], nodes: [], lists: [], topLists: new Map(), byEl: new WeakMap() };
  let nextId = 0;

  const add = (el: HTMLElement, kind: Kind, parent: ONode | null, extra: Partial<ONode> = {}): ONode => {
    const node: ONode = {
      id: nextId++,
      el,
      kind,
      depth: parent ? parent.depth + 1 : 0,
      parent,
      children: [],
      folded: false,
      ...extra,
    };
    (parent ? parent.children : tree.roots).push(node);
    tree.nodes.push(node);
    tree.byEl.set(el, node);
    return node;
  };

  const addItems = (list: HTMLElement, parent: ONode | null) => {
    tree.lists.push(list);
    const ordered = list.tagName === 'OL';
    let n = ordered ? Number(list.getAttribute('start') ?? 1) : 0;
    for (const li of Array.from(list.children) as HTMLElement[]) {
      if (li.tagName !== 'LI') continue;
      const item = add(li, 'item', parent, ordered ? { ordinal: `${n++}.` } : {});
      for (const child of Array.from(li.children) as HTMLElement[]) {
        if (child.tagName === 'UL' || child.tagName === 'OL') addItems(child, item);
      }
    }
  };

  // The open headings, outermost first: a heading's parent is the nearest
  // open heading of a lower level.
  const open: Array<{ level: number; node: ONode }> = [];
  let lastParagraph: ONode | null = null;

  for (const el of Array.from(root.children) as HTMLElement[]) {
    if (SKIP.has(el.tagName) || el.hidden) continue;
    const heading = /^H([1-6])$/.exec(el.tagName);
    if (heading) {
      const level = Number(heading[1]);
      while (open.length && open[open.length - 1]!.level >= level) open.pop();
      const node = add(el, 'heading', open.length ? open[open.length - 1]!.node : null);
      open.push({ level, node });
      lastParagraph = null;
      continue;
    }
    const section = open.length ? open[open.length - 1]!.node : null;
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      const parent = lastParagraph ?? section;
      tree.topLists.set(el, parent ? parent.depth + 1 : 0);
      addItems(el, parent);
      lastParagraph = null;
      continue;
    }
    const kind = kindOf(el);
    const node = add(el, kind, section);
    lastParagraph = kind === 'paragraph' ? node : null;
  }
  return tree;
}

export function descendants(node: ONode): ONode[] {
  const out: ONode[] = [];
  const walk = (n: ONode) => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function ancestors(node: ONode): ONode[] {
  const out: ONode[] = [];
  for (let p = node.parent; p; p = p.parent) out.unshift(p);
  return out;
}

/** The node's own text, for a breadcrumb: the element's text without the
 * lists nested inside it. */
export function labelOf(node: ONode, max = 48): string {
  let text = '';
  for (const child of Array.from(node.el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? '';
    else if (child instanceof HTMLElement && !/^(UL|OL)$/.test(child.tagName) && !child.classList.contains('header-anchor')) {
      text += child.textContent ?? '';
    }
  }
  text = text.replace(/​/g, '').replace(/\s+/g, ' ').trim();
  if (!text) text = node.kind === 'code' ? 'Code' : node.kind === 'table' ? 'Table' : node.kind === 'media' ? 'Figure' : node.kind;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
