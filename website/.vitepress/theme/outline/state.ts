import { reactive, ref } from 'vue';

/** Whether docs pages are drawn as outlines; the view and the backlinks
 * footer both follow it. */
export const outlineOn = ref(true);

/** A backlink row that was followed: the page it leads to and the text of
 * the node to point out there. */
export const pendingFlash = ref<{ path: string; text: string } | null>(null);

/** The footer's fold state, which the aside's backlinks list opens. */
export const footerOpen = ref(true);
export const closedGroups = reactive(new Set<string>());
