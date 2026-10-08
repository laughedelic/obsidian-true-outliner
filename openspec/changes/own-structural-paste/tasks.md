# Tasks

## 1. Take the structural paste

- [ ] 1.1 Write the clipboard-text choice in `src/paste-text.ts` as a pure function of the
  clipboard's entries and file count, with the HTML inspection (sanitized, serialized, a lone image
  or not) and the converter passed in as functions of strings; the handler passes Obsidian's. It
  returns the text and its source: the plain text, Markdown, or converted HTML. Unit-test it in
  `tests/paste-text.test.ts` with stand-ins for the two functions, against Obsidian's order
  (`docs/research/obsidian-smart-list-paste`, "A version-independent entry point"). Every fixture
  that holds Markdown or HTML also holds a `text/plain` that differs from it, as a real clipboard
  does. The rows:
  - Obsidian's own copy gives its plain text, from the plain text, also before `text/markdown`;
    `text/markdown` wins over HTML;
  - other HTML goes through the inspection, then the converter, also beside a file, from HTML;
  - HTML the inspection calls a lone image, beside a file, gives the plain text, where Obsidian's
    paste would insert the file; without a file it is converted;
  - a plain text beside a file, with no HTML or Markdown, is the plain text, where Obsidian's paste
    would insert the file (the maintainer's decisions);
  - a plain text beside a different `text/uri-list`, a `text/uri-list` alone, files alone and
    `obsidian/properties` give nothing;
  - plain text alone is itself, from the plain text.

  Negative control: a choice that prefers `text/plain` fails the Markdown and HTML rows; one that
  gives nothing whenever files are present fails the HTML-beside-a-file and the two
  plain-beside-a-file rows; one that names every source plain fails the source rows.
- [ ] 1.2 Write the decision whether to take a paste as a structural one as a pure function of the
  editor state and the text, and unit-test it: taken for each payload of the note's
  version-independent table (case 1's, the sibling and the deep payload, the task and numbered
  destinations, a non-empty item's start, a first-line task, the HTML list's Markdown); not taken for
  a lone childless item, plain lines with no block structure, two ranges, a nested editor's state, or
  outline mode off. Negative control: a decision that takes every text paste fails the not-taken
  cases.
- [ ] 1.3 Write the marker rule, the distribution across ranges and the link test in
  `src/paste-text.ts` as pure functions: from the line's text before the range and the range's text,
  where to start and what to write; the text each of several ranges receives, by source; and
  whether Obsidian's paste writes a text as links over the selection. Unit-test them on the rows of
  the note's fourth-prototype table: an empty item, an empty task item, a pasted task, a pasted task
  on an empty task item (both boxes), a numbered item, a non-empty item's start, two ranges a line
  each, three ranges with a two-line text (the whole text in each); on two ranges with a two-line
  Markdown or HTML text (the whole text in each); and on what they must leave: a range in the middle
  of an item's text, on a paragraph, a text with no list prefix, a quote's `> ` prefix with no
  marker. The link test: a URL over a selected word, `mailto:` over it, two URL lines over two
  selections, are links; a URL at a caret, over a selection across lines, a text with a space, and
  two URL lines over one selection are not. Negative control: a rule that also matches mid-text
  fails the mid-text row; one that keeps the item's box over the pasted one fails the both-boxes
  row; one that ignores the pasted box fails the pasted-task row; a distribution that splits every
  source fails the Markdown and HTML rows; a link test that ignores empty ranges fails the caret
  row.
- [ ] 1.4 Register the CodeMirror `paste` handler at default precedence with the enforcement's
  extensions in `transaction-filter.ts`, with Obsidian's `sanitizeHTMLToDom` and `htmlToMarkdown`
  behind the inspection and the converter. A text the link test calls links returns false. Apply
  the state's `clipboardInputFilter`s to the plain text only. A structural paste over one range
  dispatches `replaceSelection(text)`; otherwise, when the marker rule rewrites at least one range
  or the text is converted HTML, it dispatches the ranges' changes. Every dispatch carries
  `userEvent: 'input.paste'`, and `scrollIntoView` for the plain text only; it returns true, and
  false when none of these applies. Verify with `npm test`, `npm run lint` and `npm run typecheck`.

## 2. In the app, on 1.13.7 and on 1.14.4

Every run in this group is made on both builds (`OBSIDIAN_VERSION=1.13.7` and `=1.14.4`), desktop
and `--mobile`. Setting up a 1.14.4 build in a cloud session is in the research note's last section.

- [ ] 2.1 Run the three failing cases in narrow mode: `61-selection-enforcement` "pasting a
  mixed-depth", `62-outline-edit-enforcement` "SOLE child at a deep level" and `80-outline-zoom` "a
  paste at a root WITH children". Negative control: with the handler unregistered, each fails on
  1.14.4 and passes on 1.13.7.
- [ ] 2.2 Add drawn cases under `e2e-tests/cases/node-edit-enforcement/` for the payloads whose
  first-line indentation decides the tree: the sibling payload (`  - a` / `  - b`) into the empty
  item of `- A` / `- `, and a mixed-depth one whose first line is deeper than a later root
  (`  - a` / `- b` / `  - c`) into the empty child of `- A` / `  - `. Record them with `--record` on
  each build and platform, which must agree, and check them against "Pasting into an empty list item
  replaces it" before they are committed. Negative control: both fail on 1.14.4 with the handler
  unregistered. A payload that is only deep, `    - x` / `      - y`, keeps its tree through 1.14.4's
  collapse (round 3 of the review), so it is not one of them. A structural paste on an empty task
  item is left out: it lands after the item on both builds, against that scenario, the defect #374.
  Add drawn cases for the marker rule beside them: a lone item on an empty item, on an empty task
  item, a pasted task, a pasted task on an empty task item, a numbered item, and a non-empty item's
  start, each recorded on both builds and platforms. Negative control: each gives `- - a` (or its
  like) on 1.13.7 with the handler unregistered.
- [ ] 2.3 In `62-outline-edit-enforcement`, add the pastes a case file cannot hold:
  - an HTML clipboard (a list `a` with a nested `b`, written with `ClipboardItem`) into an empty item
    two levels deep: alone, with an `<img>` from a web address in the HTML, with a `data:` image over
    1000 characters in it, and beside an `image/png`;
  - the same list as raw HTML holding a `javascript:` link, through a synthetic `paste` event, since
    the asynchronous clipboard sanitizes on write: the text inserted equals Obsidian's paste of it
    with outline mode off;
  - a `clipboardInputFilter` the test registers: it changes a plain-text paste and not an HTML one,
    as Obsidian's paste does with outline mode off on 1.13.7;
  - a plain structural text beside an `image/png`, taken: `b` under `a` and no file, on both builds;
    and a plain paragraph beside it, left to Obsidian: the file inserted, as with outline mode off;
  - a paste on a gap line after a linewise copy (two carets with empty selections, ⌘C), which lands
    at the caret, inside the node above;
  - case 1's paste and `- a` on an empty item with "Smart lists" off, through
    `app.vault.setConfig('smartIndentList', false)` in the test only, restored afterwards: the
    tree of case 1, and `- a`;
  - the HTML list, and the lone HTML item `<b>a</b>` on an empty item, with "Convert pasted HTML to
    Markdown" off, through `app.vault.setConfig('autoConvertHtml', false)` in the test only, restored
    afterwards: converted all the same, `- **a**` for the lone item;
  - `- a` beside an `image/png` on an empty item: `- a`, no file; and the same beside the image's
    own `<img>` as HTML;
  - with "Convert pasted HTML to Markdown" off, `<p><b>a</b></p>` beside the plain text `- x`, pasted
    at the end of the paragraph `p`: `p**a**` on both builds; and the HTML text `https://example.com`
    over the selected word `see`: `[see](https://example.com)`, as with outline mode off;
  - an `editor-paste` listener, registered by the test, that handles the paste: the note keeps only
    what the listener inserted;
  - two carets in two empty items with a two-line clipboard: `- a` and `- b` on both builds; two
    carets in two paragraphs with the two-line structural clipboard `- a` / `  - b`, and a lone
    childless item in the middle of an item's text and on a paragraph, each asserting the result
    equals the same paste with outline mode off on the same build.

  Negative control: the four HTML pastes fail on 1.14.4 with the handler unregistered; the
  synthetic `javascript:` paste fails with the inspection unsanitized; the filter case fails with
  the filters applied on every branch; the
  linewise case fails with the handler unregistered, on both builds; the `editor-paste` case fails
  with the handler at `Prec.highest`; the two-paragraph case fails on 1.13.7 with the handler taking
  every number of ranges; the list beside a file fails on 1.14.4 with a choice that gives nothing
  beside files; the "Smart lists" off `- a` fails on 1.14.4 with the handler unregistered; the
  conversion-off paragraph fails with the handler leaving HTML that is not structural; the URL over
  a selection fails without the link test.
- [ ] 2.4 Add `e2e-tests/specs/69-paste-differential.e2e.ts` from the probe in
  `docs/research/prototypes/paste-differential/`: the same generated clipboards, pasted as synthetic
  events into the oracle's empty note and onto the empty item of `- A` / `- ` with outline mode off
  and on, at the item under the four combinations of the two settings (set through
  `app.vault.setConfig` in the test only, restored afterwards), and the analysis's rules as
  assertions: a structural oracle text is taken with the oracle's text, a list item at the marker is
  written by the marker rule, other converted HTML is inserted as it is, anything else is left to
  Obsidian, and a taken paste gives the same result under every setting. The drop and the empty
  note stay in the probe. Split it into one `it` per settings combination and HTML value (84
  clipboards each), each well inside mocha's 60 s, and wait for the editors' text to change, up to
  1.5 s, rather than a fixed time (round 3 of the review). Measure its time on both platforms and
  quote it in the PR; it runs in the `selection` group its prefix falls in, needing no system
  clipboard, unless that time asks for a group of its own. Negative control: with the sanitizer, the
  filter rule, the file rule, the marker rule, or the HTML fallthrough removed from the handler, the
  spec fails and names the clipboards.
- [ ] 2.5 Run the `clipboard` and `drawn-cases` groups on both builds, desktop and mobile, one run at
  a time (the groups share the machine's clipboard), and quote the counts in the PR. Push the
  checkpoint and read CI's jobs, which run on the pinned build until 3.1.

## 3. The pin and the record

- [ ] 3.1 Remove the CI pin #359 added: delete `env.obsidian-version` and its comment from
  `.github/workflows/ci.yml`, and restore the header comment, the `workflow_dispatch` input's
  description and the `inputs.obsidian-version || 'latest'` expressions of both e2e jobs. Verify that
  the PR's required `clipboard` jobs then run on the newest build and pass.
- [ ] 3.2 Update `docs/research/obsidian-smart-list-paste` with what group 2 measured on the built
  change, replacing the prototypes' source with a pointer to the module.
- [ ] 3.3 Run `openspec validate own-structural-paste --strict`.
