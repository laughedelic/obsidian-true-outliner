# Settings tab structure

Researched 2026-09-19 against Obsidian 1.13.7 (the harness build) and the pinned `obsidian`
typings 1.13.1. The question: how to reorganise the plugin's settings so they are easier to
scan and to change — what the API allows in the way of grouping and sub-pages, what Obsidian's
own tabs do with it, where the tab's length actually comes from, how the settings search treats
each structure, what the guidelines say about wording, and how far a feature can be switched off
from the tab at all. Implementation is out of scope; this note grounds the proposal.

Everything under "measured" comes from
[prototypes/settings-probe/](prototypes/settings-probe/): a throwaway spec that screenshots
and measures the current tab, injects two prototype layouts through the tab's own
`getSettingDefinitions()` and `update()`, and reads the search index for each. The screenshots
beside it are the ones cited below. Rendering behaviour that no document states was read out of
the 1.13.7 bundle (`app.js`, `app.css`, `i18n.js`) and is marked as such.

## What exists today (measured)

Twenty-one rows in one flat list, plus the heading-marker preview row, in slice order: mode,
folding, shell, footer, appearance. No headings. Two render paths, `getSettingDefinitions()` for
1.13+ and `display()` for older builds, both derived from the same declarations.

**Length.** The tab scrolls 4.2 viewports on the desktop probe window (content 678 px tall,
2782 px of rows) and 6.2 on the phone emulation (844 px tall, 5225 px of rows). Descriptions are
where the height is: 1410 of the 2671 px of row height on desktop and 2678 of 5002 px on the
phone. The 21 descriptions total 987 words, a mean of 47 words and three sentences each; the
longest (`hideGapLines`) is 151 words and five sentences, a row 217 px tall on desktop and
515 px (26 lines) on the phone.
[desktop-current.png](prototypes/settings-probe/desktop-current.png),
[mobile-current.png](prototypes/settings-probe/mobile-current.png).

**Obsidian's own rows, for comparison.** The English string table in `i18n.js` holds 114
option/description pairs. Descriptions: mean 10 words, median 9, 90th percentile 18, longest 27;
86% are one sentence. Names: mean 2.8 words, longest 7; 26 of 114 start with an imperative verb
("Show all file types", "Hide page title"), the rest are noun phrases ("Readable line length",
"Inline title", "Attachment folder path"). Ours are four to five times longer per description,
and seven names carry a "Backlinks:" prefix and two a "Debug:" prefix that a heading would make
redundant.

**Where settings open.** On desktop 1.13 the settings open in a separate window by default
(`vault.getConfig('settingsPopoutWindow')`, read out of the bundle), so a screenshot of the main
window does not show them; the probe turns the option off before opening. A tab that is a
window rather than a modal changes nothing about layout: the same `.vertical-tab-content` and
group styles apply.

## The 1.13 declarative API

Public since 1.13.0 unless marked; the definitions are in `obsidian.d.ts` and documented on the
developer site's Settings page, which the probe's readings agree with.

| Definition | What it is | Notable fields |
| --- | --- | --- |
| control | One row bound to one key: toggle, dropdown, text, textarea, number, slider, file, folder, color | `defaultValue`, `validate`, `disabled` |
| render | One row we draw ourselves into a `Setting` (the heading-marker preview is one) | may return a cleanup |
| action | A clickable row | `disabled` |
| name-only | A static informational row | — |
| `type: 'group'` | A heading and a card of rows | `heading`, `visible`, `search` (1.13.1), `extraButtons`, `cls` |
| `type: 'list'` | A group for user-managed entries (add, delete, reorder) | not relevant here |
| `type: 'page'` | A navigable entry that opens a sub-page with a back button | `displayValue` and `status: 'warning'` (both 1.13.1), `items` or a `page` factory, `visible` |

Every definition takes `aliases` (extra search terms), `searchable` and `visible`; a control
also takes `disabled`. The predicates are functions re-evaluated on each render; a change made
through a control re-evaluates them automatically, and `refreshDomState()` re-evaluates without
re-rendering, `update()` rebuilds from a fresh `getSettingDefinitions()`.

**Rendering facts read out of the bundle.**

- Consecutive rows with no group around them are wrapped in an implicit group, which is why the
  top of the current tab already renders as one card. A group heading is a 19.5 px row.
- A page entry is a `.setting-item.mod-navigable` row: name, description, an optional value on
  the right (`Setting.addDisplayValue`, public since 1.13.1, with `DisplayValueComponent.setStatus`)
  and a chevron. Its control column is capped at 40% of the row.
- A page's title bar (back chevron plus title) is sticky on desktop; on a phone it is hidden and
  the modal's own header carries the title and the back button
  ([mobile-page-backlinks.png](prototypes/settings-probe/mobile-page-backlinks.png)).
