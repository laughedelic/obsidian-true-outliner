/**
 * The docs' own backlinks, gathered at build time: for every page, the nodes
 * in other pages that link to it, each with its ancestors and one level of its
 * children. The pages are read by the plugin's mapping rules, the same ones
 * `tree.ts` applies to the rendered HTML, so a row in the footer is the node a
 * reader would find on the source page.
 */
import { readFileSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';
import { createMarkdownRenderer, defineLoader, type SiteConfig } from 'vitepress';
import type { Kind } from './tree';

export interface BacklinkRow {
  depth: number;
  kind: Kind;
  ordinal?: string;
  html: string;
  /** Present for its place in the lineage only. */
  dim: boolean;
  /** Descendants not shown, for a child drawn without its own children. */
  hidden: number;
  /** The nearest heading's anchor on the source page. */
  hash: string;
}
export interface BacklinkGroup {
  title: string;
  folder: string;
  url: string;
  count: number;
  rows: BacklinkRow[];
}
export type Backlinks = Record<string, BacklinkGroup[]>;

declare const data: Backlinks;
export { data };

interface MdNode {
  id: number;
  kind: Kind;
  text: string;
  ordinal?: string;
  parent: MdNode | null;
  children: MdNode[];
  /** Table rows, which carry links one at a time. */
  rows?: string[];
}

const FOLDERS: Record<string, string> = { guide: 'Guide', reference: 'Reference', compare: 'Compared to' };
const LINK = /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g;

function parse(source: string): MdNode[] {
  const nodes: MdNode[] = [];
  let id = 0;
  const add = (kind: Kind, text: string, parent: MdNode | null, extra: Partial<MdNode> = {}): MdNode => {
    const node: MdNode = { id: id++, kind, text, parent, children: [], ...extra };
    parent?.children.push(node);
    nodes.push(node);
    return node;
  };

  const lines = source.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const open: Array<{ level: number; node: MdNode }> = [];
  let items: Array<{ indent: number; node: MdNode }> = [];
  let listParent: MdNode | null = null;
  let lastParagraph: MdNode | null = null;
  let continuing: MdNode | null = null;
  let fence: string | null = null;
  let container: MdNode | null = null;
  const section = () => (open.length ? open[open.length - 1]!.node : null);

  for (const raw of lines) {
    if (fence) {
      if (raw.trim().startsWith(fence)) fence = null;
      continue;
    }
    const fenced = /^\s*(```+|~~~+)/.exec(raw);
    if (fenced) {
      fence = fenced[1]!;
      add('code', '', section());
      items = [];
      lastParagraph = continuing = null;
      continue;
    }
    if (/^:::/.test(raw)) {
      container = container ? null : add('callout', '', section());
      items = [];
      lastParagraph = continuing = null;
      continue;
    }
    if (container) {
      container.text += `${container.text ? ' ' : ''}${raw.trim()}`;
      continue;
    }
    if (!raw.trim()) {
      continuing = null;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) {
      const level = heading[1]!.length;
      while (open.length && open[open.length - 1]!.level >= level) open.pop();
      open.push({ level, node: add('heading', heading[2]!.trim(), section()) });
      items = [];
      lastParagraph = continuing = null;
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (item) {
      const indent = item[1]!.replace(/\t/g, '    ').length;
      if (!items.length) listParent = lastParagraph ?? section();
      while (items.length && items[items.length - 1]!.indent >= indent) items.pop();
      const parent = items.length ? items[items.length - 1]!.node : listParent;
      const ordinal = /\d/.test(item[2]!) ? item[2]!.replace(')', '.') : undefined;
      const node = add('item', item[3]!.trim(), parent, { ordinal });
      items.push({ indent, node });
      lastParagraph = null;
      continuing = node;
      continue;
    }
    if (continuing && (continuing.kind === 'paragraph' || /^\s/.test(raw))) {
      continuing.text += ` ${raw.trim()}`;
      continue;
    }
    items = [];
    lastParagraph = null;
    if (/^\s*\|/.test(raw)) {
      const last = nodes[nodes.length - 1];
      const table = last?.kind === 'table' && continuing === last ? last : add('table', '', section(), { rows: [] });
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(raw)) table.rows!.push(raw);
      continuing = table;
      continue;
    }
    if (/^\s*</.test(raw)) {
      add('media', '', section());
      continuing = null;
      continue;
    }
    if (/^\s*>/.test(raw)) {
      continuing = add('quote', raw.replace(/^\s*>\s?/, ''), section());
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(raw)) {
      add('hr', '', section());
      continuing = null;
      continue;
    }
    lastParagraph = continuing = add('paragraph', raw.trim(), section());
  }
  return nodes;
}

function plain(markdown: string): string {
  return markdown
    .replace(LINK, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function slugify(text: string): string {
  return plain(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** `guide/zoom.md` is `/guide/zoom`, and an index is its folder. */
function keyOf(relativePath: string): string {
  return `/${relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')}`;
}

function countDescendants(node: MdNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

export default defineLoader({
  watch: ['../../../guide/**/*.md', '../../../reference/**/*.md', '../../../compare/**/*.md'],
  async load(files: string[]): Promise<Backlinks> {
    const config = (globalThis as unknown as { VITEPRESS_CONFIG: SiteConfig }).VITEPRESS_CONFIG;
    const md = await createMarkdownRenderer(config.srcDir, config.markdown, config.site.base, config.logger);
    const order = Object.keys(FOLDERS);
    const pages = files
      .map((file) => relative(config.srcDir, resolve(file)).split('\\').join('/'))
      .sort((a, b) => order.indexOf(a.split('/')[0]!) - order.indexOf(b.split('/')[0]!) || a.localeCompare(b));
    const known = new Set(pages.map(keyOf));
    const out: Backlinks = {};

    for (const page of pages) {
      const from = keyOf(page);
      const dir = posix.dirname(`/${page}`);
      const nodes = parse(readFileSync(resolve(config.srcDir, page), 'utf8'));
      const title = plain(nodes.find((n) => n.kind === 'heading')?.text ?? page);

      /** A link's target as a page key and hash, or null when it leaves the docs. */
      const target = (href: string): { key: string; hash: string } | null => {
        if (/^([a-z]+:|#|\/\/)/i.test(href)) return null;
        const [path = '', hash = ''] = href.split('#');
        const key = keyOf(posix.resolve(dir, path).slice(1) + (path.endsWith('/') ? '/index' : ''));
        return known.has(key) ? { key, hash: hash ? `#${hash}` : '' } : null;
      };
      const render = (text: string) =>
        md.renderInline(
          text.replace(LINK, (whole, label: string, href: string) => {
            const t = target(href);
            return t ? `[${label}](${t.key}${t.hash})` : whole;
          }),
          { cleanUrls: true },
        );
      const textOf = (node: MdNode, row?: string) =>
        row !== undefined
          ? row
              .split('|')
              .map((c) => c.trim())
              .filter(Boolean)
              .join(' · ')
          : node.text;

      // Per target: the referencing nodes, and for a table the rows that link.
      const refs = new Map<string, Map<MdNode, string[]>>();
      const note = (key: string, node: MdNode, text: string) => {
        if (key === from) return;
        const byNode = refs.get(key) ?? new Map<MdNode, string[]>();
        byNode.set(node, [...(byNode.get(node) ?? []), text]);
        refs.set(key, byNode);
      };
      for (const node of nodes) {
        for (const text of node.rows ?? [node.text]) {
          const seen = new Set<string>();
          for (const m of text.matchAll(LINK)) {
            const t = target(m[2]!);
            if (t && !seen.has(t.key)) note(t.key, node, textOf(node, node.rows ? text : undefined));
            if (t) seen.add(t.key);
          }
        }
      }

      for (const [key, byNode] of refs) {
        const full = new Set<MdNode>();
        const shown = new Set<MdNode>();
        for (const node of byNode.keys()) {
          full.add(node);
          shown.add(node);
          for (const c of node.children) {
            full.add(c);
            shown.add(c);
          }
          for (let p = node.parent; p?.parent; p = p.parent) shown.add(p);
        }
        const rows: BacklinkRow[] = [];
        for (const node of nodes) {
          if (!shown.has(node)) continue;
          let depth = -1;
          let hash = '';
          for (let p: MdNode | null = node; p?.parent; p = p.parent) {
            depth++;
            if (!hash && p.kind === 'heading') hash = `#${slugify(p.text)}`;
          }
          const hidden = node.children.some((c) => shown.has(c)) ? 0 : countDescendants(node);
          const base = { depth: Math.max(depth, 0), kind: node.kind, ordinal: node.ordinal, dim: !full.has(node), hidden, hash };
          const texts = byNode.get(node) ?? [node.text];
          for (const text of texts) rows.push({ ...base, html: render(text) });
        }
        const count = [...byNode.values()].reduce((n, t) => n + t.length, 0);
        (out[key] ??= []).push({
          title,
          folder: FOLDERS[page.split('/')[0]!] ?? '',
          url: from,
          count,
          rows,
        });
      }
    }
    return out;
  },
});
