<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import BacklinksFooter from './outline/BacklinksFooter.vue';
import OutlineView from './outline/OutlineView.vue';
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <ClientOnly><OutlineView /></ClientOnly>
    </template>
    <template #doc-footer-before>
      <ClientOnly><BacklinksFooter /></ClientOnly>
    </template>
  </DefaultTheme.Layout>
</template>
