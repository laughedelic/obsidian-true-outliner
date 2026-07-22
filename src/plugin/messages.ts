/** One table: typed rejection reasons → short human-readable cues. */

import type { RejectionReason } from '../result';

export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  'node-not-found': 'No outline node at the cursor.',
  'at-h1-bound': "Can't outdent past heading level 1.",
  'at-h6-bound': "Can't indent past heading level 6.",
  'no-previous-sibling': 'Nothing above to indent under.',
  'at-top-level': 'Already at the top level.',
  'no-sibling-above': 'Nothing above to move past.',
  'no-sibling-below': 'Nothing below to move past.',
  'not-expressible-under-target': "Markdown can't express that nesting here.",
  'cannot-reorder-across-heading-boundary': 'Sections only swap with same-level sections.',
  'cannot-split': "This block can't be split here.",
  'empty-selection': 'Nothing to act on.',
  'non-contiguous-subtrees': "Can't remove a partial selection — select whole nodes.",
  'no-following-neighbor': 'Nothing here to join with.',
  'would-orphan-children': "Joining here would leave a node's children without a parent.",
  'merge-not-expressible': "These blocks can't be joined into one.",
  'insertion-not-expressible': "Markdown can't express that content here.",
};
