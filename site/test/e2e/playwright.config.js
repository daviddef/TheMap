/* Runs against a built site, not the dev server: dev has bitten this
   project twice with stale HMR state — once serving a page with no
   stylesheet at all, which looked exactly like a CSS bug and was not. */
export default {
  testDir: ".",
  timeout: 90000,
  use: {
    baseURL: process.env.RA_BASE || "http://localhost:4330",
    headless: true,
  },
  webServer: process.env.RA_BASE ? undefined : {
    command: "npm run preview",
    url: "http://localhost:4330/TheMap/",
    reuseExistingServer: true,
    timeout: 120000,
  },
};
