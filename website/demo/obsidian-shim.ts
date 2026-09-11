/**
 * The `obsidian` module, as much of it as the editor extensions reach.
 *
 * The plugin's editor layer touches Obsidian through a handful of symbols:
 * `editorInfoField` (which note is open, and whether this editor is the active
 * one), `Notice` (the rejection cue), `Component` (a lifecycle handle for the
 * zoom trail), `MarkdownRenderer` (crumb text in the trail), and the DOM
 * helpers Obsidian adds to `Element.prototype`. Everything else that the
 * footer and the plugin shell import is stubbed just far enough to load.
 *
 * Vite aliases `obsidian` to this file for the website only; the plugin build
 * never sees it.
 */

import { Facet, StateField } from '@codemirror/state';

// ---- editorInfoField --------------------------------------------------------

export interface DemoFileInfo {
  file: { path: string; basename: string; name: string; extension: string; stat: { mtime: number } };
  app: DemoApp;
  editor?: undefined;
}

export interface DemoApp {
  workspace: { activeEditor: DemoFileInfo | null; on(): void; getLeavesOfType(): never[] };
  metadataCache: { getFileCache(): null; resolvedLinks: Record<string, never>; getFirstLinkpathDest(): null };
  vault: { getAbstractFileByPath(): null; adapter: Record<string, never> };
}

/** Supplied per editor: the note it stands for. */
export const demoFileInfo = Facet.define<DemoFileInfo, DemoFileInfo | null>({
  combine: (values) => values[0] ?? null,
});

export function makeFileInfo(path: string): DemoFileInfo {
  const basename = path.replace(/^.*\//, '').replace(/\.md$/, '');
  const info: DemoFileInfo = {
    file: { path, basename, name: `${basename}.md`, extension: 'md', stat: { mtime: Date.now() } },
    app: null as unknown as DemoApp,
  };
  info.app = {
    workspace: { activeEditor: info, on: () => undefined, getLeavesOfType: () => [] },
    metadataCache: { getFileCache: () => null, resolvedLinks: {}, getFirstLinkpathDest: () => null },
    vault: { getAbstractFileByPath: () => null, adapter: {} },
  };
  return info;
}

export const editorInfoField = StateField.define<DemoFileInfo | null>({
  create: (state) => state.facet(demoFileInfo),
  update: (value) => value,
});

export type MarkdownFileInfo = DemoFileInfo;

// ---- Notice -----------------------------------------------------------------

let noticeHost: HTMLElement | null = null;

function noticeContainer(): HTMLElement {
  if (noticeHost?.isConnected) return noticeHost;
  noticeHost = document.createElement('div');
  noticeHost.className = 'notice-container';
  document.body.appendChild(noticeHost);
  return noticeHost;
}

export class Notice {
  noticeEl: HTMLElement;
  constructor(message: string | DocumentFragment, duration = 5000) {
    this.noticeEl = document.createElement('div');
    this.noticeEl.className = 'notice';
    if (typeof message === 'string') this.noticeEl.textContent = message;
    else this.noticeEl.appendChild(message);
    noticeContainer().appendChild(this.noticeEl);
    if (duration > 0) window.setTimeout(() => this.hide(), duration);
  }
  setMessage(message: string): this {
    this.noticeEl.textContent = message;
    return this;
  }
  hide(): void {
    this.noticeEl.classList.add('mod-hidden');
    window.setTimeout(() => this.noticeEl.remove(), 200);
  }
}

// ---- Component --------------------------------------------------------------

export class Component {
  private children: Component[] = [];
  private disposers: Array<() => void> = [];
  private loaded = false;
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.onload();
    this.children.forEach((c) => c.load());
  }
  onload(): void {}
  unload(): void {
    if (!this.loaded) return;
    this.loaded = false;
    this.children.forEach((c) => c.unload());
    this.disposers.splice(0).forEach((d) => d());
    this.onunload();
  }
  onunload(): void {}
  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }
  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter((c) => c !== child);
    child.unload();
    return child;
  }
  register(dispose: () => void): void {
    this.disposers.push(dispose);
  }
  registerEvent(): void {}
  registerDomEvent(el: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    el.addEventListener(type, handler, options);
    this.register(() => el.removeEventListener(type, handler, options));
  }
  registerInterval(id: number): number {
    this.register(() => window.clearInterval(id));
    return id;
  }
}

// ---- Files, metadata, keymap ------------------------------------------------

