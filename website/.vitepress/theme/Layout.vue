<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import OutlineView from './outline/OutlineView.vue';
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <ClientOnly><OutlineView /></ClientOnly>
    </template>
  </DefaultTheme.Layout>
</template>
