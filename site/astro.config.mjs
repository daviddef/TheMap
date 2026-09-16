import { defineConfig } from 'astro/config';

/* GitHub Pages project site. When recordatlas.org is bought and pointed here,
   set base to '/' and site to 'https://recordatlas.org' — nothing else moves,
   because every internal link goes through lib/url.js. */
export default defineConfig({
  site: 'https://daviddef.github.io',
  base: '/TheMap',
  build: { format: 'directory' },
});