- Pages nest. Navigation is by name path, so page names must be unique among siblings; Obsidian
  logs a console error for duplicates.
- `getSettingDefinitions()` runs on every `update()` and once when the tab is registered, to
  index it for search. It has to stay cheap.
- A disabled row is dimmed (`.is-disabled`, opacity 0.5) and stays in the search index; a row,
  group or page whose `visible` answers false is neither rendered nor indexed for that render.

**What Obsidian's own tabs do with pages.** Five uses in 1.13.7, and every one is a
self-contained collection rather than a section of ordinary settings: CSS snippets (a list, with
the enabled count as `displayValue`), the three font pickers (an imperative page each, with the
count as value and a warning status when a chosen font is missing), excluded files (a list, with
the count), the ribbon configuration and the mobile toolbar (lists). Groups with headings carry
the rest. The developer docs put it directly: "Use sub-pages sparingly: only when the parent tab
is too long to scan, or the section has a self-contained scope … If a section is just two or
three settings, leave them on the parent tab."

**The pre-1.13 path.** `display()` has groups (`SettingGroup`, 1.11, or `setHeading()` on any
version) and no pages at all. A page can only be flattened into a heading there. Our
`minAppVersion` is 1.5.0, and the footer settings spec (`41-backlinks-settings`) asserts both
paths render the same rows. The one clean alternative is the migration guide's Path A: bump
`minAppVersion` to 1.13.0 and delete `display()`, at which point the official eslint plugin's
`settings-tab/no-deprecated-display` rule applies and `require-display` stops. 1.13 reached the
public desktop release on 2026-07-30 (1.13.4).

## Search (measured)

The settings search indexes every tab and every page as its own group of results, labelled with
the page name and the tab name as a sublabel, three results shown per group and the rest behind
"N more" ([desktop-search-backlinks.png](prototypes/settings-probe/desktop-search-backlinks.png)).
Three consequences for a reorganisation:

- **Matching reads the row, not its context.** A result matches on the row's name, its
  description text (a fragment by its `textContent`) and its `aliases`, never on the heading or
  page it sits under. Today a search for "backlinks" finds all seven footer rows because each
  name carries the prefix; in both prototypes, where the prefix moved into the page name, it
  finds two (the two whose first sentence still says "backlinks"). Dropping a prefix from a name
  therefore means adding it as an alias, or keeping the word in the one-sentence description.
- **Results are ranked, not ordered by tab.** For "guide", the Backlinks page's "Guide lines"
  ranked above the tab's own guide rows.
- **Result labels truncate at the sidebar's width** ("Hide the outermost gu…" at 1024 px), so a
  short name matters in the search list as much as in the tab.

Hiding a group with `visible` removed its rows from the index (a search for "backlinks" returned
only the two rows outside it); disabling every control in the same group left all seven indexed.

## Two prototype layouts (measured)

Both were injected at runtime from the tab's own definitions, with every name shortened and
every description cut to its first sentence, so that the effect of structure and the effect of
wording could be told apart.

**A: groups, and one page.** Top rows unheaded (open in outline mode, status bar, remember
folds), then groups Layout, Guides, Markers (with the preview row), a Backlinks page whose entry
shows On/Off, and an Advanced group for the cross-check.
[desktop-groups-and-one-page.png](prototypes/settings-probe/desktop-groups-and-one-page.png).

**B: a page per feature.** The same top rows, then an Appearance group holding outline width,
blank lines, and page entries for Guides (value: which guides are drawn) and Markers (value:
which nodes get one), a Features group holding the Backlinks page, and Advanced.
[desktop-pages-per-feature.png](prototypes/settings-probe/desktop-pages-per-feature.png),
[mobile-pages-per-feature.png](prototypes/settings-probe/mobile-pages-per-feature.png).

| Layout | Rows on the top level | Desktop viewports | Phone viewports | Description height, desktop |
| --- | --- | --- | --- | --- |
| Current | 22 | 4.2 | 6.2 | 1410 px |
| A | 20 (4 headings, 1 page entry) | 2.6 | 3.5 | 481 px |
| B | 12 (3 headings, 3 page entries) | 1.5 | 1.9 | 239 px |

The pages themselves: Guides holds four rows in 368 px, Backlinks nine rows (two groups inside
it) in 732 px, each fitting the desktop content area without scrolling; on the phone the
Backlinks page is 1172 px, 1.4 viewports.
[desktop-page-guides.png](prototypes/settings-probe/desktop-page-guides.png).

Reading the table: shortening the descriptions is what takes the current tab from 4.2 to 2.6
viewports, since A adds structure but hides nothing; pages take it from 2.6 to 1.5 by moving
thirteen rows off the top level. Neither step is free. A puts the whole plugin on one scroll,
which is what the docs prefer for sections of ordinary settings; B is the shape Obsidian reserves
for self-contained scopes, and hides the guide and marker rows one tap deeper, which matters
most on a phone where a page has no side navigation and comes back through the header's arrow.

