<script setup lang="ts">
/**
 * The page's backlinks in the aside, under its table of contents: one line
 * per referencing page, leading to that page's card in the footer.
 */
import { computed, nextTick } from 'vue';
import { useData } from 'vitepress';
import { data, type BacklinkGroup } from './backlinks.data';
import { closedGroups, footerOpen, outlineOn } from './state';

const { frontmatter, page } = useData();
const key = computed(() => `/${page.value.relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')}`);
const groups = computed<BacklinkGroup[]>(() => data[key.value] ?? []);
const total = computed(() => groups.value.reduce((n, g) => n + g.count, 0));
const shown = computed(() => outlineOn.value && frontmatter.value.outlineView !== false && groups.value.length > 0);

function reveal(group: BacklinkGroup) {
  footerOpen.value = true;
  closedGroups.delete(group.url);
  void nextTick(() => {
    const card = document.querySelector<HTMLElement>(`.to-o-bl-group[data-url="${group.url}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('is-hit');
    void card.offsetWidth;
    card.classList.add('is-hit');
  });
}
</script>

<template>
  <nav v-if="shown" class="to-o-aside-bl" aria-label="Backlinks">
    <p class="to-o-aside-title">Backlinks <span class="to-o-aside-count">{{ total }}</span></p>
    <ul>
      <li v-for="g in groups" :key="g.url">
        <a :href="`#backlinks`" @click.prevent="reveal(g)">
          <span class="to-o-aside-note">{{ g.title }}</span>
          <span class="to-o-aside-count">{{ g.count }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
