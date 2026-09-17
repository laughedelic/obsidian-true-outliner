<script setup lang="ts">
import { withBase } from 'vitepress';
import DemoGallery from './DemoGallery.vue';
import Clip from '../theme/Clip.vue';
import Shot from '../theme/Shot.vue';

const logseqFile = `- ## Kitchen renovation
  id:: 6624a82c-3b11-4d44-9d3f-d9c7e8f0a1b3
  collapsed:: true
	- Plan
	  id:: 6624a82c-9a22-4e55-be40-eaf8d9015c2a
		- demolition weekend
		  id:: 6624a82c-7c33-4f66-cf51-f0a9eb126d3b
		- electrics and plumbing
		  id:: 6624a82c-5d44-4077-d062-01baf1237e4c
	- Materials
	  collapsed:: false
		- tile: reclaimed terracotta`;

const ourFile = `# Kitchen renovation

## Plan

1. demolition weekend
2. electrics and plumbing

## Materials

- tile: reclaimed terracotta
- handles: undecided
	- brass ages well`;
</script>

<template>
  <div class="lp">
    <section class="lp-hero">
      <p class="lp-eyebrow">An Obsidian plugin · early preview</p>
      <h1 class="lp-title">A true outliner.<br />Your notes stay markdown.</h1>
      <p class="lp-lede">
        True Outliner turns any Obsidian note into a tree of nodes you move, split, select, fold and zoom by the
        node, the way Workflowy and Logseq work, in the plain markdown files you already have. Nothing is written to a
        file but the markdown it already says.
      </p>
      <div class="lp-actions">
        <a class="lp-btn lp-btn-primary" :href="withBase('/guide/installation')">Install with BRAT</a>
        <a class="lp-btn" :href="withBase('/guide/')">Read the guide</a>
      </div>
      <DemoGallery class="lp-gallery" />
    </section>

    <section class="lp-chapter">
      <p class="lp-eyebrow">01 · The bet</p>
      <h2>Two things people think they have to choose between.</h2>
      <div class="lp-two">
        <div>
          <h3>A true outliner</h3>
          <p>
            Workflowy, Roam, Logseq and Tana share one invariant: the document is a tree of nodes, and every gesture,
            typing, selecting, deleting, moving, pasting, respects node boundaries. A subtree moves whole. A selection
            covers nodes. That is what makes them feel solid, and it is why people put up with everything else about
            them.
          </p>
        </div>
        <div>
          <h3>File over app</h3>
          <p>
            Obsidian's promise is that the notes are plain files that outlive any tool, including Obsidian. No
            database, no export step, no format anyone has to migrate off. The outliners that tried to keep that
            promise paid for it: Logseq writes identifiers and fold state into the files to keep its tree, and the
            Obsidian plugins that add outliner keys work on flat text and know nothing about headings or paragraphs.
          </p>
        </div>
      </div>
      <p class="lp-thesis">
        The bet is that the tree is already in the markdown. Every note has block structure: headings nest by level,
        list items nest by indentation, a paragraph owns the list under it. Read that structure, draw it, and make every
        operation work on it, and the file needs nothing added. True Outliner is that reading. It is another view of
        the same notes, not a new kind of note.
      </p>
      <ul class="lp-facts">
        <li><strong>Any note.</strong> Headings, paragraphs, list items, code, tables and callouts are all nodes of one tree. Nothing to convert.</li>
        <li><strong>Every operation on the tree.</strong> A node carries its children; a selection covers whole nodes; a fold follows its node.</li>
        <li><strong>Byte for byte.</strong> Parse a note, write it back: identical. A structural edit changes the lines it moved and nothing else.</li>
        <li><strong>Public APIs only.</strong> Obsidian's documented editor and plugin APIs, desktop and mobile, any theme.</li>
      </ul>
    </section>

    <section class="lp-chapter">
      <p class="lp-eyebrow">02 · Any note is an outline</p>
      <h2>One grid for every kind of block.</h2>
      <div class="lp-row">
        <div class="lp-row-text">
          <p>
            In outline mode every block steps right per level, whatever its kind. Guide lines run from a parent down
            past its children, a marker in the gutter names each block, and the caret's place in the tree is
            highlighted as it moves. Switch outline mode off and the note is stock Obsidian.
          </p>
          <p>
            Two readings of markdown make this work and are worth knowing: a list right after a paragraph belongs to
            that paragraph, and one blank line decides whether indented text is a continuation or a child. The guide
            page on the mapping explains both in a minute.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/how-notes-become-outlines')">How a note becomes an outline</a></p>
        </div>
        <Shot name="guides-markers" alt="A note with headings, paragraphs and nested lists on one grid, with guide lines and a marker per block" />
      </div>
    </section>

    <section class="lp-chapter">
      <p class="lp-eyebrow">03 · Markdown stays markdown</p>
      <h2>The markdown you see is the markdown you wrote.</h2>
      <p class="lp-thesis">
        No identifiers, no fold state, no forced bullets, no metadata block. What the outliner needs to remember,
        such as which nodes are folded, lives in plugin data. The note is what it would have been without the plugin.
      </p>
      <div class="lp-two lp-files">
        <figure>
          <figcaption>Logseq · pages/kitchen.md</figcaption>
          <pre class="lp-code lp-code-bad">{{ logseqFile }}</pre>
        </figure>
        <figure>
          <figcaption>Obsidian + True Outliner · Kitchen renovation.md</figcaption>
          <pre class="lp-code">{{ ourFile }}</pre>
        </figure>
      </div>
      <div class="lp-three">
        <div><strong>Diff-friendly.</strong> A move is the lines that moved. Sync and version control see an edit, not a rewrite.</div>
        <div><strong>Plugin-friendly.</strong> Every other plugin, and every other app, reads the same note. Dataview, templates, publish, all unchanged.</div>
        <div><strong>Leave-friendly.</strong> Turn it off, or uninstall it, and there is nothing to clean up. The notes were never anything else.</div>
      </div>
      <Clip name="outline-toggle" caption="Outline mode off, then on: the same file both times." class="lp-clip" />
    </section>

    <section class="lp-chapter">
      <p class="lp-eyebrow">04 · Backlinks with structure</p>
      <h2>Every reference, in the tree it came from.</h2>
      <div class="lp-row lp-row-flip">
        <div class="lp-row-text">
          <p>
            Obsidian's backlinks show a line of context. Below every note in outline mode, True Outliner shows each
            reference with its ancestors above it, the node itself and one level of children, grouped by note,
            sortable, filterable by kind, folder and tag, and one click from the source. It is the bidirectional
            outlining that Roam and Logseq are known for, built on Obsidian's own link index, with nothing written to
            any note.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/backlinks')">Structured backlinks</a></p>
        </div>
        <Shot name="backlinks-footer" alt="The structured backlinks footer below a note, listing references grouped by note, each shown with its ancestors" />
      </div>
    </section>

    <section class="lp-chapter">
      <p class="lp-eyebrow">05 · Next to the others</p>
      <h2>We like their ideas. We do not want their trade-offs.</h2>
      <p class="lp-thesis">
        Roam, Tana and Notion keep the notes in a database. Logseq keeps them in markdown and writes into the files to
        manage them. Obsidian's outliner plugins add keys to flat text. Each got something right, and the comparison
        pages say what, app by app. The short version is the table.
      </p>
      <div class="lp-table-wrap">
        <table class="lp-table">
          <thead>
            <tr>
              <th></th>
              <th>Obsidian + True Outliner</th>
              <th>Obsidian + Outliner plugin</th>
              <th>Logseq</th>
              <th>Workflowy / Roam / Tana</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Notes are plain markdown files</td><td>✓</td><td>✓</td><td>with <code>id::</code> and <code>collapsed::</code> lines</td><td>database</td></tr>
            <tr><td>Nothing written into files for the outliner</td><td>✓</td><td>✓</td><td>–</td><td>n/a</td></tr>
            <tr><td>Headings and paragraphs are nodes</td><td>✓</td><td>lists only</td><td>everything is a bullet</td><td>everything is a bullet</td></tr>
            <tr><td>Subtree moves, wherever the caret is</td><td>✓</td><td>partial</td><td>✓</td><td>✓</td></tr>
            <tr><td>Selection snaps to nodes</td><td>✓</td><td>–</td><td>✓</td><td>✓</td></tr>
            <tr><td>Zoom, fold, backlinks with structure</td><td>✓</td><td>zoom via a second plugin</td><td>✓</td><td>✓</td></tr>
            <tr><td>Drag and drop, block references</td><td>not yet</td><td>drag and drop</td><td>✓</td><td>✓</td></tr>
            <tr><td>Works with every other Obsidian plugin</td><td>✓</td><td>✓</td><td>–</td><td>–</td></tr>
          </tbody>
        </table>
      </div>
      <p class="lp-more"><a :href="withBase('/compare/')">The comparisons, app by app</a></p>
    </section>

    <section class="lp-install">
      <div>
        <h2>Install</h2>
        <p>
          Not yet in the community plugin directory. Install it through BRAT from the repository, or by hand from the
          <a href="https://github.com/laughedelic/obsidian-true-outliner/releases/latest">latest release</a>. There is
          nothing to migrate: it is the vault you have.
        </p>
      </div>
      <ol class="lp-steps">
        <li>Enable <strong>BRAT</strong> from Community plugins.</li>
        <li>BRAT settings → <strong>Add beta plugin</strong>.</li>
        <li>Enter <code>laughedelic/obsidian-true-outliner</code> and confirm.</li>
        <li>Open any note. Outline mode is on for new tabs.</li>
      </ol>
      <div class="lp-actions">
        <a class="lp-btn lp-btn-primary" :href="withBase('/guide/installation')">Installation details</a>
        <a class="lp-btn" :href="withBase('/reference/limitations')">Known limitations</a>
      </div>
    </section>
  </div>