Against the docs' own threshold ("two or three settings, leave them on the parent"): Backlinks
has seven rows, its own on/off switch and its own grouping inside it, and reads as a feature
rather than a section, so it is the clearest case for a page. Guides (four rows) and Markers
(five, with the preview) sit at the boundary; what tips them is where a preview goes (below).

## Redundancy across pages

The API binds a control by key, so the same key can be declared in two places. The duplicate-key
check runs per rendered list, so two pages each holding a row for one key raise no error, but
nothing ties the two rows together except that a page re-renders when it is opened. Obsidian's
own tabs never do this; what they do instead is `displayValue` on the entry: the parent shows the
page's headline value (the enabled-snippet count, the font count) without holding a second
control for it. The same pattern covers what redundancy would be for: the Backlinks entry reads
On or Off from `backlinksFooter`, the Guides entry names which guides are drawn, the Markers entry
which nodes carry one. A feature's on/off toggle then lives in exactly one place, at the top of
its page, and the entry reports it. The recommendation is no duplicate rows.

## Wording

The rules that apply, from the developer docs' Settings page and the plugin guidelines, and the
official eslint plugin already in `eslint.config.js` (`ui/sentence-case`,
`settings-tab/no-problematic-settings-headings`, `settings-tab/prefer-setting-definitions`):

- Sentence case everywhere.
- No top-level heading, no "General"; general settings sit at the top unheaded and headings start
  at the second section, as Obsidian's own tabs do.
- No "settings" in a heading.
- A description "is for a single sentence explaining what the setting does, not for warnings or
  paragraphs of context"; background goes behind a link.
- One control per row; save on change.

What the audit of our 21 rows turns up, against the corpus above:

- **Prefixes become structure.** The seven "Backlinks:" names and two "Debug:" names lose the
  prefix once a Backlinks page and an Advanced group exist, with an alias keeping the word
  searchable.
- **Names as noun phrases, or as the thing a toggle turns on.** Obsidian's names are mostly nouns;
  where a verb leads it is the toggle's own effect ("Hide page title", "Show all file types").
  Ours mix questions ("Which indentation guides to draw"), instructions ("Remember folds"), and
  nouns ("Outline width"). Inside a Guides group the question form collapses to "Levels drawn",
  "Strength", "Highlight at the cursor"; a toggle is named by what is on when it is on.
