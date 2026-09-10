import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Clip from './Clip.vue';
import Shot from './Shot.vue';
import OutlineDemo from '../components/OutlineDemo.vue';
import Landing from '../components/Landing.vue';
import './media.css';
import './custom.css';

// The default theme plus the site's own components: `Clip` and `Shot` for the
// media captured from real Obsidian by `website/capture/` (raw `<video>` and
// `<img>` markup in markdown is served from the site root, not from `base`,
// and these resolve it), `OutlineDemo` for the live editor, and the front page.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Clip', Clip);
    app.component('Shot', Shot);
    app.component('OutlineDemo', OutlineDemo);
    app.component('Landing', Landing);
  },
} satisfies Theme;
