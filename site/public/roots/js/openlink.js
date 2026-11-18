/* openlink.js — open a public GEDCOM or tree.json from a web address, from the visitor's own browser.
 *
 * Pure apart from the `fetch` it is given: no DOM, so the same file runs in the page (public/tree-canvas/app.js) and in node (site/test/openlink.test.js).
 * Nothing goes through this site's server: the browser asks the other site directly. That site can therefore see that this visitor asked for the file (their
 * address and the time, as for any link), and nothing from the visitor's tree is sent to it.
 *
 *   parseLink(text)        → { ok, url, host, note } | { ok:false, error }     what may be fetched at all (https only, a named public host, no sign-in details)
 *   fetchBytes(url, opt)   → { ok, bytes, host } | { ok:false, error, kind }   the fetch, with a size cap, a time limit and a check of where redirects ended
 *   fileNameOf(url, host)  → a short, plain name to show in the "last used" list
 *
 * What it will not do: fetch http://, an address with a user name or password in it, a port other than 443, "localhost", a bare IP address, or a name that only
 * means something on a home or office network. It sends no cookies and no referrer, follows redirects only while they stay on https, and stops at 100 MB.
 * The reply is only ever read as data: it is never run, and a web page (the usual mistake: a github.com page, not the file) is refused with a plain explanation. */

export const MAX_BYTES = 100 * 1024 * 1024;
export const TIMEOUT_MS = 60000;
const MAX_LINK = 2000;

const NETWORK_ONLY = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|test|invalid|example)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/* the host part is a public name: letters, digits and hyphens in labels, at least one dot, a letter-only last label */
function hostOk(h) {
  return typeof h === 'string' && h.length <= 253 && h.includes('.') && !h.includes(':') && !IPV4.test(h) && !NETWORK_ONLY.test(h)
    && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i.test(h);
}

/* `opt.origin` is this page's own address, passed by the page itself (never by the visitor): a file on that same site is allowed whatever its host, which is how the
   page's own example files load by link (and how they load on a local preview). */
export function parseLink(text, opt = {}) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { ok: false, error: 'Paste the address of a GEDCOM or tree.json file first.' };
  if (raw.length > MAX_LINK) return { ok: false, error: 'That address is too long to be a link to a file.' };
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return { ok: false, error: 'That address has a space or a hidden character in it. Copy it again from the page it is on.' };
  let u;
  try { u = new URL(raw); } catch (e) { return { ok: false, error: 'That does not look like a web address. It should start with https://' }; }
  if (opt.origin && u.origin === opt.origin) { u.hash = ''; return { ok: true, url: u.href, host: u.hostname.toLowerCase(), note: '', same: true }; }
  if (u.protocol === 'http:') return { ok: false, error: 'Only https:// addresses are opened, so the file cannot be changed on the way. Try the same address with https://.' };
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https:// addresses are opened.' };
  if (u.username || u.password) return { ok: false, error: 'An address with a user name or password in it is not opened. Use a link that is public.' };
  if (u.port && u.port !== '443') return { ok: false, error: 'Only ordinary https addresses are opened (no special port).' };
  const host = u.hostname.toLowerCase();
  if (!hostOk(host)) return { ok: false, error: 'That address is not a public website (a home or office network address, "localhost" or a bare IP address is not opened).' };
  u.hash = '';
  let note = '';
  /* the usual mistake: the github.com page for a file, which is a web page. Its raw address is the file itself. */
  if (host === 'github.com' || host === 'www.github.com') {
    const s = u.pathname.split('/').filter(Boolean);
    if (s.length >= 5 && (s[2] === 'blob' || s[2] === 'raw')) {
      u = new URL('https://raw.githubusercontent.com/' + [s[0], s[1], ...s.slice(3)].map(encodeURIComponent).join('/'));
      note = 'That was the github.com page for the file, so its raw address was used instead.';
    }
  }
  return { ok: true, url: u.href, host: u.hostname.toLowerCase(), note };
}

