<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import AsideBacklinks from './outline/AsideBacklinks.vue';
import BacklinksFooter from './outline/BacklinksFooter.vue';
import OutlineView from './outline/OutlineView.vue';
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <ClientOnly><OutlineView /></ClientOnly>
    </template>
    <template #aside-outline-after>
      <ClientOnly><AsideBacklinks /></ClientOnly>
    </template>
    <template #doc-footer-before>
      <ClientOnly><BacklinksFooter /></ClientOnly>
    </template>
  </DefaultTheme.Layout>
</template>
