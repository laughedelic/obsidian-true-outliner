# Edge Case Zoo

Structures that should exercise every rejection cue and mapping rule. Not a real note — a test rig.

Paragraph before a list claims it as children:

- claimed child one
- claimed child two

This column-0 paragraph closes the group above.

## Atoms

```python
# whole fence moves as one node; Enter inside = plain newline
def atom():
    return "opaque"
```

| a table | is an atom |
| --- | --- |
| Tab inside | behaves stock |

> [!note] Callouts too
> One node, chrome and all.

## Bounds

###### h6 — Tab here should reject with the level-bound cue

Only paragraph in its section — Shift+Tab here should reject (heading scope is positional).

## Ordered

1. first
2. second
3. third — Alt+Up twice, watch the renumbering
