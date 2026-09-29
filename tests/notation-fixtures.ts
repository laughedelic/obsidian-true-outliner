// Fixtures: `GOLD` is what the layout script printed before the notation moved into a module;
// `DRAWN` are blocks copied verbatim from the tracker (`docs/research/drawn-case-files`).
export const GOLD: Record<string, { input: string; output: string }> = {
  "the skill example": {
    input: "=== before\n- a\n▒- b\n∅\n\n=== after\n- a┃\n∅\n",
    output: " before    after\n┆- a      ┆- a┃\n▒- b      ┆∅\n┆∅\n",
  },
  "a paste with a clipboard column": {
    input: "=== clipboard\n- x\n  - y\n\n=== before\n- a\n▒- b\n∅\n\n=== actual\n- a\n- x\n  - y┃\n∅\n\n=== expected\n- a\n- x\n  - y┃\n",
    output: " clipboard    before    actual    expected\n┆- x         ┆- a      ┆- a      ┆- a\n┆  - y       ▒- b      ┆- x      ┆- x\n             ┆∅        ┆  - y┃   ┆  - y┃\n                       ┆∅\n",
  },
  "tabs, touching spaces and trailing spaces": {
    input: "=== before\n\t- a\n \t- b  \n   \n- c ┃\n∅\n\n=== after\n\t\t- «big»┃ c\n\t  - d ‸\n",
    output: " before      after\n┆→ - a      ┆→ → - b̲i̲g̲┃ c\n┆·→ - b··   ┆→ ··- d·‸\n┆···\n┆- c·┃\n┆∅\n",
  },
  "a header wider than its column": {
    input: "=== a much longer header\nx┃\n\n=== b\n\ty\n",
    output: " a much longer header    b\n┆x┃                     ┆→ y\n",
  },
  "a selection inside one line": {
    input: "=== sel\n- «one two»┃ three\n┃«a»\n",
    output: " sel\n┆- o̲n̲e̲ ̲t̲w̲o̲┃ three\n┆┃a̲\n",
  },
};

export const DRAWN: Record<string, string> = {
  "a tab, #280": " clipboard    main          this PR\n┆- p         ┆  - p        ┆  - p\n┆  - n       ┆    - n      ┆    - n\n┆⏵   1. m    ┆··⏵   1. m   ┆      1. m\n┆⏵   text    ┆··⏵   text   ┆      text",
  "a block selection, #269": " before     actual     expected\n┆1. p      ┆1. p      ┆1. p\n┆   1. a   ┆   1. a   ┆   1. a┃\n▒   2. b   ┆          ┆   2. c\n┆   3. c   ┆   2. c   ┆2. q\n┆2. q      ┆3. q",
  "the end of the text, #165": " before    was      now\n┆- a      ┆- a┃∅   ┆- a┃\n▒- b               ┆∅\n▒- c\n┆∅",
  "a clipboard column, #264": " clipboard         before          actual          after the fix\n┆    first        ┆## H┃          ┆## H           ┆## H\n┆                 ┆> real quote   ┆first          ┆first\n┆    <!-- c -->                   ┆               ┆\n                                  ┆<!-- c -->     ┆<!-- c -->\n                                  ┆> real quote   ┆\n                                                  ┆> real quote",
  "a hand alignment, #246": " before    main       this branch\n┆- item   ┆- item┃   ┆- item┃\n▒para     ┆  ---     ┆\n▒                    ┆  ---\n┆  ---",
};
