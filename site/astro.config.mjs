import { defineConfig } from 'astro/config';

/* GitHub Pages project site. When recordatlas.org is bought and pointed here,
   set base to '/' and site to 'https://recordatlas.org' — nothing else moves,
   because every internal link goes through lib/url.js. */
export default defineConfig({
  site: 'https://daviddef.github.io',
  base: '/TheMap',
  build: { format: 'directory' },

  /* SCOPE STYLES WITH A CLASS, NOT A LONG ATTRIBUTE ON EVERY ELEMENT.
     Astro's default writes `data-astro-cid-v66fqpgh` onto each element a
     scoped style touches. On one surname page that is 133 occurrences and
     2,784 bytes — 15% of an 18 KB page — and there are roughly 25,000 pages.
     'class' emits a short class instead, with the same specificity as the
     attribute selector it replaces, so nothing about the cascade changes.
     ('where' would be smaller still, but it drops specificity to zero and
     that does change which rule wins.) */
  scopedStyleStrategy: 'class',
});
