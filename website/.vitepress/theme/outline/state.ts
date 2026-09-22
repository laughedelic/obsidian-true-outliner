import { reactive, ref } from 'vue';

const VIEW_KEY = 'true-outliner:docs-view';
const SEEN_KEY = 'true-outliner:docs-seen:';

/** Whether docs pages are drawn as outlines; the view, the backlinks footer
 * and the invitations in the pages all follow it. Long-form until chosen. */
export const outlineOn = ref(false);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A private window keeps the choice for the page only.
  }
}

export function loadView() {
  outlineOn.value = read(VIEW_KEY) === 'outline';
  for (const hint of Object.keys(seen) as Hint[]) seen[hint] = read(SEEN_KEY + hint) === '1';
}

export function setView(on: boolean) {
  outlineOn.value = on;
  write(VIEW_KEY, on ? 'outline' : 'long-form');
  if (on) markSeen('view');
}

/** The one-time hints: the outline view itself, and the two gestures a page
 * about them invites trying in place. Seen until loaded, so nothing flashes
 * up before the stored answer is known. */
export type Hint = 'view' | 'fold' | 'zoom';
export const seen = reactive<Record<Hint, boolean>>({ view: true, fold: true, zoom: true });

export function markSeen(hint: Hint) {
  if (seen[hint]) return;
  seen[hint] = true;
  write(SEEN_KEY + hint, '1');
}

/** A backlink row that was followed: the page it leads to and the text of
 * the node to point out there. */
export const pendingFlash = ref<{ path: string; text: string } | null>(null);

/** The footer's fold state, which the aside's backlinks list opens. */
export const footerOpen = ref(true);
export const closedGroups = reactive(new Set<string>());
