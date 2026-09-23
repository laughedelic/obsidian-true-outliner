/** Dragging's settings. */

import { toggle } from "./declare";

/**
 * Whether a touch can pick a node up. Off, and with no row in the tab: on a
 * phone the marks sit too close together to land a finger on one, and the
 * finger hides the place it aims at, so the gesture waits for an interface
 * of its own on touch (`drag-nodes-with-a-drop-preview` D12). A tablet pass
 * or a spec turns it on through `data.json`.
 */
const TOUCH_DRAGGING = toggle({ key: "touchDragging", default: false });

export const DRAGGING_SETTINGS = [TOUCH_DRAGGING] as const;
