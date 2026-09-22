<script setup lang="ts">
/**
 * An invitation, inside a page, to read the docs as the outline they are. The
 * default slot replaces the opening line where a page has something more
 * specific to point at.
 */
import { outlineOn, setView } from './state';
</script>

<template>
  <div class="tip custom-block to-o-invite">
    <p class="custom-block-title">This documentation is its own demo</p>
    <p>
      <slot>
        Every page of these docs can be read as an outline, drawn the way the plugin draws a note: one grid, a marker per
        block, guides, folding, zoom and a backlinks footer.
      </slot>
    </p>
    <p>
      <button type="button" class="to-o-invite-btn" :aria-pressed="outlineOn" @click="setView(!outlineOn)">
        {{ outlineOn ? 'Back to long-form' : 'Switch this page to outline view' }}
      </button>
      <span class="to-o-invite-where">The same switch sits at the bottom right of every page.</span>
    </p>
    <p class="to-o-invite-note">
      The outline view here is a best-effort rendition in the browser, meant to give the idea. Details differ in Obsidian,
      where the outline is also editable.
    </p>
  </div>
</template>
