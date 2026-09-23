/**
 * The cues a structural operation shows the user.
 *
 * Its own module so `messages.ts` — the table itself — stays free of
 * `obsidian` and reachable from the unit suite, which several modules on the
 * core side of the line import transitively.
 */

import { Notice } from 'obsidian';
import type { RejectionReason } from '../result';
import { REJECTION_MESSAGES } from './messages';

/**
 * The refusal the user sees, wherever the operation was asked for.
 *
 * Here rather than at each dispatch site: `selection-structural-ops` requires
 * the rejection cue to be one of the things every entry point gets from the
 * shared funnel rather than reproduces beside it, and there are now three.
 */
export function noticeRejection(reason: RejectionReason): void {
  new Notice(REJECTION_MESSAGES[reason], 1500);
}
