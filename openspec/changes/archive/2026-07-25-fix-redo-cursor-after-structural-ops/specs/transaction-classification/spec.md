## MODIFIED Requirements

### Requirement: Grammar and command transactions are recognized as plugin-own
Transactions dispatched by this plugin's own keyboard grammar and structural commands
(identified by their `userEvent` annotations) SHALL be classified `plugin-own` and
passed through unmodified — they are valid by construction and MUST NOT be re-processed.

This includes the cursor re-assertion transaction that follows a structural operation
(see `structural-history-integration`): it is selection-only and carries a plugin-own
`userEvent`, so it SHALL be classified `plugin-own` rather than `selection-only`, and
therefore SHALL NOT be run through selection escalation or marker-transparent cursor
clamping — either of which could move the cursor it exists to record.

#### Scenario: Tab indent is not reclassified
- **WHEN** Tab indents a node via the outline keyboard grammar
- **THEN** the resulting transaction is classified `plugin-own` and applied exactly as
  the grammar produced it, including its cursor placement

#### Scenario: The cursor re-assertion is not reclassified
- **WHEN** a structural operation's cursor re-assertion transaction is dispatched
- **THEN** it is classified `plugin-own` and applied with its selection untouched,
  rather than being classified `selection-only` and escalated or clamped

**Covered by**: `e2e/specs/60-transaction-classification.e2e.ts`
("grammar/structural-command transactions are plugin-own…")