export function fileNameOf(url, host) {
  let n = '';
  try { n = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch (e) { n = ''; }
  n = n.replace(/[^\p{L}\p{N} ._()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return n || ('file from ' + host);
}

const STATUS = {
  401: 'That file asks for a sign-in, which this page never sends. Use a public link.',
  403: 'The site refused to give the file out (a private file, or one that needs a sign-in).',
  404: 'There is no file at that address (404). Check it for a typo, or that the repository and file are public.',
  410: 'That file has been removed (410).',
  429: 'The site says there have been too many requests (429). Try again in a few minutes.',
};

/* `fetchImpl` is the page's fetch (a function in the tests). Returns the bytes, or a sentence that says what to do about it. */
export async function fetchBytes(url, opt = {}) {
  const f = opt.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null), max = opt.max || MAX_BYTES, ms = opt.timeout || TIMEOUT_MS;
  const first = parseLink(url, opt);
  if (!first.ok) return { ok: false, error: first.error, kind: 'address' };
  if (!f) return { ok: false, error: 'This browser cannot fetch a link.', kind: 'browser' };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  const mb = n => (n / 1048576).toFixed(0);
  try {
    let res;
    try {
      res = await f(first.url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', cache: 'no-store', mode: 'cors', signal: ctl.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout', error: 'That site took more than a minute to answer, so the link was dropped.' };
      return { ok: false, kind: 'cors', error: 'Your browser could not read that link. Either the address is wrong, or the site does not let other websites read its files (it must send an Access-Control-Allow-Origin header; raw.githubusercontent.com and GitHub Pages do; for a file on GitHub, use its Raw address, not its github.com page). You can always download the file and drop it on this page instead.' };
    }
    /* where the redirects ended: still https, still a public name */
    if (res.url) { const fin = parseLink(res.url, opt); if (!fin.ok) return { ok: false, kind: 'redirect', error: 'The link led somewhere that is not opened: ' + fin.error }; }
    if (!res.ok) return { ok: false, kind: 'status', error: STATUS[res.status] || ('The site answered ' + res.status + ' instead of the file.') };
    const len = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (Number.isFinite(len) && len > max) return { ok: false, kind: 'size', error: 'That file is ' + mb(len) + ' MB, over the ' + mb(max) + ' MB this page will fetch from a link. Download it and drop it on this page instead.' };
    let bytes;
    if (res.body && res.body.getReader) {
      const rd = res.body.getReader(), parts = []; let got = 0;
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        got += value.byteLength;
        if (got > max) { try { await rd.cancel(); } catch (e) { /* already closed */ } return { ok: false, kind: 'size', error: 'That file is bigger than the ' + mb(max) + ' MB this page will fetch from a link. Download it and drop it on this page instead.' }; }
        parts.push(value);
      }
      const all = new Uint8Array(got); let at = 0; for (const p of parts) { all.set(p, at); at += p.byteLength; }
      bytes = all.buffer;
    } else {
      bytes = await res.arrayBuffer();
      if (bytes.byteLength > max) return { ok: false, kind: 'size', error: 'That file is bigger than the ' + mb(max) + ' MB this page will fetch from a link.' };
    }
    if (!bytes.byteLength) return { ok: false, kind: 'empty', error: 'That address gave an empty file.' };
    const head = new TextDecoder('utf-8').decode(new Uint8Array(bytes, 0, Math.min(512, bytes.byteLength)));
    if (/^﻿?\s*<(!doctype|html|head|body|\?xml)/i.test(head)) return { ok: false, kind: 'page', error: 'That address is a web page, not the file itself. For a file on GitHub, open the file and press "Raw", then copy that address.' };
    return { ok: true, bytes, host: first.host, finalHost: res.url ? new URL(res.url).hostname.toLowerCase() : first.host };
  } finally { clearTimeout(timer); }
}
