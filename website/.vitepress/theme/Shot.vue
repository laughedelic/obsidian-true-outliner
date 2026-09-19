<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import { data as sizes } from './media.data';

// A still from `website/public/media/shots/`, in the variant matching the
// site's colour scheme — the same mount-then-swap as Clip.vue. `width` caps
// the figure for a portrait phone capture that would otherwise fill the page.
const props = defineProps<{ name: string; alt: string; caption?: string; width?: string }>();
const { isDark } = useData();
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const size = computed(() => sizes[`shots/${props.name}-light`]);
const src = computed(() =>
  withBase(`/media/shots/${props.name}-${mounted.value && isDark.value ? 'dark' : 'light'}.png`),
);
</script>

<template>
  <figure class="media media-shot" :style="width ? { maxWidth: `${width}px` } : undefined">
    <img :src="src" :alt="alt" :width="size?.width" :height="size?.height" loading="lazy" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
