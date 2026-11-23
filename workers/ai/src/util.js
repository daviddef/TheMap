/* Small helpers shared by the handler and the admin routes. */
export const enc = new TextEncoder();
export const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export const json = (obj, status, extra) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
/* one Durable Object per counted thing: "site", "ip:<hash>", "id:<ai id>", and the two records of this file's neighbours: "admin" (config) and "stats" */
export const stub = (env, name) => env.ALLOW.get(env.ALLOW.idFromName(name));
