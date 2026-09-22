import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Clip from './Clip.vue';
import Shot from './Shot.vue';
import './media.css';

// The default theme plus two components for the media captured from real
// Obsidian by `website/capture/`: raw `<video>` and `<img>` markup in markdown
// is served from the site root, not from `base`, and these resolve it.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Clip', Clip);
    app.component('Shot', Shot);
  },
} satisfies Theme;
