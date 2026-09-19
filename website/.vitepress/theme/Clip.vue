<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import { data as sizes } from './media.data';

// A silent looping clip from `website/public/media/clips/`, in the variant
// matching the site's colour scheme. The server renders the light one and the
// dark one is swapped in after mount, so the markup hydrates without a
// mismatch and the video element is recreated when its sources change.
const props = defineProps<{ name: string; caption?: string }>();
const { isDark } = useData();
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const size = computed(() => sizes[`clips/${props.name}-light`]);
const variant = computed(() => `${props.name}-${mounted.value && isDark.value ? 'dark' : 'light'}`);
const url = (ext: string) => withBase(`/media/clips/${variant.value}.${ext}`);
</script>

<template>
  <figure class="media media-clip">
    <video :key="variant" autoplay loop muted playsinline :poster="url('png')" :width="size?.width" :height="size?.height">
      <source :src="url('webm')" type="video/webm" />
      <source :src="url('mp4')" type="video/mp4" />
    </video>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