</template>

<style>
.lp {
  --lp-max: 1120px;
  --lp-display: 'Manrope', var(--vp-font-family-base);
  max-width: var(--lp-max);
  margin: 0 auto;
  padding: calc(var(--vp-nav-height) + 3rem) 24px 4rem;
  font-family: var(--vp-font-family-base);
}
.lp h1,
.lp h2,
.lp h3 {
  font-family: var(--lp-display);
  text-wrap: balance;
  letter-spacing: -0.01em;
  margin: 0;
}
.lp p {
  margin: 0.6em 0;
  line-height: 1.6;
}
.lp a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
.lp a:hover {
  text-decoration: underline;
}
.lp code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  padding: 0.1em 0.35em;
}
.lp kbd {
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
  border: 1px solid var(--vp-c-divider);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0.05em 0.4em;
  background: var(--vp-c-bg);
}

.lp-eyebrow {
  font-family: var(--lp-display);
  font-size: 12.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  margin: 0 0 0.9rem;
}
.lp-title {
  font-size: clamp(2rem, 4.6vw, 3.4rem);
  font-weight: 800;
  line-height: 1.08;
  max-width: 22ch;
}
.lp-lede {
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  color: var(--vp-c-text-2);
  max-width: 64ch;
  margin-top: 1.1rem;
}
.lp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1.4rem 0 2.2rem;
}
.lp-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  font-weight: 600;
  font-size: 15px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  transition: border-color 0.15s, background 0.15s;
}
.lp-btn:hover {
  border-color: var(--vp-c-brand-1);
  text-decoration: none;
}
.lp a.lp-btn-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}
.lp a.lp-btn-primary:hover {
  background: var(--vp-c-brand-2);
}

