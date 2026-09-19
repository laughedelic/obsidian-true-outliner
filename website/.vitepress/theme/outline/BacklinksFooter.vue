<script setup lang="ts">
/**
 * The structured backlinks footer of a docs page: the nodes of other pages
 * that link here, each in its lineage with one level of its children, grouped
 * by page. Shown in outline view only, as the plugin shows its own.
 */
import { computed, watch } from 'vue';
import { useData, useRouter, withBase } from 'vitepress';
import { data, type BacklinkGroup, type BacklinkRow } from './backlinks.data';
import { ICONS } from './icons';
import { closedGroups as closed, footerOpen as open, outlineOn, pendingFlash } from './state';

const { frontmatter, page } = useData();
const router = useRouter();

const key = computed(() => `/${page.value.relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1')}`);
const groups = computed<BacklinkGroup[]>(() => data[key.value] ?? []);
const total = computed(() => groups.value.reduce((n, g) => n + g.count, 0));
const shown = computed(() => outlineOn.value && frontmatter.value.outlineView !== false);

watch(key, () => {
  open.value = true;
  closed.clear();
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function toggleGroup(url: string) {
  if (closed.has(url)) closed.delete(url);
  else closed.add(url);
}

function follow(event: MouseEvent | KeyboardEvent, group: BacklinkGroup, row: BacklinkRow) {
  if ((event.target as Element).closest('a')) return;
  const url = withBase(group.url + row.hash);
  if (event.metaKey || event.ctrlKey) {
    window.open(url, '_blank');
    return;
  }
  pendingFlash.value = { path: withBase(group.url), text: row.text };
  void router.go(url);
}
</script>

<template>
  <section v-if="shown" class="to-o-backlinks" :class="{ 'is-folded': !open }" aria-label="Structured backlinks">
    <button type="button" class="to-o-bl-header" :aria-expanded="open" @click="open = !open">
      <span class="to-o-bl-chevron" :class="{ 'is-folded': !open }" aria-hidden="true" v-html="ICONS.chevron"></span>
      <span class="to-o-bl-icon" aria-hidden="true" v-html="ICONS.link"></span>
      <span class="to-o-bl-title">Structured backlinks</span>
      <span class="to-o-bl-totals">
        <template v-if="total">{{ plural(total, 'reference') }} · {{ plural(groups.length, 'note') }}</template>
        <template v-else>0 references</template>
      </span>
    </button>
    <template v-if="open">
      <div v-for="g in groups" :key="g.url" class="to-o-bl-group" :data-url="g.url">
        <button type="button" class="to-o-bl-group-head" :aria-expanded="!closed.has(g.url)" @click="toggleGroup(g.url)">
          <span class="to-o-bl-chevron" :class="{ 'is-folded': closed.has(g.url) }" aria-hidden="true" v-html="ICONS.chevron"></span>
          <span class="to-o-bl-note">{{ g.title }}</span>
          <span class="to-o-bl-folder">{{ g.folder }}</span>
          <span class="to-o-bl-count">{{ g.count }}</span>
        </button>
        <div v-if="!closed.has(g.url)" class="to-o-bl-rows">
          <div
            v-for="(row, i) in g.rows"
            :key="i"
            class="to-o-bl-row"
            :class="{ 'is-dim': row.dim }"
            :style="{ '--to-o-d': row.depth }"
            role="link"
            tabindex="0"
            @click="follow($event, g, row)"
            @keydown.enter="follow($event, g, row)"
          >
            <span v-for="d in row.depth" :key="d" class="to-o-bl-guide" :style="{ '--to-o-g': d - 1 }" aria-hidden="true"></span>
            <span class="to-o-bl-mark" :class="{ 'is-ordinal': !!row.ordinal, 'is-item': row.kind === 'item' }" aria-hidden="true">
              <template v-if="row.ordinal">{{ row.ordinal }}</template>
              <span v-else v-html="ICONS[row.kind]"></span>
            </span>
            <span class="to-o-bl-text">
              <span v-html="row.html"></span>
              <span v-if="row.hidden" class="to-o-count">{{ row.hidden }}</span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
