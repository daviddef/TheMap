/* The HTTP face of the read tools: a small REST API and a remote MCP endpoint over the same functions.
   CORS is open for GET and for the MCP POST because everything here is public, read-only data. Keys are optional (they only
   name the app, and a later step gives them bigger allowances); a key that is sent and wrong is refused. */

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Atlas-Key, Mcp-Session-Id, MCP-Protocol-Version", "Access-Control-Max-Age": "600" };
const jsonRes = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...CORS, ...extra } });
const enc = new TextEncoder();
const sha256Hex = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");

async function appFor(request, env) {
  const k = request.headers.get("X-Atlas-Key");
  if (!k) return { ok: true, app: null };
  let list = []; try { list = JSON.parse(env.APP_KEYS || "[]"); } catch { /* none */ }
  const h = await sha256Hex(k), hit = list.find(a => a && a.sha256 === h);
  return hit ? { ok: true, app: hit.name } : { ok: false };
}

const REST = {
  "given-name": (u, p) => ["atlas_given_name", { name: decodeURIComponent(p[2] || "") }],
  term: u => ["atlas_term", { word: u.searchParams.get("q") || "", record: u.searchParams.get("record") || undefined }],
  date: u => ["atlas_date", { text: u.searchParams.get("text") || "" }],
  providers: u => ["atlas_providers", { country: u.searchParams.get("country") || undefined, access: u.searchParams.get("access") || undefined, q: u.searchParams.get("q") || undefined, limit: u.searchParams.get("limit") || undefined }],
  context: () => ["atlas_context", {}],
};

async function runTool(tools, name, args) {
  const t = tools[name];
  if (!t) return { error: `no such tool: ${name}` };
  return t.run(args || {});
}

async function mcp(tools, request, version) {
  let body; try { body = await request.json(); } catch { return jsonRes({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400, { "Cache-Control": "no-store" }); }
  const one = async m => {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return { jsonrpc: "2.0", id: (m && m.id) ?? null, error: { code: -32600, message: "invalid request" } };
    if (m.id === undefined) return null;                                   // a notification: no reply
    const ok = result => ({ jsonrpc: "2.0", id: m.id, result });
    switch (m.method) {
      case "initialize": return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "record-atlas", version }, instructions: "Read-only questions about the Record Atlas: given-name spellings, what a register word means, date decoding, archives that hold records. An empty answer is not a finding." });
      case "ping": return ok({});
      case "tools/list": return ok({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input })) });
      case "tools/call": {
        const name = m.params && m.params.name;
        if (!tools[name]) return { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: `unknown tool: ${name}` } };
        try { const r = await runTool(tools, name, m.params.arguments); return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 1) }], isError: !!r.error }); }
        catch (e) { return ok({ content: [{ type: "text", text: "The tool failed. Try again." }], isError: true }); }
      }
      default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } };
    }
  };
  const out = Array.isArray(body) ? (await Promise.all(body.map(one))).filter(Boolean) : await one(body);
  if (out === null || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202, headers: CORS });
  return jsonRes(out, 200, { "Cache-Control": "no-store" });
}

export function makeHandler(tools, { version = "1" } = {}) {
  return async function handle(request, env = {}) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const u = new URL(request.url), p = u.pathname.split("/").filter(Boolean);
    const who = await appFor(request, env);
    if (!who.ok) return jsonRes({ error: "unknown app key" }, 401, { "Cache-Control": "no-store" });
    try {
      if (p[0] === "mcp" && p.length === 1) {
        if (request.method === "POST") return await mcp(tools, request, version);
        return new Response("This server answers POST only.", { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
      }
      if (request.method !== "GET") return jsonRes({ error: "GET only" }, 405, { Allow: "GET, OPTIONS" });
      if (p[0] === "v1" && p[1] === "health") return jsonRes({ ok: true, v: 1, tools: Object.keys(tools), app: who.app }, 200, { "Cache-Control": "no-store" });
      if (p[0] === "v1" && p[1] === "tools") return jsonRes({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, input: t.input })) });
      if (p[0] === "v1" && REST[p[1]]) {
        const [tool, args] = REST[p[1]](u, p);
        return jsonRes(await runTool(tools, tool, args));
      }
      return jsonRes({ error: "not found", try: ["/v1/health", "/v1/tools", "/v1/given-name/Ivan", "/v1/term?q=uxoris", "/v1/date?text=die 30 7bris 1671", "/v1/providers?country=HR", "/v1/context", "POST /mcp"] }, 404, { "Cache-Control": "no-store" });
    } catch (e) {
      return jsonRes({ error: "server error" }, 500, { "Cache-Control": "no-store" });
    }
  };
}