.lp-chapter {
  margin-top: 5rem;
  padding-top: 3rem;
  border-top: 1px solid var(--vp-c-divider);
}
.lp-chapter h2 {
  font-size: clamp(1.5rem, 2.6vw, 2.1rem);
  font-weight: 800;
  max-width: 26ch;
  margin-bottom: 1rem;
}
.lp-chapter h3 {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.3rem;
}
.lp-thesis {
  font-size: 1.1rem;
  max-width: 68ch;
  margin: 0.75rem 0 1.5rem;
}
.lp-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  margin: 1.5rem 0;
}
.lp-two p {
  color: var(--vp-c-text-2);
  max-width: 52ch;
}
.lp-facts {
  list-style: none;
  margin: 1.5rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 0.9rem;
}
.lp-facts li {
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  line-height: 1.5;
  color: var(--vp-c-text-2);
  font-size: 15px;
}
.lp-facts strong {
  color: var(--vp-c-text-1);
}

.lp-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 2.5rem;
  align-items: center;
  margin-top: 1rem;
}
.lp-row-flip {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}
.lp-row-flip .lp-row-text {
  order: 2;
}
.lp-row-text p {
  color: var(--vp-c-text-2);
  max-width: 50ch;
}
.lp-more {
  font-weight: 600;
}
.lp-more a::after {
  content: ' →';
}
.lp .media {
  margin: 0;
}
.lp .media > video,
.lp .media > img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.lp .media > figcaption {
  margin-top: 0.4rem;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.lp-clip {
  max-width: 720px;
  margin-top: 2rem !important;
}

.lp-files figure {
  margin: 0;
  min-width: 0;
}
.lp-files figcaption {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin-bottom: 0.4rem;
}
.lp-code {
  margin: 0;
  padding: 1rem 1.1rem;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
  tab-size: 4;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.lp-code-bad {
  color: var(--vp-c-text-3);
}
.lp-three {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  margin: 1.5rem 0 0;
  font-size: 15px;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}
.lp-three strong {
  color: var(--vp-c-text-1);
  display: block;
  margin-bottom: 0.2rem;
}

.lp-table-wrap {
  overflow-x: auto;
  margin: 1rem 0;
}
.lp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14.5px;
  min-width: 720px;
}
.lp-table th,
.lp-table td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: top;
}
.lp-table th {
  font-family: var(--lp-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.lp-table th:nth-child(2),
.lp-table td:nth-child(2) {
  font-weight: 600;
  color: var(--vp-c-text-1);
  background: var(--vp-c-brand-soft);
}
.lp-table td:not(:first-child):not(:nth-child(2)) {
  color: var(--vp-c-text-2);
}

.lp-install {
  margin-top: 4rem;
  padding: 2.5rem;
  border-radius: 14px;
  background: var(--vp-c-brand-soft);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 2rem 3rem;
  align-items: start;
}
.lp-install h2 {
  font-size: 1.75rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}
.lp-install .lp-actions {
  grid-column: 1 / -1;
  margin: 0;
}
.lp-steps {
  margin: 0.4rem 0 0;
  padding-left: 1.25rem;
  line-height: 1.7;
}

@media (max-width: 860px) {
  .lp-two,
  .lp-row,
  .lp-row-flip,
  .lp-install {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .lp-row-flip .lp-row-text {
    order: 0;
  }
}
</style>
