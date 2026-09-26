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

  /* DEV DIED OF EMFILE BEFORE IT FINISHED STARTING.
     public/ holds 53,089 files, of which 52,000-odd are the generated name
     shards — public/rs/ alone is 20,198. Vite's dev watcher tries to watch
     the lot, runs the process out of file descriptors, and `astro dev`
     exits before it serves anything. The workaround in use was
     `ulimit -n 20480`, which raises the ceiling without reducing the count
     and has to be remembered by every shell that ever runs the server.

     Nothing is lost by not watching them: they are build output, written by
     scripts/build.py, never edited by hand. If one changes, the page that
     reads it re-fetches on reload, which is what you would do anyway. This
     touches the dev server only — `astro build` does not watch. */
  vite: {
    server: {
      watch: {
        ignored: ['**/site/public/**', '**/dist/**', '**/dist-*/**'],
      },
    },
  },
});
