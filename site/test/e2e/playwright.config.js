/* Runs against a built site, not the dev server: dev has bitten this
   project twice with stale HMR state — once serving a page with no
   stylesheet at all, which looked exactly like a CSS bug and was not.
   A third reason arrived today: `astro dev` now dies of EMFILE before it
   finishes starting, because Vite watches public/ and public/ holds about
   sixty thousand shard files. `astro preview` watches nothing.
   Port 4332, which is what `npm run preview` binds — 4330 is the dev
   server's and the two would fight. */
export default {
  testDir: ".",
  timeout: 90000,
  /* Against the live site (RA_BASE) a test that fails once is run again: a one-off slow CDN or runner is not a regression, and a real
     one fails twice. 82 issue comments between 6 October and 7 November were mostly the first kind. Locally nothing is retried. */
  retries: process.env.RA_BASE ? 1 : 0,
  use: {
    baseURL: process.env.RA_BASE || "http://localhost:4332",
    headless: true,
  },
  webServer: process.env.RA_BASE ? undefined : {
    command: "npm run preview",
    url: "http://localhost:4332/",
    reuseExistingServer: true,
    timeout: 120000,
  },
};