export class TAbstractFile {
  path = '';
  name = '';
  parent: TFolder | null = null;
}
export class TFile extends TAbstractFile {
  basename = '';
  extension = 'md';
  stat = { mtime: 0, ctime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const hash = linktext.indexOf('#');
  return hash < 0
    ? { path: linktext, subpath: '' }
    : { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}

export function getAllTags(): string[] | null {
  return [];
}

export const Keymap = {
  isModEvent(evt: Event | null | undefined): 'tab' | false {
    const e = evt as MouseEvent | KeyboardEvent | null | undefined;
    return e && (e.metaKey || e.ctrlKey) ? 'tab' : false;
  },
};

export const Platform = {
  isMobile: false,
  isDesktop: true,
  isDesktopApp: false,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: navigator.platform.startsWith('Mac'),
  isWin: navigator.platform.startsWith('Win'),
  isLinux: false,
  isSafari: false,
};

export function setIcon(): void {}

// ---- MarkdownRenderer -------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Inline markdown to HTML, for the few constructs a crumb or a backlink row can
 * carry: emphasis, code, wiki links, external links, tags. Block structure is
 * not rendered; Obsidian's renderer wraps a paragraph in `<p>`, and callers
 * unwrap it, so the same wrapper is produced here.
 */
export function renderInlineMarkdown(source: string): string {
  let html = escapeHtml(source);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  html = html.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) =>
      `<a class="internal-link" data-href="${target}" href="${target}">${alias ?? target}</a>`,
  );
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="external-link" href="$2" rel="noopener">$1</a>',
  );
  html = html.replace(/(^|\s)#([\w/-]+)/g, '$1<a class="tag" href="#$2">#$2</a>');
  return html;
}

export const MarkdownRenderer = {
  render(_app: unknown, source: string, el: HTMLElement, _path: string, _component: unknown): Promise<void> {
    const p = document.createElement('p');
    p.innerHTML = renderInlineMarkdown(source);
    el.appendChild(p);
    return Promise.resolve();
  },
  renderMarkdown(source: string, el: HTMLElement, path: string, component: unknown): Promise<void> {
    return MarkdownRenderer.render(null, source, el, path, component);
  },
};

// ---- Shell classes the footer and plugin modules import ---------------------

export class App {}
export class MarkdownView {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class Menu {}
export type Editor = unknown;
export type CachedMetadata = unknown;
export type Reference = unknown;
export type Vault = unknown;
export type Hotkey = unknown;
export type SettingDefinitionItem = unknown;

// ---- DOM helpers ------------------------------------------------------------

type DomElementInfo = {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
};

function applyInfo(el: HTMLElement, info?: string | DomElementInfo): void {
  if (!info) return;
  if (typeof info === 'string') {
    el.className = info;
    return;
  }
  if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/)).filter(Boolean));
  if (info.text !== undefined) {
    if (typeof info.text === 'string') el.textContent = info.text;
    else el.appendChild(info.text);
  }
  if (info.attr) for (const [k, v] of Object.entries(info.attr)) v === null ? el.removeAttribute(k) : el.setAttribute(k, String(v));
  if (info.title !== undefined) el.title = info.title;
  if (info.value !== undefined && 'value' in el) (el as HTMLInputElement).value = info.value;
  if (info.type !== undefined && 'type' in el) (el as HTMLInputElement).type = info.type;
  if (info.placeholder !== undefined && 'placeholder' in el) (el as HTMLInputElement).placeholder = info.placeholder;
  if (info.href !== undefined && 'href' in el) (el as HTMLAnchorElement).href = info.href;
}

function define(proto: object, name: string, fn: (...args: never[]) => unknown): void {
  if (name in proto) return;
  Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
}