- **Descriptions to one sentence, stating the effect.** The measured budget is Obsidian's own:
  median 9 words, 90th percentile 18. Most of what our descriptions carry beyond that is of
  three kinds, each with a home that is not the row: rationale for the default (the design note
  or spec), reassurance about reversibility and the file staying byte-identical (a README
  section on what the plugin writes, linked once), and the costs of an experimental option
  (`hideGapLines` lists three; the chip already marks it, and the costs belong with the
  experiment's note). The docs' own device for the remainder is a link in the description,
  which a fragment can carry.
- **Option labels state outcomes, not mechanisms.** "Whole guide of every ancestor" and "Only the
  part leading down to the cursor" are the two states of one axis and read fine as a pair;
  "All eligible kinds (status quo)" and "experiment 5a" are labels for us, not for a reader.
- **The Experimental chip stays** as declared: a property of the row, findable by search.

## Previews

One preview exists: the heading marker, a `render` row drawn by the editor's own icon builder so
it cannot show a mark the editor would not (`heading-marker-preview.ts`). It costs a 64 px row
on desktop and 101 px on the phone, and previews two of the 21 settings.

Three ways to spend previews, and what each costs:

1. **One per setting.** Guides alone would take four rows of preview for four rows of control,
   doubling the section; this is the "overwhelm" case and the table above already shows the tab's
   height is the problem being solved.
2. **One per page, drawn from every setting on it.** A Guides page opens with one fragment of
   outline showing the chosen visibility, strength and highlight together; a Markers page with
   one fragment showing which nodes carry a marker, in which heading style, with the highlight.
   The preview sits beside what it previews and never reaches the top level, which is the
   argument for making Guides and Markers pages after all. What it needs is a static DOM that the
   editor's own stylesheet styles the same way as a real line. The appearance settings already
   publish their values as custom properties on `body` (`59-appearance-settings`), so a fragment
   built of the decoration's own class names picks those up for free; whether the guide and
   marker rules are scoped under an editor root class that a settings-tab element can carry is
   one measurement away and decides whether this is a stylesheet reuse or a second copy of the
   rules. Embedding a real editor is ruled out by
   [surfaces-and-embedding.md](surfaces-and-embedding.md): eight non-public touchpoints.
3. **Fewer previews by better labels.** A dropdown whose options say what happens ("Every
   level", "Only the levels the cursor is inside") needs no picture; `displayValue` on a page
   entry shows the headline state at the parent. This is the part that costs nothing and applies
   whichever layout is chosen.

The reading: 3 everywhere, 2 for the two visual pages if the stylesheet measurement holds, never 1.

## Switching a feature off

The plugin's features, what already switches each one, and what a switch would take on public
APIs:

| Feature | Today | Mechanism for a switch |
| --- | --- | --- |
| Outline mode itself | Per tab, with `outlineByDefault` | Exists; everything else gates on it |
| Backlinks footer | `backlinksFooter` toggle | Exists; the extension reads it live and `nudgeFooters` repaints |
| Guides, markers, highlights | Each axis has an off state (`off`, `none`) but no single switch | A flag read where `DecorationSource` is read, applied by `forceRedraw` |
| Blank-line collapsing | `hideGapLines` toggle | Exists |
| Folding | `rememberFolds` only; the provider is always on | A flag in `foldServiceExtension`'s facet answer; the chevron and per-file persistence go with it (fold-mechanics.md) |
| Zoom | None | A flag in the click handler and the three zoom commands |
| Structural commands and the keyboard grammar | None | A flag in the grammar's bindings; commands below |
| Selection and edit enforcement | None | Should stay unswitchable: it is the invariant the README promises |
| Status bar item | `statusBarMode: none` | Exists |

The mechanisms, all public:

- **Editor extensions** are registered once in `onload` and cannot be unregistered while the
  plugin is loaded, but every one of ours already gates on a value read live (`isOutlineMode`,
  the decoration settings), so a feature flag is one more such read, applied the way the
  existing settings are: `forceRedraw` for decorations, a footer nudge for the footer,
  `workspace.updateOptions()` for a fold-service answer. The alternative, swapping the registered
  extension array's entry and calling `updateOptions()`, is the obsidian-lapel pattern main.ts
  records; it is public too and is what to use if a switch has to remove an extension outright.
- **Commands.** `Plugin.removeCommand` is public since 1.7.2, so a switch can unregister a
  feature's commands and re-add them. Short of that, a check callback answering false keeps a
  command out of the palette (the bundle's `listCommands` filters on it) but the Hotkeys tab
  still lists it (its list iterates every registered command), so the hotkey stays assignable and
  simply does nothing. Removing is the honest choice.
- **The ribbon icon** has no public removal, but Obsidian lets the reader hide it from the
  ribbon's own menu, and the icon is the mode's, not a feature's.
- **The tab.** `visible` on a page or group hides a switched-off feature's rows and takes them
  out of search; `disabled` keeps them readable and dims them. The docs' rule is: hide what is
  irrelevant, disable what is locked. For a feature that is off by the reader's choice, a page
  whose entry reads "Off", whose first row is the switch and whose remaining rows are disabled
  keeps the settings discoverable and states plainly why they do nothing; a hidden group would
  make the feature look removed.

What a switch costs is not the code but the matrix: each one is a state every affected e2e group
runs in, on both platforms, and a documented guarantee that turning it back on restores the
previous state. That argues for switches only where the README already names a layer as optional
(backlinks, zoom, folding chrome, position indicators), not for the grammar or the enforcement.

## What follows

A proposal can take these as settled by measurement:

- A row's description is one sentence, on Obsidian's own budget; what does not fit moves to a
  linked page. This alone removes a third of the tab's height.
- Prefixes become headings or pages, with aliases so search still finds the rows.
- Backlinks is a page with its switch at the top and On/Off on the entry.
- No setting appears twice; `displayValue` carries a page's headline to the parent.

And these are the decisions left open, with a reading on each:

1. **Groups only (A) or pages for Guides and Markers too (B).** A follows the docs' preference
   for ordinary sections; B is what makes a per-page preview possible without lengthening the top
   level. Our reading: decide with the stylesheet measurement in "Previews"; if a group preview
   is a reuse, B, otherwise A.
2. **`minAppVersion` 1.13.0** and one render path, or keep `display()` with pages flattened into
   headings. Our reading: bump; the tab is the only place the plugin branches on version, and the
   dual path is a second implementation to keep in step for builds older than the end of July.
3. **Which features get a switch.** Our reading: zoom and folding next, as the two layers the
   README calls optional that have none; both are page-sized in the tab.

## Re-running the probe

`prototypes/settings-probe/settings-probe.e2e.ts.txt` carries the instructions in its header.
Candidate layouts are JSON files under `prototypes/settings-probe/layouts/` (the README there
gives the format); the probe installs each one, screenshots its top level and every page on both
platforms, and `prototypes/settings-probe/gallery.mjs` folds the runs into one HTML page for
comparing them side by side. Trying a new arrangement is one JSON file and two runs of about
half a minute each. The probe asserts nothing, which is why it is kept out of `e2e/specs/`.
