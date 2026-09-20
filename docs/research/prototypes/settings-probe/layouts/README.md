# Candidate layouts

One JSON file per candidate arrangement of the settings tab. The probe
(`../settings-probe.e2e.ts.txt`) installs each one into a running Obsidian through
the tab's own `getSettingDefinitions()` and screenshots the top level and every
page, desktop and phone; `../gallery.mjs` then folds the screenshots and
measurements into one HTML page for comparing them side by side.

An item is one of:

- `"key"` — a setting row by its declaration key, name and description as declared
  (description cut to its first sentence unless `keepDesc` is set on the layout);
- `{ "key": "...", "name": "...", "desc": "...", "aliases": [...] }` — the same, with overrides;
- `"preview"` — the heading-marker preview row;
- `{ "group": "Heading", "items": [...] }` — a group;
- `{ "page": "Name", "desc": "...", "value": "key", "items": [...] }` — a sub-page, whose
  entry shows the current value of `value` (a toggle reads On/Off, a dropdown its label).

Names, headings and descriptions here are prototype wording, not decisions.
