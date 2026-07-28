## MODIFIED Requirements

### Requirement: Grammar and command transactions are recognized as plugin-own
Transactions dispatched by this plugin's own keyboard grammar and structural commands
(identified by their `userEvent` annotations) SHALL be classified `plugin-own` and
passed through unmodified — they are valid by construction and MUST NOT be re-processed.

#### Scenario: Tab indent is not reclassified
- **WHEN** Tab indents a node via the outline keyboard grammar
- **THEN** the resulting transaction is classified `plugin-own` and applied exactly as
  the grammar produced it, including its cursor placement

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts`
("grammar/structural-command transactions are plugin-own…")

This requirement previously also covered the structural-history cursor-reassertion
transaction (a scenario now removed). That re-assertion still exists — narrowed to the
operations that choose their own cursor (`structural-history-integration`) — but it is
no longer classified at all: it dispatches with `filter: false`, so the enforcement
funnel never observes it, which is what the plugin-own entry existed to achieve. The
`select.structural` userEvent is therefore removed from the plugin-own set. The
Tab/grammar scenario above and the rest of the plugin-own `userEvent` set are otherwise
unchanged.
