/* A very small stand-in for the browser page, enough to run one of the Research page's own scripts in node and look at what it drew: elements with
 * children, classes, attributes, listeners, focus and a selector made of one tag, id, class or [attribute]. Not a test file. */
export function fakeDom() {
  const doc = { activeElement: null, listeners: {}, byId: new Map() };
  const matches = (n, sel) => {
    const m = /^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(sel);
    if (!m) throw new Error("the fake page does not know the selector " + sel);
    const [, tag, id, classes, attr, val] = m;
    if (tag && n.tagName !== tag.toUpperCase()) return false;
    if (id && n.id !== id.slice(1)) return false;
    for (const c of (classes || "").split(".").filter(Boolean)) if (!n.classList.contains(c)) return false;
    if (attr && (!n.hasAttribute(attr) || (val !== undefined && n.getAttribute(attr) !== val))) return false;
    return true;
  };
  function node(tag) {
    const n = {
      tagName: tag.toUpperCase(), children: [], parentNode: null, attrs: {}, listeners: {}, style: {}, className: "", id: "", hidden: false, open: false, _text: "", scrolled: 0,
      get textContent() { return n._text + n.children.map(c => c.textContent).join(""); },
      set textContent(v) { n.children.forEach(c => { c.parentNode = null; }); n.children = []; n._text = v == null ? "" : String(v); },
      classList: {
        contains: c => n.className.split(/\s+/).includes(c),
        add: (...cs) => { for (const c of cs) if (!n.classList.contains(c)) n.className = (n.className + " " + c).trim(); },
        remove: (...cs) => { n.className = n.className.split(/\s+/).filter(c => c && !cs.includes(c)).join(" "); },
        toggle: (c, on) => { const want = on === undefined ? !n.classList.contains(c) : !!on; want ? n.classList.add(c) : n.classList.remove(c); return want; },
      },
      append(...kids) { for (let k of kids) { if (typeof k === "string") { const t = node("#text"); t._text = k; k = t; } if (k.parentNode) k.remove(); k.parentNode = n; n.children.push(k); } },
      appendChild(k) { n.append(k); return k; },
      insertBefore(k, ref) { if (k.parentNode) k.remove(); const i = ref ? n.children.indexOf(ref) : -1; k.parentNode = n; if (i < 0) n.children.push(k); else n.children.splice(i, 0, k); return k; },
      replaceWith(k) { const p = n.parentNode; if (!p) return; if (k.parentNode) k.remove(); const i = p.children.indexOf(n); p.children[i] = k; k.parentNode = p; n.parentNode = null; },
      replaceChildren(...kids) { n.textContent = ""; n.append(...kids); },
      remove() { const p = n.parentNode; if (!p) return; p.children.splice(p.children.indexOf(n), 1); n.parentNode = null; },
      setAttribute(k, v) { n.attrs[k] = String(v); if (k === "id") n.id = String(v); if (k === "class") n.className = String(v); },
      getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
      hasAttribute(k) { return k in n.attrs; },
      removeAttribute(k) { delete n.attrs[k]; },
      addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); },
      fire(t, e) { const ev = Object.assign({ target: n, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, e || {}); (n.listeners[t] || []).forEach(f => f.call(n, ev)); if (typeof n["on" + t] === "function") n["on" + t](ev); return ev; },
      click() { n.fire("click"); },
      focus() { doc.activeElement = n; },
      contains(o) { for (let x = o; x; x = x.parentNode) if (x === n) return true; return false; },
      closest(sel) { for (let x = n; x; x = x.parentNode) if (matches(x, sel)) return x; return null; },
      querySelectorAll(sel) { const out = []; const walk = x => x.children.forEach(c => { if (c.tagName !== "#TEXT" && matches(c, sel)) out.push(c); walk(c); }); walk(n); return out; },
      querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
      scrollIntoView() { n.scrolled++; },
      getBoundingClientRect() { return { top: 100, left: 20, right: 220, bottom: 130, width: 200, height: 30 }; },
    };
    return n;
  }
  doc.createElement = node;
  doc.createTextNode = t => { const n = node("#text"); n._text = String(t); return n; };
  doc.body = node("body");
  doc.documentElement = Object.assign(node("html"), { clientWidth: 1000 });
  doc.getElementById = id => doc.body.querySelector("#" + id);
  doc.addEventListener = (t, f) => { (doc.listeners[t] = doc.listeners[t] || []).push(f); };
  doc.dispatchEvent = e => { (doc.listeners[e.type] || []).forEach(f => f(e)); return true; };
  doc.add = (tag, id) => { const n = node(tag); if (id) n.id = id; doc.body.append(n); return n; };
  return doc;
}
export function fakeStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
