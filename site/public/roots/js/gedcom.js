/* Lossless GEDCOM reader. Runs in a Web Worker in the page and under Node in the tests: no DOM, no network.

   parseGedcom(bytes) keeps every original line, in order, so an export can be a patch of the input rather than a regeneration:
     lines[i]   the decoded text of line i, exactly as read (no line ending)
     nodes      the level-0 records; each node is {lvl, xref, tag, val, kids, ln} where ln indexes lines[]
     junk       indexes of lines that were not GEDCOM lines at all (kept in lines[], never dropped)
     eol, bom   how the file ended its lines and whether it began with a byte-order mark
     report     what was tolerated: encoding, bytes re-read as Windows-1252, lines that did not parse, CONC/CONT counts
   serialize(parsed) puts the lines back together; with nothing changed it equals the decoded input. */

const LINE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z_0-9]+)(?:\s(.*))?$/;

function sniffHeader(bytes) {            // the CHAR value as the file itself declares it, read as Latin-1
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const m = /^\s*1\s+CHAR\s+([^\r\n]+)/m.exec(head);
  const v = /^\s*1\s+GEDC\b/m.test(head) ? (/^\s*2\s+VERS\s+([^\r\n]+)/m.exec(head) || [])[1] : null;
  return { char: m ? m[1].trim().toUpperCase() : null, vers: v ? v.trim() : null };
}

export function decodeBytes(bytes) {
  const rep = { bom: false, declared: null, used: 'utf-8', invalidBytes: 0, relinedLines: 0 };
  let start = 0, text;
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { rep.bom = true; start = 3; }
  if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) {
    rep.bom = true; rep.used = bytes[0] === 0xFF ? 'utf-16le' : 'utf-16be';
    return { text: new TextDecoder(rep.used).decode(bytes.subarray(2)), rep };
  }
  const body = bytes.subarray(start);
  const sn = sniffHeader(body); rep.declared = sn.char; rep.version = sn.vers;
  const legacy = sn.char && /^(ANSI|ASCII|ANSEL|WINDOWS|CP1252|IBM|LATIN|ISO)/.test(sn.char);
  if (legacy) { rep.used = 'windows-1252'; return { text: new TextDecoder('windows-1252').decode(body), rep }; }
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); return { text, rep }; }
  catch (e) { /* mixed encodings: go line by line */ }
  // Mixed file: decode each line as UTF-8, and a line that is not valid UTF-8 as Windows-1252, counting what was re-read.
  const strict = new TextDecoder('utf-8', { fatal: true }), loose = new TextDecoder('utf-8'), w1252 = new TextDecoder('windows-1252');
  const out = []; let s = 0, segN = 0; rep.relinedAt = [];
  for (let i = 0; i <= body.length; i++) {
    if (i === body.length || body[i] === 0x0A) {
      if (i === body.length && s === i) break;
      const seg = body.subarray(s, i);
      try { out.push(strict.decode(seg)); }
      catch (e) {
        rep.relinedLines++; rep.relinedAt.push(segN);
        let bad = 0; const t = loose.decode(seg); for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 0xFFFD) bad++;
        rep.invalidBytes += bad; out.push(w1252.decode(seg));
      }
      s = i + 1; segN++;
      if (i < body.length) out.push('\n');
    }
  }
  rep.used = 'utf-8 + windows-1252 for ' + rep.relinedLines + ' line' + (rep.relinedLines === 1 ? '' : 's');
  return { text: out.join(''), rep };
}

export function parseGedcom(bytes) {
  const { text, rep } = decodeBytes(bytes);
  const crlf = text.indexOf('\r\n') >= 0, eol = crlf ? '\r\n' : (text.indexOf('\n') >= 0 ? '\n' : (text.indexOf('\r') >= 0 ? '\r' : '\n'));
  const endsWithEol = text.endsWith(eol);
  const lines = (endsWithEol ? text.slice(0, -eol.length) : text).split(eol);
  const nodes = [], stack = [], junk = [];
  let conc = 0, cont = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = LINE.exec(lines[i]);
    if (!m) { junk.push(i); continue; }
    const lvl = +m[1], n = { lvl, xref: m[2] || null, tag: m[3], val: m[3] === 'CONC' || m[3] === 'CONT' ? (m[4] || '') : (m[4] || '').trim(), kids: [], ln: i };
    if (n.tag === 'CONC') conc++; else if (n.tag === 'CONT') cont++;
    while (stack.length > lvl) stack.pop();
    if (lvl === 0) nodes.push(n); else if (stack.length) stack[stack.length - 1].kids.push(n); else junk.push(i);
    stack.push(n);
  }
  const report = { ...rep, eol: crlf ? 'CRLF' : eol === '\r' ? 'CR' : 'LF', lines: lines.length, records: nodes.length, junkLines: junk.length, conc, cont };
  return { lines, nodes, junk, eol, bom: rep.bom, endsWithEol, report };
}

export const serialize = p => (p.bom ? '﻿' : '') + p.lines.join(p.eol) + (p.endsWithEol ? p.eol : '');

export const get = (n, tag) => n.kids.find(k => k.tag === tag) || null;
export const all = (n, tag) => n.kids.filter(k => k.tag === tag);
export function text(n) {                 // the value with its CONC (joined) and CONT (new line) continuations
  let out = n.val;
  for (const k of n.kids) { if (k.tag === 'CONC') out += k.val; else if (k.tag === 'CONT') out += '\n' + k.val; }
  return out;
}
