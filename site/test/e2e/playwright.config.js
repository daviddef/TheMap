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
  use: {
    baseURL: process.env.RA_BASE || "http://localhost:4332",
    headless: true,
  },
  webServer: process.env.RA_BASE ? undefined : {
    command: "npm run preview",
    url: "http://localhost:4332/TheMap/",
    reuseExistingServer: true,
    timeout: 120000,
  },
};
