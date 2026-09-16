/**
 * Helpers the in-note filter's specs reach for.
 *
 * `renderedLines` is deliberately this module's own rather than shared with
 * `80-outline-zoom`, which carries an equivalent inline: the zoom spec is the
 * measurement that proved the hiding mechanism, and task 2.1 rests on it
 * passing with no edit. Two readers are not yet "what every spec reaches for",
 * which is what `e2e/helpers.ts` is for.
 */

/**
 * The text of every line the editor actually renders, in document order.
 *
 * `.cm-line` only. A block replacement is a child of `.cm-content` too and
 * `posAtDOM` resolves it — to the first position of the range it HIDES, which
 * would report a hidden line as rendered.
 */
export function renderedLines(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const lines = new Set<number>();
    for (const child of Array.from(content.querySelectorAll('.cm-line'))) {
      try {
        lines.add(cm.state.doc.lineAt(cm.posAtDOM(child as HTMLElement)).number);
      } catch {
        // Scaffolding (a viewport gap placeholder) has no document position.
      }
    }
    return [...lines].sort((a, b) => a - b).map((n) => cm.state.doc.line(n).text as string);
  });
}

/**
 * The height every rendered line occupies, keyed by its text.
 *
 * "Takes no space" is the claim a block replacement makes and the one a plain
 * `display: none` would also satisfy while leaving the line in the layout with
 * a collapsed box. Measuring the boxes that ARE drawn, and checking the hidden
 * ones draw none at all, is what tells those apart.
 */
export function renderedLineHeights(): Promise<Record<string, number>> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const out: Record<string, number> = {};
    for (const child of Array.from(cm.contentDOM.querySelectorAll('.cm-line'))) {
      const el = child as HTMLElement;
      out[el.innerText] = el.getBoundingClientRect().height;
    }
    return out;
  });
}

/** Are the note title and its properties block drawn? */
export function chromeVisible(): Promise<{ title: boolean; properties: boolean }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const root = view?.containerEl;
    const shown = (sel: string): boolean => {
      const el = root?.querySelector(sel) as HTMLElement | null;
      return !!el && el.getBoundingClientRect().height > 0;
    };
    return { title: shown('.inline-title'), properties: shown('.metadata-container') };
  });
}

/**
 * Which of this plugin's own chrome a rendered line carries.
 *
 * A line neighbouring a block replacement is the case
 * `docs/research/zoom-hiding-mechanism` found the hiding mechanism could strip:
 * every point decoration on a kept line is anchored at the position a range
 * reaching one position too far swallows, taking the marker sizing, the depth
 * variables and Obsidian's own list classes with it.
 *
 * A list item's bullet is Obsidian's OWN, not an element this plugin injects —
 * measured, after a first version of this helper looked for a marker icon and
 * reported a fully-chromed line as bare. What the plugin contributes to such a
 * line is the sizing that puts that bullet in our gutter, which is
 * `to-decor-marker-sp` plus `--to-marker-gutter`.
 */
export function lineChromeFor(text: string): Promise<{
  found: boolean;
  hasDepth: boolean;
  hasMarkerGutter: boolean;
  isOurListLine: boolean;
  isListLine: boolean;
}> {
  return browser.executeObsidian(({ app, obsidian }, wanted) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    for (const child of Array.from(cm.contentDOM.querySelectorAll('.cm-line'))) {
      const el = child as HTMLElement;
      if (el.innerText !== wanted) continue;
      return {
        found: true,
        hasDepth: el.style.getPropertyValue('--to-depth') !== '',
        hasMarkerGutter: el.style.getPropertyValue('--to-marker-gutter') !== '',
        isOurListLine: el.classList.contains('to-decor-marker-sp'),
        isListLine: el.classList.contains('HyperMD-list-line'),
      };
    }
    return {
      found: false,
      hasDepth: false,
      hasMarkerGutter: false,
      isOurListLine: false,
      isListLine: false,
    };
  }, text);
}

/** Set the active editor's filter query, or clear the filter with `null`. */
export function applyFilterQuery(query: string | null): Promise<void> {
  return browser.executeObsidian(({ plugins }, q) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plugins.trueOutliner as any).applyFilterQuery(q);
  }, query);
}

/** What the filter reports about the active editor: the query, and what it hit. */
export function filterReport(): Promise<{
  query: string;
  matched: boolean;
  count: number;
} | null> {
  return browser.executeObsidian(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ plugins }) => (plugins.trueOutliner as any).activeFilter(),
  );
}

/** Is the filter panel mounted, and what does it say? */
export function panelState(): Promise<{
  open: boolean;
  query: string;
  status: string;
  missed: boolean;
  focused: boolean;
} | null> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const panel = view?.containerEl.querySelector('.to-filter-panel') as HTMLElement | null;
    if (!panel) return { open: false, query: '', status: '', missed: false, focused: false };
    const input = panel.querySelector('.to-filter-input') as HTMLInputElement | null;
    return {
      open: true,
      query: input?.value ?? '',
      status: panel.querySelector('.to-filter-status')?.textContent ?? '',
      missed: !!input?.classList.contains('is-missed'),
      focused: document.activeElement === input,
    };
  });
}

/** Type into the panel's field the way a reader does, one input event. */
export function typeInPanel(text: string): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }, value) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const input = view?.containerEl.querySelector('.to-filter-input') as HTMLInputElement | null;
    if (!input) throw new Error('no filter panel');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

/** Press the panel's own close control. */
export function clickPanelClose(): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const close = view?.containerEl.querySelector('.to-filter-close') as HTMLElement | null;
    close?.click();
  });
}

/** The text of every match mark the editor is drawing. */
export function markedTexts(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    return Array.from(cm.contentDOM.querySelectorAll('mark.to-match')).map(
      (el) => (el as HTMLElement).textContent ?? '',
    );
  });
}
