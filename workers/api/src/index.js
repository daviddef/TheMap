/* The Worker entry: wires the tools to the real published files, the bundled terms and the shared finder. */
import "../../../site/public/js/record-reader.js";          // a classic script: it sets globalThis.raReadRecord, whatever module format the bundler reads it as
import terms from "../../../data/record-terms.json" with { type: "json" };
import { makeTools } from "./tools.js";
import { makeHandler } from "./handler.js";

const R = globalThis.raReadRecord;
if (!R) throw new Error("record-reader.js did not load");

const memo = new Map();                                    // parsed files, per isolate, for ten minutes
const TTL = 10 * 60 * 1000;

function loader(env) {
  const origin = (env.SITE_ORIGIN || "https://recordatlas.org").replace(/\/$/, "");
  return async function load(name) {
    const hit = memo.get(name);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const url = `${origin}/${name}`, cache = caches.default;
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url, { cf: { cacheTtl: 3600 } });
      if (!res.ok) throw new Error(`published file ${name}: ${res.status}`);
      const copy = new Response(res.clone().body, res); copy.headers.set("Cache-Control", "public, max-age=3600");
      await cache.put(url, copy);
    }
    const data = await res.json();
    memo.set(name, { at: Date.now(), data });
    return data;
  };
}

export default {
  async fetch(request, env, ctx) {
    const tools = makeTools({ load: loader(env), R, terms: { ...terms, asOf: (terms.sources && Object.values(terms.sources)[0] && Object.values(terms.sources)[0].checked) || null } });
    return makeHandler(tools)(request, env);
  },
};
