/**
 * Re-exported from core (src/locate.ts) — moved there so classify.ts and
 * escalate.ts can resolve node boundaries without src/ depending on
 * src/plugin/. Kept here so existing CM6-adapter imports (main.ts,
 * grammar.ts) don't need to change.
 */

export { nodeAtLine } from '../locate';
