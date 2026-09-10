<script setup lang="ts">
import { withBase } from 'vitepress';
import OutlineDemo from './OutlineDemo.vue';
import {
  KITCHEN,
  MIXED,
  TOUR,
  MOVE_SCRIPT,
  SPLIT_SCRIPT,
  SELECT_SCRIPT,
  ZOOM_SCRIPT,
  TOGGLE_SCRIPT,
  GRID_SCRIPT,
} from '../../demo/samples';

const shot = (name: string) => ({
  light: withBase(`/media/shots/${name}-light.png`),
  dark: withBase(`/media/shots/${name}-dark.png`),
});
const footer = shot('backlinks-footer');
const mobile = shot('mobile-outline');
</script>

<template>
  <div class="lp">
    <section class="lp-hero">
      <p class="lp-eyebrow">An Obsidian plugin · early preview</p>
      <h1 class="lp-title">Edit the structure of a note, not just its text.</h1>
      <p class="lp-lede">
        True Outliner reads the tree that is already in your markdown, headings, paragraphs and lists alike, and lets you
        move, split, select and zoom it as nodes. The file on disk stays plain markdown, byte for byte.
      </p>
      <div class="lp-actions">
        <a class="lp-btn lp-btn-primary" :href="withBase('/guide/installation')">Install with BRAT</a>
        <a class="lp-btn" :href="withBase('/guide/')">Read the guide</a>
      </div>
      <OutlineDemo
        :doc="KITCHEN"
        :script="TOUR"
        autoplay
        loop
        source
        :delay="1000"
        title="Kitchen renovation.md"
        hint="Live: this is the plugin's own editor code, running here. Try <kbd>Tab</kbd>, <kbd>⇧Tab</kbd>, <kbd>Enter</kbd>, <kbd>⇧↓</kbd>, <kbd>⌘A</kbd>, or click a marker."
        class="lp-hero-demo"
      />
    </section>

    <section class="lp-why">
      <div class="lp-why-text">
        <h2>Why an outliner needs a tree</h2>
        <p>
          Workflowy, Roam, Logseq and Tana share one idea: the document is a tree of nodes, and every gesture, whether
          typing, selecting, deleting, moving or pasting, respects node boundaries. That is what makes them feel solid.
        </p>
        <p>
          Obsidian's lists are lines of text. Outliner plugins add keybindings on top, so a move works only when the
          caret is in the right place, and a careless selection still cuts a subtree in half.
        </p>
        <p>
          True Outliner brings the tree to Obsidian without leaving markdown behind. Every note already has block
          structure; the plugin reads it, draws it, and makes every operation work on it. Nothing is converted and
          nothing is written to the file that the structure does not already say.
        </p>
        <p class="lp-links">
          <a :href="withBase('/guide/')">The full story</a>
          <a :href="withBase('/guide/how-notes-become-outlines')">How a note becomes an outline</a>
          <a :href="withBase('/guide/compared')">Compared to other outliners</a>
        </p>
      </div>
      <ul class="lp-why-facts">
        <li><strong>Any note.</strong> Headings, paragraphs, list items, code, tables and callouts are all nodes of one tree.</li>
        <li><strong>Operations on nodes.</strong> A node carries its children; a selection covers whole nodes.</li>
        <li><strong>Clean files.</strong> No IDs, no fold markers, no metadata. Parse and re-encode is byte-identical.</li>
        <li><strong>Public APIs only.</strong> Built on Obsidian's documented editor and plugin APIs.</li>
      </ul>
    </section>

    <section class="lp-features">
      <h2 class="lp-features-title">What it does</h2>

      <article class="lp-row">
        <div class="lp-row-text">
          <h3>Any note is an outline</h3>
          <p>
            Every block sits on one indentation grid, stepping right per level whatever its kind. Guide lines run from a
            parent down past its children, a marker in the gutter names each block's kind, and the caret's place in
            the tree is highlighted as it moves.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/appearance')">Appearance</a></p>
        </div>
        <OutlineDemo :doc="MIXED" :script="GRID_SCRIPT" autoplay loop title="Trail race training.md" />
      </article>

      <article class="lp-row lp-row-flip">
        <div class="lp-row-text">
          <h3>Move whole subtrees</h3>
          <p>
            Tab and Shift+Tab move a node with everything under it, wherever the caret is in it. Headings change level
            and their section follows; everything else changes parent. A moved node takes the encoding of its new
            neighbours, so a paragraph indented under a paragraph becomes an item and an item pulled out among
            paragraphs becomes a paragraph. Mod+Shift+Arrow swaps a node with its sibling.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/structural-editing')">Structural editing</a></p>
        </div>
        <OutlineDemo :doc="KITCHEN" :script="MOVE_SCRIPT" autoplay loop />
      </article>

      <article class="lp-row">
        <div class="lp-row-text">
          <h3>Split, continue, join</h3>
          <p>
            Enter splits a node where the caret is and the remainder becomes a sibling or a first child, ordered lists
            renumber, and a task box carries over unchecked. Enter on an empty item walks back out of the nesting.
            Shift+Enter continues the node on a new line, or drafts the next heading. Backspace at a node's first
            character joins it onto the content above, across a blank line, in one keystroke.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/structural-editing#enter')">Enter and Shift+Enter</a></p>
        </div>
        <OutlineDemo :doc="KITCHEN" :script="SPLIT_SCRIPT" autoplay loop />
      </article>

      <article class="lp-row lp-row-flip">
        <div class="lp-row-text">
          <h3>Select by node</h3>
          <p>
            Shift+Arrow grows a selection one node at a time. Mod+A climbs a ladder: the node's text, its subtree, the
            list, the section, the note. A selection dragged across a boundary snaps outward to whole nodes and is drawn
            as a block, and Delete, Cut, Tab and the move commands act on everything it covers.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/selection-and-caret')">Selection and the caret</a></p>
        </div>
        <OutlineDemo :doc="KITCHEN" :script="SELECT_SCRIPT" autoplay loop />
      </article>

      <article class="lp-row">
        <div class="lp-row-text">
          <h3>Zoom into anything</h3>
          <p>
            Click a marker to show one node and its subtree as if it were the whole note. A breadcrumb trail above says
            where the view is and takes it back out. Editing is confined to what is visible, and the outline's depth
            restarts at the zoomed node, so a deeply nested item reads like a top-level one.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/zoom')">Zoom</a></p>
        </div>
        <OutlineDemo :doc="KITCHEN" :script="ZOOM_SCRIPT" autoplay loop />
      </article>

      <article class="lp-row lp-row-flip">
        <div class="lp-row-text">
          <h3>Backlinks in their own tree</h3>
          <p>
            Below every note, each reference to it from elsewhere in the vault is shown in the tree of the note it
            came from: the ancestors above it, the node itself, one level of children. Grouped by note, sortable,
            filterable by kind, folder and tag, and one click from the source. Built on Obsidian's own link index, with
            nothing written to any note.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/backlinks')">Structured backlinks</a></p>
        </div>
        <figure class="lp-shot">
          <img class="lp-img-light" :src="footer.light" alt="The structured backlinks footer below a note, listing references grouped by note, each shown with its ancestors" loading="lazy" />
          <img class="lp-img-dark" :src="footer.dark" alt="" loading="lazy" />
          <figcaption>Captured in Obsidian. The footer needs the vault's link index, so it is not part of the live demo.</figcaption>
        </figure>
      </article>

      <article class="lp-row">
        <div class="lp-row-text">
          <h3>The file stays markdown</h3>
          <p>
            Switch outline mode off and the note is stock Obsidian. Nothing was ever written to the file that Obsidian
            would not have written itself: no identifiers, no fold state, no forced bullets. A structural edit changes
            the lines it moved and nothing else, and indentation follows the note's own style. The note keeps working
            with every other plugin, tool and sync method.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/how-notes-become-outlines')">How a note becomes an outline</a></p>
        </div>
        <OutlineDemo :doc="KITCHEN" :script="TOGGLE_SCRIPT" autoplay loop source />
      </article>

      <article class="lp-row lp-row-flip">
        <div class="lp-row-text">
          <h3>Any theme, desktop and phone</h3>
          <p>
            The outline takes its colours from the theme in use and runs on Obsidian for iOS and Android with the same
            gestures. Every part of it can be retuned from the settings or overridden from a CSS snippet.
          </p>
          <p class="lp-more"><a :href="withBase('/guide/mobile')">Mobile</a> · <a :href="withBase('/reference/css-variables')">CSS variables</a></p>
        </div>
        <figure class="lp-shot lp-shot-phone">
          <img class="lp-img-light" :src="mobile.light" alt="A note in outline mode on a phone" loading="lazy" />
          <img class="lp-img-dark" :src="mobile.dark" alt="" loading="lazy" />
        </figure>
      </article>
    </section>

    <section class="lp-compare">
      <div class="lp-compare-text">
        <h2>Next to the others</h2>
        <p>
          Roam, Tana and Orca Note keep the notes in a database; Logseq keeps them in markdown and writes identifiers
          and fold state into the files to manage. Obsidian's outliner plugins add keys to flat text and do not know
          about headings or paragraphs. True Outliner keeps the tree, keeps the files clean, and treats every block as
          a node.
        </p>
        <p class="lp-more"><a :href="withBase('/guide/compared')">The full comparison</a></p>
      </div>
      <table class="lp-table">
        <thead>
          <tr><th></th><th>Outliner plugin</th><th>Logseq</th><th>True Outliner</th></tr>
        </thead>
        <tbody>
          <tr><td>Notes stay plain markdown</td><td>✓</td><td>with <code>id::</code> lines</td><td>✓</td></tr>
          <tr><td>Headings and paragraphs are nodes</td><td>–</td><td>–</td><td>✓</td></tr>
          <tr><td>Selection snaps to nodes</td><td>–</td><td>✓</td><td>✓</td></tr>
          <tr><td>Zoom into any block</td><td>lists, separate plugin</td><td>✓</td><td>✓</td></tr>
          <tr><td>Backlinks with structure</td><td>–</td><td>✓</td><td>✓ read-only</td></tr>
          <tr><td>Drag and drop</td><td>✓</td><td>✓</td><td>not yet</td></tr>
        </tbody>
      </table>
    </section>

    <section class="lp-install">
      <div>
        <h2>Install</h2>
        <p>
          Not yet in the community plugin directory. Install it through BRAT from the repository, or by hand from the
          <a href="https://github.com/laughedelic/obsidian-true-outliner/releases/latest">latest release</a>.
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
  max-width: 20ch;
}
.lp-lede {
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  color: var(--vp-c-text-2);
  max-width: 62ch;
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
.lp-hero-demo.to-demo-frame {
  margin: 0;
}
.lp-hero-demo .to-demo-body {
  min-height: 26rem;
}

.lp-why {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 3rem;
  align-items: start;
  margin-top: 5rem;
  padding-top: 3rem;
  border-top: 1px solid var(--vp-c-divider);
}
.lp-why h2,
.lp-features-title,
.lp-compare h2,
.lp-install h2 {
  font-size: 1.75rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}
.lp-why-text p {
  max-width: 62ch;
}
.lp-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-top: 1rem !important;
  font-weight: 600;
}
.lp-why-facts {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.9rem;
}
.lp-why-facts li {
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.lp-why-facts strong {
  color: var(--vp-c-text-1);
}

.lp-features {
  margin-top: 5rem;
}
.lp-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 2.5rem;
  align-items: center;
  padding: 2.5rem 0;
  border-top: 1px solid var(--vp-c-divider);
}
.lp-row-flip {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}
.lp-row-flip .lp-row-text {
  order: 2;
}
.lp-row h3 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 0.4rem;
}
.lp-row-text p {
  color: var(--vp-c-text-2);
  max-width: 48ch;
}
.lp-more {
  font-weight: 600;
}
.lp-more a::after {
  content: ' →';
}
.lp-row .to-demo-frame {
  margin: 0;
}
.lp-row .to-demo-body {
  min-height: 20rem;
}
.lp-shot {
  margin: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}
.lp-shot img {
  display: block;
  width: 100%;
  height: auto;
}
.lp-shot figcaption {
  padding: 0.5rem 0.9rem;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.lp-shot-phone {
  max-width: 320px;
  justify-self: center;
}
.lp-img-dark {
  display: none;
}
.dark .lp-img-dark {
  display: block;
}
.dark .lp-img-light {
  display: none;
}

.lp-compare {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 3rem;
  align-items: start;
  margin-top: 4rem;
  padding-top: 3rem;
  border-top: 1px solid var(--vp-c-divider);
}
.lp-compare-text p {
  color: var(--vp-c-text-2);
  max-width: 50ch;
}
.lp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14.5px;
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
.lp-table td:last-child {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.lp-table td:not(:first-child) {
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
  .lp-why,
  .lp-row,
  .lp-row-flip,
  .lp-compare,
  .lp-install {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .lp-row-flip .lp-row-text {
    order: 0;
  }
  .lp-hero-demo .to-demo-body {
    min-height: 20rem;
  }
}
</style>
