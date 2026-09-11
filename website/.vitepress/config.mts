import { defineConfig } from 'vitepress';

// Served from GitHub Pages under the repository path, so every internal link
// and asset URL has to carry the base. The deploy workflow builds with the
// same value, and `vitepress dev` serves the site at it too.
export default defineConfig({
  title: 'True Outliner',
  description: 'A true outliner for Obsidian — any note, plain markdown, structure that cannot break.',
  base: '/obsidian-true-outliner/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: false,
  head: [['link', { rel: 'icon', href: '/obsidian-true-outliner/favicon.svg', type: 'image/svg+xml' }]],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
      { text: 'Reference', link: '/reference/settings', activeMatch: '^/reference/' },
      { text: 'Releases', link: 'https://github.com/laughedelic/obsidian-true-outliner/releases' },
    ],
    sidebar: {
      '/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'How a note becomes an outline', link: '/guide/how-notes-become-outlines' },
            { text: 'Outline mode', link: '/guide/outline-mode' },
            { text: 'Structural editing', link: '/guide/structural-editing' },
            { text: 'Selection and the caret', link: '/guide/selection-and-caret' },
            { text: 'Appearance', link: '/guide/appearance' },
            { text: 'Folding', link: '/guide/folding' },
            { text: 'Zoom', link: '/guide/zoom' },
            { text: 'Structured backlinks', link: '/guide/backlinks' },
            { text: 'Mobile', link: '/guide/mobile' },
            { text: 'Compared to other outliners', link: '/guide/compared' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Settings', link: '/reference/settings' },
            { text: 'Commands and keys', link: '/reference/commands-and-keys' },
            { text: 'CSS variables', link: '/reference/css-variables' },
            { text: 'Known limitations', link: '/reference/limitations' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/laughedelic/obsidian-true-outliner' }],
    editLink: {
      pattern: 'https://github.com/laughedelic/obsidian-true-outliner/edit/main/website/:path',
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'True Outliner is an independent plugin, not affiliated with Obsidian.',
    },
    outline: { level: [2, 3] },
  },
});