/** Obsidian's `Element.prototype` additions, installed once on import. */
function installDomHelpers(): void {
  if (typeof Element === 'undefined') return;
  const N = Node.prototype as unknown as Record<string, unknown>;
  const E = Element.prototype as unknown as Record<string, unknown>;

  define(N, 'createEl', function (this: Node, tag: string, info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) {
    const el = document.createElement(tag);
    applyInfo(el, info);
    const parent = (typeof info === 'object' && info.parent) || this;
    if (typeof info === 'object' && info.prepend) parent.insertBefore(el, parent.firstChild);
    else parent.appendChild(el);
    cb?.(el);
    return el;
  });
  define(N, 'createDiv', function (this: Node & { createEl: Function }, info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) {
    return this.createEl('div', info, cb);
  });
  define(N, 'createSpan', function (this: Node & { createEl: Function }, info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) {
    return this.createEl('span', info, cb);
  });
  define(N, 'createSvg', function (this: Node, tag: string, info?: string | DomElementInfo) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (typeof info === 'string') el.setAttribute('class', info);
    else if (info?.cls) el.setAttribute('class', Array.isArray(info.cls) ? info.cls.join(' ') : info.cls);
    if (typeof info === 'object' && info.attr) for (const [k, v] of Object.entries(info.attr)) if (v !== null) el.setAttribute(k, String(v));
    this.appendChild(el);
    return el;
  });
  define(N, 'setText', function (this: Node, text: string | DocumentFragment) {
    if (typeof text === 'string') this.textContent = text;
    else {
      this.textContent = '';
      this.appendChild(text);
    }
  });
  define(N, 'appendText', function (this: Node, text: string) {
    this.appendChild(document.createTextNode(text));
  });
  define(N, 'empty', function (this: Node) {
    while (this.firstChild) this.removeChild(this.firstChild);
  });
  define(N, 'detach', function (this: Node) {
    this.parentNode?.removeChild(this);
  });
  define(N, 'instanceOf', function (this: Node, type: Function) {
    return this instanceof type;
  });
  define(E, 'addClass', function (this: Element, ...cls: string[]) {
    this.classList.add(...cls.flatMap((c) => c.split(/\s+/)).filter(Boolean));
  });
  define(E, 'addClasses', function (this: Element, cls: string[]) {
    this.classList.add(...cls);
  });
  define(E, 'removeClass', function (this: Element, ...cls: string[]) {
    this.classList.remove(...cls.flatMap((c) => c.split(/\s+/)).filter(Boolean));
  });
  define(E, 'removeClasses', function (this: Element, cls: string[]) {
    this.classList.remove(...cls);
  });
  define(E, 'toggleClass', function (this: Element, cls: string | string[], on: boolean) {
    for (const c of Array.isArray(cls) ? cls : cls.split(/\s+/)) if (c) this.classList.toggle(c, on);
  });
  define(E, 'hasClass', function (this: Element, cls: string) {
    return this.classList.contains(cls);
  });
  define(E, 'setAttr', function (this: Element, name: string, value: string | number | boolean | null) {
    value === null ? this.removeAttribute(name) : this.setAttribute(name, String(value));
  });
  define(E, 'setAttrs', function (this: Element, attrs: Record<string, string | number | boolean | null>) {
    for (const [k, v] of Object.entries(attrs)) v === null ? this.removeAttribute(k) : this.setAttribute(k, String(v));
  });
  define(E, 'getAttr', function (this: Element, name: string) {
    return this.getAttribute(name);
  });
  define(E, 'find', function (this: Element, selector: string) {
    return this.querySelector(selector);
  });
  define(E, 'findAll', function (this: Element, selector: string) {
    return Array.from(this.querySelectorAll(selector));
  });
  define(E, 'setCssProps', function (this: HTMLElement, props: Record<string, string | null>) {
    for (const [k, v] of Object.entries(props)) v === null ? this.style.removeProperty(k) : this.style.setProperty(k, v);
  });
  define(E, 'setCssStyles', function (this: HTMLElement, styles: Record<string, string>) {
    Object.assign(this.style, styles);
  });
  define(E, 'getCssPropertyValue', function (this: HTMLElement, prop: string) {
    return getComputedStyle(this).getPropertyValue(prop);
  });
  define(E, 'show', function (this: HTMLElement) {
    this.style.display = '';
  });
  define(E, 'hide', function (this: HTMLElement) {
    this.style.display = 'none';
  });
  define(E, 'toggle', function (this: HTMLElement, show: boolean) {
    this.style.display = show ? '' : 'none';
  });
  define(E, 'isShown', function (this: HTMLElement) {
    return this.style.display !== 'none';
  });
  define(E, 'onClickEvent', function (this: HTMLElement, listener: (ev: MouseEvent) => void) {
    this.addEventListener('click', listener);
  });
  define(E, 'matchParent', function (this: Element, selector: string) {
    return this.closest(selector);
  });
  const W = window as unknown as Record<string, unknown>;
  if (!('activeDocument' in W)) Object.defineProperty(W, 'activeDocument', { get: () => document });
  if (!('activeWindow' in W)) Object.defineProperty(W, 'activeWindow', { get: () => window });
  // Obsidian also exposes detached-element constructors as globals.
  const detached = (tag: string, info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) => {
    const el = document.createElement(tag);
    applyInfo(el, info);
    if (typeof info === 'object' && info.parent) info.parent.appendChild(el);
    cb?.(el);
    return el;
  };
  W.createEl ??= detached;
  W.createDiv ??= (info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) => detached('div', info, cb);
  W.createSpan ??= (info?: string | DomElementInfo, cb?: (el: HTMLElement) => void) => detached('span', info, cb);
  W.createFragment ??= (cb?: (f: DocumentFragment) => void) => {
    const f = document.createDocumentFragment();
    cb?.(f);
    return f;
  };
  W.createSvg ??= (tag: string, info?: string | DomElementInfo) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (typeof info === 'string') el.setAttribute('class', info);
    else if (info?.cls) el.setAttribute('class', Array.isArray(info.cls) ? info.cls.join(' ') : info.cls);
    if (typeof info === 'object' && info.attr) for (const [k, v] of Object.entries(info.attr)) if (v !== null) el.setAttribute(k, String(v));
    return el;
  };
}

installDomHelpers();
